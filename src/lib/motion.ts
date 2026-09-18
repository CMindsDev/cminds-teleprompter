/**
 * Capa de animación (GSAP).
 *
 * Reparto de responsabilidades:
 * - El ClientRouter de Astro (`astro:transitions`) hace el cross-fade entre
 *   páginas y mantiene los elementos con `transition:name` (comportamiento
 *   compartido: el botón principal viaja de pantalla a pantalla).
 * - GSAP hace lo que la View Transitions API no da bien: escalonados,
 *   dibujado de SVG y cualquier reacción a interacción.
 *
 * Todas las funciones son no-op si el usuario pide movimiento reducido.
 */
import { gsap } from 'gsap';

export const REDUCED_MOTION = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const EASE = {
  out: 'expo.out',
  inOut: 'expo.inOut',
  soft: 'power3.out',
} as const;

/**
 * Entrada escalonada de la pantalla. Anima `[data-anim]` en orden de aparición
 * en el DOM, o en el orden que indique `data-anim-order`.
 */
export function enterScreen(root: ParentNode = document): gsap.core.Timeline | null {
  const targets = Array.from(root.querySelectorAll<HTMLElement>('[data-anim]')).sort(
    (a, b) => Number(a.dataset.animOrder ?? 0) - Number(b.dataset.animOrder ?? 0),
  );
  if (targets.length === 0) return null;

  if (REDUCED_MOTION()) return null;

  const tl = gsap.timeline({ defaults: { ease: EASE.out, duration: 0.7 } });
  tl.from(targets, {
    y: 24,
    autoAlpha: 0,
    stagger: 0.07,
    clearProps: 'transform',
  });
  return tl;
}

/**
 * Salida de la pantalla. Se llama antes de navegar para que el cambio de
 * página no se sienta como un corte seco.
 */
export function exitScreen(root: ParentNode = document): Promise<void> {
  const targets = Array.from(root.querySelectorAll<HTMLElement>('[data-anim]'));
  if (targets.length === 0 || REDUCED_MOTION()) return Promise.resolve();

  return new Promise((resolve) => {
    gsap.to(targets, {
      y: -16,
      autoAlpha: 0,
      duration: 0.28,
      ease: 'power2.in',
      stagger: { each: 0.03, from: 'end' },
      onComplete: () => resolve(),
    });
  });
}

/**
 * Dibuja un SVG trazo a trazo usando `stroke-dasharray`.
 * Funciona con cualquier `<path>`/`<line>`/`<circle>` dentro del contenedor.
 */
export function drawSvg(svg: SVGElement, duration = 1.2): gsap.core.Timeline | null {
  const strokes = Array.from(svg.querySelectorAll<SVGGeometryElement>('path, line, circle, rect, polyline'));
  if (strokes.length === 0 || REDUCED_MOTION()) return null;

  const tl = gsap.timeline();
  strokes.forEach((el, i) => {
    let length = 0;
    try {
      length = el.getTotalLength();
    } catch {
      return; // getTotalLength no está definido para todos los nodos
    }
    if (length === 0) return;

    gsap.set(el, { strokeDasharray: length, strokeDashoffset: length });
    tl.to(el, { strokeDashoffset: 0, duration, ease: EASE.soft }, i * 0.05);
  });
  return tl;
}

/**
 * Anima las partículas del logotipo de C MINDS: cada punto entra con escala y
 * un desfase radial, como si el logo se condensara.
 */
export function animateLogo(container: HTMLElement): gsap.core.Timeline | null {
  const dots = container.querySelectorAll('path');
  if (dots.length === 0 || REDUCED_MOTION()) return null;

  return gsap.timeline().from(dots, {
    scale: 0,
    autoAlpha: 0,
    transformOrigin: '50% 50%',
    duration: 0.6,
    ease: EASE.out,
    stagger: { each: 0.012, from: 'random' },
  });
}

/** Pulso continuo para el indicador de grabación en curso. */
export function pulse(target: Element): gsap.core.Tween | null {
  if (REDUCED_MOTION()) return null;
  return gsap.to(target, {
    opacity: 0.25,
    duration: 0.7,
    repeat: -1,
    yoyo: true,
    ease: 'sine.inOut',
  });
}

/** Rebote corto: confirma una acción sin sacar al usuario del flujo. */
export function tapFeedback(target: Element): void {
  if (REDUCED_MOTION()) return;
  gsap.fromTo(
    target,
    { scale: 0.9 },
    { scale: 1, duration: 0.45, ease: 'elastic.out(1, 0.5)', clearProps: 'scale' },
  );
}

/** Aparición de un toast / aviso flotante, con auto-cierre. */
export function toast(message: string, tone: 'info' | 'error' = 'info', ms = 2600): void {
  const host = document.getElementById('toast-host');
  if (!host) return;

  const el = document.createElement('div');
  el.role = 'status';
  el.className = [
    'pointer-events-auto rounded-2xl px-4 py-3 text-sm font-medium shadow-lg',
    tone === 'error' ? 'bg-record text-white' : 'bg-ink text-paper',
  ].join(' ');
  el.textContent = message;
  host.appendChild(el);

  if (REDUCED_MOTION()) {
    window.setTimeout(() => el.remove(), ms);
    return;
  }

  gsap
    .timeline({ onComplete: () => el.remove() })
    .from(el, { y: 20, autoAlpha: 0, duration: 0.4, ease: EASE.out })
    .to(el, { y: -10, autoAlpha: 0, duration: 0.3, ease: 'power2.in' }, `+=${ms / 1000}`);
}
