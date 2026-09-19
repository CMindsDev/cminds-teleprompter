/**
 * Cámara, micrófono y grabación.
 *
 * Puntos delicados que este módulo resuelve:
 * - `getUserMedia` solo existe en contexto seguro (https o localhost). Si no,
 *   fallamos con un mensaje claro en vez de con un TypeError opaco.
 * - Los códecs de MediaRecorder varían por navegador: probamos una lista en
 *   orden de preferencia en lugar de asumir webm/vp9.
 * - Las pistas hay que pararlas a mano o la luz de la cámara se queda encendida.
 */

export type MediaErrorKind =
  | 'inseguro'
  | 'no-soportado'
  | 'denegado'
  | 'sin-dispositivo'
  | 'ocupado'
  | 'desconocido';

export class MediaError extends Error {
  constructor(
    readonly kind: MediaErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'MediaError';
  }
}

const MESSAGES: Record<MediaErrorKind, string> = {
  inseguro: 'La cámara requiere una conexión segura (https) o localhost.',
  'no-soportado': 'Este navegador no permite acceder a la cámara.',
  denegado: 'Permiso denegado. Habilita cámara y micrófono en los ajustes del navegador.',
  'sin-dispositivo': 'No encontramos ninguna cámara o micrófono conectados.',
  ocupado: 'Otra aplicación está usando la cámara. Ciérrala e inténtalo de nuevo.',
  desconocido: 'No pudimos iniciar la cámara. Inténtalo de nuevo.',
};

function classify(error: unknown): MediaError {
  const name = error instanceof Error ? error.name : '';
  const kind: MediaErrorKind =
    name === 'NotAllowedError' || name === 'SecurityError'
      ? 'denegado'
      : name === 'NotFoundError' || name === 'OverconstrainedError'
        ? 'sin-dispositivo'
        : name === 'NotReadableError' || name === 'AbortError'
          ? 'ocupado'
          : 'desconocido';
  return new MediaError(kind, MESSAGES[kind]);
}

/** Estado del permiso sin pedirlo, cuando el navegador lo expone. */
export async function permissionState(name: 'camera' | 'microphone'): Promise<PermissionState | 'unknown'> {
  if (!navigator.permissions?.query) return 'unknown';
  try {
    const status = await navigator.permissions.query({ name: name as PermissionName });
    return status.state;
  } catch {
    return 'unknown';
  }
}

/**
 * Formatos de captura. Vertical es el único en uso; el resto queda listo para
 * el selector de relación de aspecto.
 *
 * `ratio` se escribe igual que el valor CSS de `--capture-aspect` en
 * `grabar.astro`, que es donde se decide el marco en pantalla.
 */
export const CAPTURE_FORMATS = {
  vertical: { ratio: 9 / 16, css: '9 / 16', width: 1080, height: 1920, label: 'Vertical 9:16' },
  cuadrado: { ratio: 1, css: '1 / 1', width: 1080, height: 1080, label: 'Cuadrado 1:1' },
  horizontal: { ratio: 16 / 9, css: '16 / 9', width: 1920, height: 1080, label: 'Horizontal 16:9' },
} as const;

export type CaptureFormat = keyof typeof CAPTURE_FORMATS;

export const DEFAULT_FORMAT: CaptureFormat = 'vertical';

export interface CameraOptions {
  facingMode?: 'user' | 'environment';
  audio?: boolean;
  format?: CaptureFormat;
}

/**
 * Pide cámara + micrófono. Lanza `MediaError` con un motivo legible.
 * La primera llamada dispara el diálogo de permisos del navegador.
 */
export async function requestCamera({
  facingMode = 'user',
  audio = true,
  format = DEFAULT_FORMAT,
}: CameraOptions = {}): Promise<MediaStream> {
  if (typeof window === 'undefined') throw new MediaError('no-soportado', MESSAGES['no-soportado']);
  if (!window.isSecureContext) throw new MediaError('inseguro', MESSAGES.inseguro);
  if (!navigator.mediaDevices?.getUserMedia) throw new MediaError('no-soportado', MESSAGES['no-soportado']);

  const { width, height } = CAPTURE_FORMATS[format];

  try {
    return await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode,
        // Preferir la imagen nativa para evitar recortes del navegador.
        // Es opcional para conservar compatibilidad con otras cámaras.
        resizeMode: { ideal: 'none' },
        // Las restricciones se expresan en la orientación primaria del sensor.
        // Safari/Chrome rotan los fotogramas al sostener el móvil en vertical.
        // No imponer aquí el 9:16 de salida: puede recortar la propia captura.
        width: { ideal: Math.max(width, height) },
        height: { ideal: Math.min(width, height) },
        frameRate: { ideal: 30 },
      } as MediaTrackConstraints & { resizeMode: ConstrainDOMString },
      audio: audio ? { echoCancellation: true, noiseSuppression: true } : false,
    });
  } catch (error) {
    throw classify(error);
  }
}

/** Qué entrega la cámara de verdad. Se muestra con `/grabar?debug=1`. */
export function describeStream(stream: MediaStream, video?: HTMLVideoElement): string {
  const settings = stream.getVideoTracks()[0]?.getSettings();
  const pista = settings?.width && settings.height ? `${settings.width}×${settings.height}` : '—';
  const pintado = video?.videoWidth ? `${video.videoWidth}×${video.videoHeight}` : '—';
  return `pista ${pista} · vídeo ${pintado}`;
}

/**
 * Relación de aspecto de la imagen **tal y como se ve**.
 *
 * Hay que mirar el elemento `<video>`, no `track.getSettings()`. En el móvil la
 * pista suele describir el sensor, que está montado en horizontal: informa de
 * 1280×720 aunque el navegador ya haya rotado la imagen y la esté pintando en
 * 720×1280. Fiarse de la pista deja un marco apaisado sobre un vídeo vertical,
 * y con `object-cover` eso es un recorte brutal por los lados.
 *
 * `videoWidth` vale 0 hasta que llegan los metadatos, así que esto se consulta
 * en `loadedmetadata` y en `resize` (giros de pantalla), no justo al asignar
 * `srcObject`.
 */
export function displayedAspectRatio(video: HTMLVideoElement): number | null {
  if (!video.videoWidth || !video.videoHeight) return null;
  return video.videoWidth / video.videoHeight;
}

/** Evita convertir una webcam horizontal o cuadrada en un primer plano. */
export function cameraFit(
  width: number,
  height: number,
  format: CaptureFormat = DEFAULT_FORMAT,
): 'contain' | 'cover' {
  if (!width || !height) return 'contain';
  return CAPTURE_FORMATS[format].ratio < 1 && width >= height ? 'contain' : 'cover';
}

/** Apaga todas las pistas: sin esto el indicador de cámara sigue encendido. */
export function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}

/** ¿Hay más de una cámara? Determina si mostramos el botón de girar. */
export async function hasMultipleCameras(): Promise<boolean> {
  if (!navigator.mediaDevices?.enumerateDevices) return false;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === 'videoinput').length > 1;
  } catch {
    return false;
  }
}

/* ── Composición vertical ─────────────────────────────────── */

export interface Composer {
  /** Pista de vídeo 1080×1920 + audio original, lista para MediaRecorder. */
  stream: MediaStream;
  width: number;
  height: number;
  stop(): void;
}

/**
 * Recompone la cámara en un lienzo del tamaño exacto del formato (1080×1920).
 *
 * Mantiene la salida vertical. La captura vertical llena el marco; si el
 * dispositivo solo entrega horizontal/cuadrado, se conserva su campo de visión
 * con bandas en lugar de ampliarlo varias veces. Comparte cameraFit con la UI.
 *
 * Devuelve `null` si el navegador no sabe capturar un lienzo; quien llama debe
 * seguir con la pista original.
 */
export function composeVertical(
  video: HTMLVideoElement,
  source: MediaStream,
  format: CaptureFormat = DEFAULT_FORMAT,
): Composer | null {
  const { width, height } = CAPTURE_FORMATS[format];

  const canvas = document.createElement('canvas');
  if (typeof canvas.captureStream !== 'function') return null;

  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d', { alpha: false });
  if (!context) return null;

  // Safari antiguo exige que el lienzo esté en el documento para capturarlo.
  // El tamaño CSS no toca el búfer de dibujo, así que 1px es suficiente.
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'position:fixed;left:-1px;top:-1px;width:1px;height:1px;opacity:0;pointer-events:none';
  document.body.appendChild(canvas);

  let running = true;
  let rafId = 0;
  let frameId = 0;

  const draw = (): void => {
    const sw = video.videoWidth;
    const sh = video.videoHeight;
    if (sw && sh) {
      const fit = cameraFit(sw, sh, format);
      const scale = fit === 'cover'
        ? Math.max(width / sw, height / sh)
        : Math.min(width / sw, height / sh);
      const drawWidth = sw * scale;
      const drawHeight = sh * scale;
      context.fillStyle = '#000';
      context.fillRect(0, 0, width, height);
      context.drawImage(video, 0, 0, sw, sh,
        (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
    }
  };

  // `requestVideoFrameCallback` dibuja exactamente una vez por fotograma nuevo;
  // con rAF se repintaría de más y se gastaría batería sin ganar nada.
  const useFrameCallback = typeof video.requestVideoFrameCallback === 'function';

  const loop = (): void => {
    if (!running) return;
    draw();
    if (useFrameCallback) frameId = video.requestVideoFrameCallback(loop);
    else rafId = requestAnimationFrame(loop);
  };
  loop();

  const stream = new MediaStream();
  for (const track of canvas.captureStream(30).getVideoTracks()) stream.addTrack(track);
  for (const track of source.getAudioTracks()) stream.addTrack(track);

  return {
    stream,
    width,
    height,
    stop(): void {
      running = false;
      if (useFrameCallback) video.cancelVideoFrameCallback?.(frameId);
      else cancelAnimationFrame(rafId);
      // Solo las pistas del lienzo: el audio y la cámara los gestiona quien llama.
      stream.getVideoTracks().forEach((track) => track.stop());
      canvas.remove();
    },
  };
}

/* ── Grabación ────────────────────────────────────────────── */

/** En orden de preferencia: calidad, compatibilidad, último recurso. */
const CODECS = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2', // Safari 17+ y Chrome reciente
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/mp4',
];

export function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  return CODECS.find((type) => MediaRecorder.isTypeSupported(type)) ?? '';
}

export function extensionFor(mimeType: string): string {
  return mimeType.includes('mp4') ? 'mp4' : 'webm';
}

export interface RecorderHandle {
  stop: () => Promise<Blob>;
  pause: () => void;
  resume: () => void;
  readonly state: RecordingState;
  readonly mimeType: string;
}

/**
 * Arranca la grabación. `stop()` resuelve con el blob final.
 * Se trocea cada segundo para que un fallo no se lleve toda la toma.
 */
export function startRecording(stream: MediaStream): RecorderHandle {
  if (typeof MediaRecorder === 'undefined') {
    throw new MediaError('no-soportado', 'Este navegador no puede grabar vídeo.');
  }

  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks: BlobPart[] = [];

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  recorder.start(1000);

  return {
    get state() {
      return recorder.state;
    },
    get mimeType() {
      return recorder.mimeType || mimeType || 'video/webm';
    },
    pause: () => {
      if (recorder.state === 'recording') recorder.pause();
    },
    resume: () => {
      if (recorder.state === 'paused') recorder.resume();
    },
    stop: () =>
      new Promise<Blob>((resolve, reject) => {
        recorder.onerror = () => reject(new MediaError('desconocido', 'La grabación se interrumpió.'));
        recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || mimeType || 'video/webm' }));
        if (recorder.state === 'inactive') recorder.onstop?.(new Event('stop'));
        else recorder.stop();
      }),
  };
}

/** Dispara la descarga de un blob con nombre legible. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Damos margen a que el navegador inicie la descarga antes de revocar.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** `00:30` — formato del cronómetro de la pantalla de grabación. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function slugify(value: string): string {
  return (
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'grabacion'
  );
}
