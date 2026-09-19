/**
 * Persistencia de guiones y metadatos de grabaciones.
 *
 * Los textos y metadatos van en localStorage (pequeños, se leen en síncrono al
 * pintar la lista). Los blobs de vídeo van en IndexedDB (`db.ts`), porque
 * localStorage tiene un límite de ~5 MB.
 */
import { DEFAULT_SETTINGS, type Recording, type Speech, type TeleprompterSettings } from './types';

const SPEECH_KEY = 'cminds.teleprompter.speeches.v1';
const RECORDING_KEY = 'cminds.teleprompter.recordings.v1';
const DRAFT_KEY = 'cminds.teleprompter.activeSpeech';
const STARTED_KEY = 'cminds.teleprompter.started.v1';

const canStore = (): boolean => typeof window !== 'undefined' && 'localStorage' in window;

function read<T>(key: string, fallback: T): T {
  if (!canStore()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    // Modo privado de Safari, cuota agotada o JSON corrupto: seguimos con el fallback.
    return fallback;
  }
}

function write(key: string, value: unknown): boolean {
  if (!canStore()) return false;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** La bienvenida deja de ser el inicio después de comenzar a usar la app. */
export function markAppStarted(): void {
  write(STARTED_KEY, true);
}

export function hasAppStarted(): boolean {
  if (read(STARTED_KEY, false)) return true;
  // Reconoce también los datos creados antes de incorporar esta preferencia.
  if (listSpeeches().length || listRecordings().length) {
    markAppStarted();
    return true;
  }
  return false;
}

/* ── Guiones ──────────────────────────────────────────────── */

export function listSpeeches(): Speech[] {
  return read<Speech[]>(SPEECH_KEY, []).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getSpeech(id: string): Speech | undefined {
  return read<Speech[]>(SPEECH_KEY, []).find((s) => s.id === id);
}

export function createSpeech(partial: Partial<Speech> = {}): Speech {
  const now = Date.now();
  const speech: Speech = {
    id: partial.id ?? newId(),
    title: partial.title ?? '',
    body: partial.body ?? '',
    createdAt: now,
    updatedAt: now,
    settings: { ...DEFAULT_SETTINGS, ...partial.settings },
  };
  const all = read<Speech[]>(SPEECH_KEY, []);
  all.push(speech);
  write(SPEECH_KEY, all);
  markAppStarted();
  return speech;
}

/** Devuelve `false` si el almacenamiento rechazó la escritura (cuota llena). */
export function saveSpeech(speech: Speech): boolean {
  const all = read<Speech[]>(SPEECH_KEY, []);
  const index = all.findIndex((s) => s.id === speech.id);
  const next: Speech = { ...speech, updatedAt: Date.now() };
  if (index >= 0) all[index] = next;
  else all.push(next);
  return write(SPEECH_KEY, all);
}

export function updateSettings(id: string, settings: Partial<TeleprompterSettings>): void {
  const speech = getSpeech(id);
  if (!speech) return;
  saveSpeech({ ...speech, settings: { ...speech.settings, ...settings } });
}

export function deleteSpeech(id: string): void {
  write(
    SPEECH_KEY,
    read<Speech[]>(SPEECH_KEY, []).filter((s) => s.id !== id),
  );
}

/** Id del guion que se está editando o grabando ahora mismo. */
export function setActiveSpeechId(id: string): void {
  try {
    if (canStore()) window.localStorage.setItem(DRAFT_KEY, id);
  } catch {
    // Un marcador opcional no debe interrumpir la inicialización del editor.
  }
}

export function getActiveSpeechId(): string | null {
  try {
    return canStore() ? window.localStorage.getItem(DRAFT_KEY) : null;
  } catch {
    return null;
  }
}

/* ── Grabaciones (metadatos) ──────────────────────────────── */

export function listRecordings(): Recording[] {
  return read<Recording[]>(RECORDING_KEY, []).sort((a, b) => b.createdAt - a.createdAt);
}

export function getRecording(id: string): Recording | undefined {
  return read<Recording[]>(RECORDING_KEY, []).find((r) => r.id === id);
}

export function saveRecording(recording: Recording): boolean {
  const all = read<Recording[]>(RECORDING_KEY, []);
  const index = all.findIndex((r) => r.id === recording.id);
  if (index >= 0) all[index] = recording;
  else all.push(recording);
  const saved = write(RECORDING_KEY, all);
  if (saved) markAppStarted();
  return saved;
}

export function deleteRecordingMeta(id: string): void {
  write(
    RECORDING_KEY,
    read<Recording[]>(RECORDING_KEY, []).filter((r) => r.id !== id),
  );
}
