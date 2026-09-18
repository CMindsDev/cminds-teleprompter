/**
 * Puente entre LiquidClass y los componentes de la app.
 *
 * Decisiones:
 * - `draggable: false` siempre. LiquidClass arrastra el elemento por defecto,
 *   lo que rompería cualquier botón.
 * - Solo se activa donde el efecto se ve: sobre vídeo o sobre el degradado
 *   oscuro. En fondos planos claros el respaldo CSS `.liquid` se ve mejor y
 *   cuesta menos batería, así que ahí no instanciamos la librería.
 * - Si el navegador no soporta `backdrop-filter` con filtros SVG (Firefox,
 *   Safari) la propia librería cae a su modo simple; nosotros además dejamos
 *   el respaldo CSS activo no marcando `data-liquid-ready`.
 */
import type { LiquidClassOptions } from './liquidClass';

export const DISPLACEMENT_MAP = '/assets/liquid-displacement.png';

/** Presets alineados con los tokens de `global.css`. */
export const LIQUID_PRESETS = {
  /** Botón principal sobre vídeo (barra de grabación). */
  onVideo: {
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    borderRadius: '999px',
    blur: '3px',
    brightness: 1.12,
    displacementScale: 70,
    dropShadowOpacity: 0.3,
    dropShadowX: -4,
    dropShadowY: -6,
    shadowStrength: 0.8,
  },
  /** Control circular pequeño (play, siguiente, tamaño de texto). */
  control: {
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    borderRadius: '999px',
    blur: '2px',
    brightness: 1.15,
    displacementScale: 45,
    dropShadowOpacity: 0.22,
    dropShadowX: -3,
    dropShadowY: -4,
    shadowStrength: 0.6,
  },
  /** Superficie sobre el degradado oscuro de la portada. */
  onDark: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: '999px',
    blur: '4px',
    brightness: 1.06,
    displacementScale: 60,
    dropShadowOpacity: 0.35,
    dropShadowX: -6,
    dropShadowY: -8,
    shadowStrength: 1,
  },
} satisfies Record<string, LiquidClassOptions>;

export type LiquidPreset = keyof typeof LIQUID_PRESETS;

/** Firefox y Safari ignoran `url(#filtro)` dentro de `backdrop-filter`. */
function supportsDisplacement(): boolean {
  if (typeof window === 'undefined') return false;
  if (!CSS.supports('backdrop-filter', 'blur(1px)') && !CSS.supports('-webkit-backdrop-filter', 'blur(1px)')) {
    return false;
  }
  const ua = window.navigator.userAgent.toLowerCase();
  const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
  const isFirefox = ua.includes('firefox');
  return !(isSafari || isFirefox);
}

/** Brillo especular que sigue al puntero (lo pinta `.liquid::after`). */
function trackPointer(el: HTMLElement): void {
  const onMove = (event: PointerEvent) => {
    const rect = el.getBoundingClientRect();
    el.style.setProperty('--liquid-x', `${event.clientX - rect.left}px`);
    el.style.setProperty('--liquid-y', `${event.clientY - rect.top}px`);
  };
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerleave', () => {
    el.style.removeProperty('--liquid-x');
    el.style.removeProperty('--liquid-y');
  });
}

interface InitOptions {
  /** Raíz sobre la que buscar `[data-liquid]`. Por defecto, el documento. */
  root?: ParentNode;
  /** `false` desactiva la librería y deja solo el respaldo CSS. */
  enabled?: boolean;
}

/**
 * Inicializa todos los `[data-liquid]` del árbol indicado.
 * Idempotente: los elementos ya procesados se ignoran.
 */
export async function initLiquidGlass({ root = document, enabled = true }: InitOptions = {}): Promise<void> {
  const nodes = Array.from(root.querySelectorAll<HTMLElement>('[data-liquid]:not([data-liquid-init])'));
  if (nodes.length === 0) return;

  for (const node of nodes) node.dataset.liquidInit = 'true';
  for (const node of nodes) trackPointer(node);

  // Respaldo CSS puro: suficiente y más barato donde no hay refracción.
  if (!enabled || !supportsDisplacement() || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  const { LiquidClass } = await import('./liquidClass.js');

  for (const node of nodes) {
    const preset = (node.dataset.liquid || 'control') as LiquidPreset;
    const options = LIQUID_PRESETS[preset] ?? LIQUID_PRESETS.control;

    // El borde real lo decide Tailwind; lo leemos para que el filtro coincida.
    const borderRadius = getComputedStyle(node).borderRadius || options.borderRadius;

    new LiquidClass(node, {
      ...options,
      borderRadius,
      draggable: false,
      displacementType: 'image',
      displacementImage: DISPLACEMENT_MAP,
    });

    node.dataset.liquidReady = 'true';
  }
}
