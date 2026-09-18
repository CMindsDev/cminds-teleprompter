/** Un guion escrito por el usuario. */
export interface Speech {
  id: string;
  title: string;
  body: string;
  createdAt: number;
  updatedAt: number;
  /** Ajustes del teleprompter recordados por guion. */
  settings: TeleprompterSettings;
}

export interface TeleprompterSettings {
  /** Píxeles por segundo de desplazamiento. */
  speed: number;
  /** Tamaño de fuente en px. */
  fontSize: number;
  /** Espejo horizontal (para cristales de teleprompter físicos). */
  mirrored: boolean;
}

export interface Recording {
  id: string;
  speechId: string;
  /** Copia del título en el momento de grabar: el guion puede renombrarse. */
  title: string;
  createdAt: number;
  /** Duración en milisegundos. */
  duration: number;
  mimeType: string;
  size: number;
  /** Clave del blob en IndexedDB. */
  blobKey: string;
  /** URL remota si se subió al bucket. */
  remoteUrl?: string;
}

export const DEFAULT_SETTINGS: TeleprompterSettings = {
  speed: 40,
  fontSize: 34,
  mirrored: false,
};

export const SPEED_RANGE = { min: 10, max: 140, step: 10 } as const;
export const FONT_SIZE_RANGE = { min: 20, max: 72, step: 4 } as const;
