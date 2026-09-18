/**
 * Dominios autorizados para el bucket de multimedia.
 *
 * Única fuente de verdad: la variable `PUBLIC_ALLOWED_ORIGINS`. La consumen
 * tanto el cliente (para validar antes de subir) como el script de
 * `scripts/apply-bucket-cors.mjs`, que escribe la política CORS en el bucket.
 */

/** Normaliza a origen puro (`https://host:puerto`), sin ruta ni slash final. */
export function normalizeOrigin(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`).origin;
  } catch {
    return null;
  }
}

/** Lee y normaliza la lista de orígenes autorizados. */
export function allowedOrigins(raw = import.meta.env.PUBLIC_ALLOWED_ORIGINS ?? ''): string[] {
  const list = String(raw)
    .split(',')
    .map(normalizeOrigin)
    .filter((origin): origin is string => Boolean(origin));
  return [...new Set(list)];
}

export function isOriginAllowed(origin: string, list = allowedOrigins()): boolean {
  const normalized = normalizeOrigin(origin);
  // Lista vacía = sin restricción declarada; no bloqueamos el desarrollo local.
  if (list.length === 0) return true;
  return normalized !== null && list.includes(normalized);
}

/**
 * Política CORS lista para aplicar a un bucket S3 / R2.
 * `PUT` y `POST` son necesarios para la subida con URL firmada; `GET` y `HEAD`
 * para reproducir el vídeo; `ETag` se expone para subidas multiparte.
 */
export function bucketCorsPolicy(list = allowedOrigins()): Array<{
  AllowedOrigins: string[];
  AllowedMethods: string[];
  AllowedHeaders: string[];
  ExposeHeaders: string[];
  MaxAgeSeconds: number;
}> {
  return [
    {
      AllowedOrigins: list,
      AllowedMethods: ['GET', 'HEAD', 'PUT', 'POST'],
      AllowedHeaders: ['*'],
      ExposeHeaders: ['ETag', 'Content-Length', 'Content-Type'],
      MaxAgeSeconds: 3600,
    },
  ];
}

/** Equivalente para Google Cloud Storage (`gsutil cors set`). */
export function gcsCorsPolicy(list = allowedOrigins()) {
  return [
    {
      origin: list,
      method: ['GET', 'HEAD', 'PUT', 'POST'],
      responseHeader: ['Content-Type', 'ETag', 'Content-Length'],
      maxAgeSeconds: 3600,
    },
  ];
}
