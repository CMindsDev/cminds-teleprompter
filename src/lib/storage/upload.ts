/**
 * Subida de grabaciones al bucket.
 *
 * Estado actual: preparado pero inactivo. Con
 * `PUBLIC_STORAGE_PROVIDER="none"` (valor por defecto) las grabaciones se
 * quedan en IndexedDB y se descargan localmente — no sale nada del navegador.
 *
 * Para activarlo:
 *   1. Rellena las credenciales del bucket en `.env` y pon
 *      `PUBLIC_STORAGE_PROVIDER` a "s3" | "r2" | "supabase" | "gcs".
 *   2. Cambia `output: 'static'` por `output: 'server'` en `astro.config.mjs`
 *      y añade el adaptador de tu plataforma.
 *   3. Crea `src/pages/api/upload-url.ts` que firme la URL en el servidor
 *      (las credenciales NO deben llegar al navegador).
 *   4. Aplica la política CORS: `node scripts/apply-bucket-cors.mjs`.
 */
import { isOriginAllowed } from './cors';

export type StorageProvider = 'none' | 's3' | 'r2' | 'supabase' | 'gcs';

export const provider = (): StorageProvider =>
  (import.meta.env.PUBLIC_STORAGE_PROVIDER as StorageProvider) || 'none';

export const isUploadEnabled = (): boolean => provider() !== 'none';

const maxUploadBytes = (): number => Number(import.meta.env.PUBLIC_MAX_UPLOAD_MB ?? 512) * 1024 * 1024;

export interface UploadResult {
  url: string;
  key: string;
}

export interface UploadOptions {
  onProgress?: (ratio: number) => void;
  signal?: AbortSignal;
}

/** Respuesta esperada del endpoint que firma la subida. */
interface SignedUpload {
  uploadUrl: string;
  key: string;
  publicUrl: string;
  method?: 'PUT' | 'POST';
  headers?: Record<string, string>;
}

/**
 * Sube un blob y devuelve su URL pública.
 * Lanza si el proveedor está desactivado, el origen no está autorizado o el
 * archivo supera el límite configurado.
 */
export async function uploadRecording(
  blob: Blob,
  filename: string,
  { onProgress, signal }: UploadOptions = {},
): Promise<UploadResult> {
  if (!isUploadEnabled()) {
    throw new Error('La subida al bucket está desactivada (PUBLIC_STORAGE_PROVIDER="none").');
  }
  if (!isOriginAllowed(window.location.origin)) {
    throw new Error(`El dominio ${window.location.origin} no está en PUBLIC_ALLOWED_ORIGINS.`);
  }
  if (blob.size > maxUploadBytes()) {
    throw new Error(`El archivo supera el límite de ${import.meta.env.PUBLIC_MAX_UPLOAD_MB} MB.`);
  }

  const signed = await fetch('/api/upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename, contentType: blob.type, size: blob.size }),
    signal,
  });
  if (!signed.ok) throw new Error(`No se pudo firmar la subida (${signed.status}).`);

  const { uploadUrl, key, publicUrl, method = 'PUT', headers = {} }: SignedUpload = await signed.json();

  // XHR en lugar de fetch: es la única forma de tener progreso de subida.
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, uploadUrl);
    xhr.setRequestHeader('Content-Type', blob.type || 'application/octet-stream');
    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`La subida falló (${xhr.status}).`));
    xhr.onerror = () => reject(new Error('Error de red durante la subida.'));
    xhr.onabort = () => reject(new Error('Subida cancelada.'));
    signal?.addEventListener('abort', () => xhr.abort());

    xhr.send(blob);
  });

  return { url: publicUrl, key };
}
