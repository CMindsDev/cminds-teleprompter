/**
 * Eliminar una tarjeta arrastrándola hacia arriba.
 *
 * El relleno rojo crece desde abajo conforme se arrastra: al llegar arriba del
 * todo, soltar elimina. Por debajo del umbral vuelve a su sitio. Así el gesto
 * se puede abortar a media altura, que es lo que la gente intenta cuando se da
 * cuenta de que se ha equivocado de tarjeta.
 *
 * ── El conflicto con el scroll ──
 * Un deslizamiento vertical dentro de una lista que también se desplaza en
 * vertical compite consigo mismo (por eso iOS usa gestos horizontales). Aquí se
 * resuelve reclamando el gesto solo cuando es **claramente** un arrastre hacia
 * arriba y no un impulso de scroll: hace falta superar un umbral de holgura y
 * que el movimiento vertical domine al horizontal. Un deslizamiento rápido para
 * recorrer la lista sigue desplazando la página; uno deliberado hacia arriba
 * sobre una tarjeta la marca para borrar.
 *
 * El ratón no tiene este problema: arrastrar no desplaza, así que en escritorio
 * el gesto se reclama desde el primer píxel.
 *
 * Esto es un atajo, nunca la única vía: el borrado accesible vive en el botón
 * «Eliminar» del detalle de cada grabación.
 */
import { gsap } from 'gsap';

/** Recorrido, en píxeles, para llegar al 100 %. */
const TRAVEL = 96;
/** Holgura antes de decidir si el gesto es nuestro o del scroll. */
const SLOP = 14;

export interface SwipeDeleteHandle {
  destroy(): void;
}

export interface SwipeDeleteOptions {
  /** Se llama al soltar por encima del umbral. */
  onConfirm: () => void;
  /** Aviso al cruzar el umbral, para reforzar que soltar ya elimina. */
  onArm?: (armed: boolean) => void;
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

export function enableSwipeDelete(card: HTMLElement, options: SwipeDeleteOptions): SwipeDeleteHandle {
  const fill = card.querySelector<HTMLElement>('[data-kill]');
  const icon = fill?.firstElementChild ?? null;
  if (!fill || !icon) return { destroy: () => undefined };

  let startX = 0;
  let startY = 0;
  let tracking = false;
  let claimed = false;
  let armed = false;
  let progress = 0;
  /** Tras arrastrar, el `click` de cierre no debe abrir el detalle. */
  let suppressClick = false;

  function paint(value: number): void {
    progress = clamp01(value);
    gsap.set(fill, { height: `${progress * 100}%`, autoAlpha: progress > 0.02 ? 1 : 0 });
    // El icono solo aparece cuando ya hay sitio para que se lea.
    gsap.set(icon, { autoAlpha: progress > 0.45 ? 1 : 0, scale: 0.7 + progress * 0.3 });
    gsap.set(card, { y: -progress * 8 });

    const nowArmed = progress >= 1;
    if (nowArmed !== armed) {
      armed = nowArmed;
      options.onArm?.(armed);
    }
  }

  function reset(animated = true): void {
    if (!animated) {
      paint(0);
      return;
    }
    gsap.to(
      { value: progress },
      {
        value: 0,
        duration: 0.32,
        ease: 'expo.out',
        onUpdate() {
          paint(this.targets()[0].value as number);
        },
      },
    );
  }

  function begin(x: number, y: number, immediate: boolean): void {
    startX = x;
    startY = y;
    tracking = true;
    claimed = immediate;
  }

  /** Devuelve `true` si el gesto es nuestro (hay que frenar el scroll). */
  function move(x: number, y: number): boolean {
    if (!tracking) return false;

    const dx = x - startX;
    const dy = y - startY;

    if (!claimed) {
      // Hacia abajo o en diagonal: no es nuestro, lo dejamos ir.
      if (dy > SLOP || Math.abs(dx) > SLOP) {
        tracking = false;
        return false;
      }
      if (dy > -SLOP) return false; // aún indeciso
      if (Math.abs(dy) < Math.abs(dx) * 1.5) {
        tracking = false;
        return false;
      }
      claimed = true;
    }

    suppressClick = true;
    paint(-dy / TRAVEL);
    return true;
  }

  function end(): void {
    if (!tracking) return;
    tracking = false;

    if (!claimed) return;
    claimed = false;

    if (progress >= 1) {
      // Se queda lleno mientras la lista se actualiza: soltar y ver la tarjeta
      // volver a su sitio antes de desaparecer se leería como un fallo.
      options.onConfirm();
      return;
    }
    reset();
  }

  /* ── Ratón (escritorio) ─────────────────────────────────── */

  const onPointerDown = (event: PointerEvent): void => {
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    begin(event.clientX, event.clientY, true);
    card.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (event.pointerType !== 'mouse') return;
    if (move(event.clientX, event.clientY)) event.preventDefault();
  };

  const onPointerUp = (event: PointerEvent): void => {
    if (event.pointerType !== 'mouse') return;
    try {
      card.releasePointerCapture(event.pointerId);
    } catch {
      /* el puntero ya se soltó */
    }
    end();
  };

  /* ── Táctil ─────────────────────────────────────────────── */

  const onTouchStart = (event: TouchEvent): void => {
    const touch = event.touches[0];
    if (!touch) return;
    begin(touch.clientX, touch.clientY, false);
  };

  const onTouchMove = (event: TouchEvent): void => {
    const touch = event.touches[0];
    if (!touch) return;
    // `passive: false` es imprescindible: sin él no se puede frenar el scroll.
    if (move(touch.clientX, touch.clientY)) event.preventDefault();
  };

  const onClick = (event: MouseEvent): void => {
    if (!suppressClick) return;
    suppressClick = false;
    event.preventDefault();
    event.stopPropagation();
  };

  card.addEventListener('pointerdown', onPointerDown);
  card.addEventListener('pointermove', onPointerMove);
  card.addEventListener('pointerup', onPointerUp);
  card.addEventListener('pointercancel', onPointerUp);
  card.addEventListener('touchstart', onTouchStart, { passive: true });
  card.addEventListener('touchmove', onTouchMove, { passive: false });
  card.addEventListener('touchend', end);
  card.addEventListener('touchcancel', end);
  card.addEventListener('click', onClick, true);

  return {
    destroy(): void {
      card.removeEventListener('pointerdown', onPointerDown);
      card.removeEventListener('pointermove', onPointerMove);
      card.removeEventListener('pointerup', onPointerUp);
      card.removeEventListener('pointercancel', onPointerUp);
      card.removeEventListener('touchstart', onTouchStart);
      card.removeEventListener('touchmove', onTouchMove);
      card.removeEventListener('touchend', end);
      card.removeEventListener('touchcancel', end);
      card.removeEventListener('click', onClick, true);
    },
  };
}

/** Colapso de la tarjeta al confirmar: cierra el hueco antes de re-renderizar. */
export function collapseCard(card: HTMLElement): Promise<void> {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return Promise.resolve();

  return new Promise((resolve) => {
    gsap.to(card.closest('li') ?? card, {
      scale: 0.82,
      autoAlpha: 0,
      duration: 0.28,
      ease: 'power2.in',
      onComplete: () => resolve(),
    });
  });
}
