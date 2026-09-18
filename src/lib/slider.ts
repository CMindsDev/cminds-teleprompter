/**
 * Slider de ajuste para los controles del teleprompter.
 *
 * Dos presentaciones sobre la misma mecánica:
 *   ticks → regla horizontal (velocidad). Un tramo por paso, el actual en azul.
 *   fill  → barra vertical que se llena desde abajo (tamaño de texto).
 *
 * No se usa `<input type="range">` porque su aspecto nativo no se puede llevar
 * a una regla de marcas sin pseudo-elementos propios de cada navegador, y aquí
 * el control se manipula con el pulgar sobre el vídeo: necesita área grande y
 * respuesta inmediata al arrastrar.
 */

export type SliderVariant = 'ticks' | 'fill';

export interface SliderConfig {
  variant: SliderVariant;
  min: number;
  max: number;
  step: number;
  value: number;
  /** Nombre accesible del control. */
  label: string;
  /** Texto legible del valor (para `aria-valuetext` y el indicador). */
  format?: (value: number) => string;
  /** Se dispara en cada cambio, incluido el arrastre. */
  onInput?: (value: number) => void;
  /** Se dispara al soltar: buen momento para persistir. */
  onCommit?: (value: number) => void;
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export class Slider {
  private value: number;
  private readonly track: HTMLElement;
  private readonly ticks: HTMLElement[] = [];
  private readonly fill: HTMLElement | null = null;
  private dragging = false;

  constructor(
    private readonly root: HTMLElement,
    private readonly config: SliderConfig,
  ) {
    this.value = clamp(config.value, config.min, config.max);

    this.track = document.createElement('div');
    this.track.tabIndex = 0;
    this.track.setAttribute('role', 'slider');
    this.track.setAttribute('aria-label', config.label);
    this.track.setAttribute('aria-valuemin', String(config.min));
    this.track.setAttribute('aria-valuemax', String(config.max));
    this.track.setAttribute(
      'aria-orientation',
      config.variant === 'ticks' ? 'horizontal' : 'vertical',
    );

    if (config.variant === 'ticks') {
      this.track.className =
        'flex h-9 w-full cursor-pointer touch-none items-center justify-between rounded-lg outline-none';
      const count = Math.round((config.max - config.min) / config.step) + 1;
      for (let i = 0; i < count; i += 1) {
        const tick = document.createElement('span');
        tick.className = 'block rounded-full transition-all duration-150';
        this.track.appendChild(tick);
        this.ticks.push(tick);
      }
    } else {
      this.track.className =
        'relative h-[150px] w-[7px] cursor-pointer touch-none rounded-full bg-white/35 outline-none';
      this.fill = document.createElement('div');
      this.fill.className = 'absolute bottom-0 w-full rounded-full bg-brand-500 transition-[height] duration-100';
      this.track.appendChild(this.fill);
    }

    this.root.appendChild(this.track);
    this.paint();
    this.bind();
  }

  /* ── API ──────────────────────────────────────────────── */

  get current(): number {
    return this.value;
  }

  /** Actualiza el control sin notificar: para cambios hechos por teclado. */
  sync(value: number): void {
    this.value = clamp(value, this.config.min, this.config.max);
    this.paint();
  }

  /** Texto del valor actual, p. ej. "1.2×" o "34 px". */
  get text(): string {
    return this.config.format?.(this.value) ?? String(this.value);
  }

  destroy(): void {
    this.track.remove();
  }

  /* ── Interno ──────────────────────────────────────────── */

  private snap(raw: number): number {
    const { min, max, step } = this.config;
    const steps = Math.round((clamp(raw, min, max) - min) / step);
    return clamp(min + steps * step, min, max);
  }

  private paint(): void {
    const { min, max } = this.config;
    const ratio = max === min ? 0 : (this.value - min) / (max - min);

    this.track.setAttribute('aria-valuenow', String(this.value));
    this.track.setAttribute('aria-valuetext', this.text);

    if (this.config.variant === 'ticks') {
      const active = Math.round(ratio * (this.ticks.length - 1));
      this.ticks.forEach((tick, index) => {
        const isActive = index === active;
        tick.className = [
          'block rounded-full transition-all duration-150',
          isActive ? 'h-8 w-[3px] bg-brand-500' : 'h-4 w-px bg-white/55',
        ].join(' ');
      });
    } else if (this.fill) {
      // Mínimo visible del 6 % para que la barra nunca parezca vacía o rota.
      this.fill.style.height = `${Math.max(6, ratio * 100)}%`;
    }
  }

  private setFromPointer(event: PointerEvent): void {
    const rect = this.track.getBoundingClientRect();
    const { min, max } = this.config;

    const ratio =
      this.config.variant === 'ticks'
        ? (event.clientX - rect.left) / rect.width
        : // En vertical el mínimo está abajo: invertimos el eje.
          1 - (event.clientY - rect.top) / rect.height;

    const next = this.snap(min + clamp(ratio, 0, 1) * (max - min));
    if (next === this.value) return;

    this.value = next;
    this.paint();
    this.config.onInput?.(next);
  }

  private bind(): void {
    this.track.addEventListener('pointerdown', (event) => {
      this.dragging = true;
      this.track.setPointerCapture(event.pointerId);
      this.setFromPointer(event);
    });

    this.track.addEventListener('pointermove', (event) => {
      if (this.dragging) this.setFromPointer(event);
    });

    const end = (event: PointerEvent): void => {
      if (!this.dragging) return;
      this.dragging = false;
      // `releasePointerCapture` lanza si el puntero ya se soltó (p. ej. al
      // salir de la ventana a mitad del arrastre).
      try {
        this.track.releasePointerCapture(event.pointerId);
      } catch {
        /* sin captura activa: nada que liberar */
      }
      this.config.onCommit?.(this.value);
    };

    this.track.addEventListener('pointerup', end);
    this.track.addEventListener('pointercancel', end);

    this.track.addEventListener('keydown', (event) => {
      const { min, max, step } = this.config;
      let next = this.value;

      switch (event.key) {
        case 'ArrowRight':
        case 'ArrowUp':
          next = this.value + step;
          break;
        case 'ArrowLeft':
        case 'ArrowDown':
          next = this.value - step;
          break;
        case 'Home':
          next = min;
          break;
        case 'End':
          next = max;
          break;
        default:
          return;
      }

      event.preventDefault();
      next = this.snap(next);
      if (next === this.value) return;

      this.value = next;
      this.paint();
      this.config.onInput?.(next);
      this.config.onCommit?.(next);
    });
  }
}
