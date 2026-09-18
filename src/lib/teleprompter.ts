/**
 * Motor de desplazamiento del teleprompter.
 *
 * Usa GSAP `ticker` en vez de `requestAnimationFrame` propio para compartir el
 * mismo reloj que el resto de animaciones: así el texto no se desincroniza con
 * las transiciones de la interfaz.
 *
 * La velocidad se expresa en píxeles por segundo y es independiente del tamaño
 * de fuente, para que cambiar el tamaño no altere el ritmo de lectura.
 */
import { gsap } from 'gsap';
import { FONT_SIZE_RANGE, SPEED_RANGE, type TeleprompterSettings } from './types';

export interface TeleprompterEvents {
  onProgress?: (ratio: number) => void;
  onEnd?: () => void;
  onStateChange?: (playing: boolean) => void;
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export class Teleprompter {
  private offset = 0;
  private playing = false;
  private maxOffset = 0;
  private tick: (() => void) | null = null;

  constructor(
    /** Contenedor con `overflow: hidden` que recorta el texto. */
    private readonly viewport: HTMLElement,
    /** Elemento que se desplaza dentro del viewport. */
    private readonly track: HTMLElement,
    private settings: TeleprompterSettings,
    private readonly events: TeleprompterEvents = {},
  ) {
    this.applySettings();
    this.measure();

    // El alto del texto cambia al editar, al rotar o al cambiar el tamaño de fuente.
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(() => this.measure()).observe(this.track);
    }
  }

  /* ── Ciclo de vida ──────────────────────────────────────── */

  play(): void {
    if (this.playing) return;
    this.playing = true;
    this.events.onStateChange?.(true);

    // GSAP entrega el delta en segundos: velocidad × delta = píxeles a avanzar.
    this.tick = () => {
      const delta = gsap.ticker.deltaRatio(60) / 60;
      this.setOffset(this.offset + this.settings.speed * delta);
      if (this.offset >= this.maxOffset) {
        this.pause();
        this.events.onEnd?.();
      }
    };
    gsap.ticker.add(this.tick);
  }

  pause(): void {
    if (!this.playing) return;
    this.playing = false;
    if (this.tick) gsap.ticker.remove(this.tick);
    this.tick = null;
    this.events.onStateChange?.(false);
  }

  toggle(): void {
    this.playing ? this.pause() : this.play();
  }

  destroy(): void {
    this.pause();
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  /* ── Navegación ─────────────────────────────────────────── */

  /** Salta al principio. */
  restart(): void {
    this.setOffset(0);
  }

  /** Avanza o retrocede líneas completas (botones ⏮ / ⏭). */
  step(lines: number): void {
    const lineHeight = this.settings.fontSize * 1.45;
    this.setOffset(this.offset + lines * lineHeight * 3);
  }

  /** Coloca el texto en una posición relativa (0–1), para el arrastre manual. */
  seek(ratio: number): void {
    this.setOffset(clamp(ratio, 0, 1) * this.maxOffset);
  }

  /* ── Ajustes en caliente ────────────────────────────────── */

  setSpeed(value: number): number {
    this.settings.speed = clamp(value, SPEED_RANGE.min, SPEED_RANGE.max);
    return this.settings.speed;
  }

  bumpSpeed(delta: number): number {
    return this.setSpeed(this.settings.speed + delta);
  }

  setFontSize(value: number): number {
    // Conservamos la posición de lectura proporcional al reescalar.
    const ratio = this.maxOffset > 0 ? this.offset / this.maxOffset : 0;
    this.settings.fontSize = clamp(value, FONT_SIZE_RANGE.min, FONT_SIZE_RANGE.max);
    this.applySettings();
    this.measure();
    this.seek(ratio);
    return this.settings.fontSize;
  }

  bumpFontSize(delta: number): number {
    return this.setFontSize(this.settings.fontSize + delta);
  }

  setMirrored(value: boolean): void {
    this.settings.mirrored = value;
    this.applySettings();
  }

  setText(text: string): void {
    this.track.textContent = text;
    this.measure();
    this.restart();
  }

  get current(): TeleprompterSettings {
    return { ...this.settings };
  }

  get progress(): number {
    return this.maxOffset > 0 ? this.offset / this.maxOffset : 0;
  }

  /* ── Interno ────────────────────────────────────────────── */

  private applySettings(): void {
    this.track.style.fontSize = `${this.settings.fontSize}px`;
    this.track.style.lineHeight = '1.28';
    this.viewport.style.transform = this.settings.mirrored ? 'scaleX(-1)' : '';
  }

  private measure(): void {
    // Dejamos medio viewport de margen al final para que la última línea
    // llegue a la zona de lectura y no se quede pegada abajo.
    const tail = this.viewport.clientHeight * 0.5;
    this.maxOffset = Math.max(0, this.track.scrollHeight - this.viewport.clientHeight + tail);
    this.setOffset(this.offset);
  }

  private setOffset(value: number): void {
    this.offset = clamp(value, 0, this.maxOffset);
    gsap.set(this.track, { y: -this.offset });
    this.events.onProgress?.(this.progress);
  }
}
