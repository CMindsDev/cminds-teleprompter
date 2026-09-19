/**
 * Vuelo del clip guardado: el vídeo a pantalla completa se encoge hasta la
 * tarjeta que acaba de aparecer en «Mis grabaciones».
 *
 * La animación se ejecuta **en la página de destino**, no en la de grabación.
 * Es la única forma de medir la posición real de la tarjeta en lugar de
 * recalcular a mano el ancho de la rejilla, el gap y los márgenes, que
 * quedarían desincronizados en cuanto alguien tocara el layout.
 *
 * Lo que cruza de una página a otra es un fotograma congelado del vídeo (no el
 * blob): pesa poco, cabe en `sessionStorage` y se ve igual que el vídeo durante
 * el medio segundo que dura el vuelo.
 */
import { gsap } from 'gsap';

const KEY = 'cminds.teleprompter.flight';

export interface FlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface FlightPayload {
  /** Grabación de destino: identifica la tarjeta a la que hay que volar. */
  id: string;
  /** Fotograma del vídeo como data URL. */
  image: string;
  /** Posición de partida, en coordenadas de viewport. */
  from: FlightRect;
}

export const rectOf = (el: Element): FlightRect => {
  const { top, left, width, height } = el.getBoundingClientRect();
  return { top, left, width, height };
};

/**
 * Congela el fotograma actual del vídeo.
 * Devuelve `null` si el vídeo aún no tiene datos o si el canvas está
 * contaminado (no debería: el blob es del mismo origen).
 */
export function captureFrame(video: HTMLVideoElement, maxWidth = 360): string | null {
  // HAVE_CURRENT_DATA: sin esto `drawImage` pintaría un fotograma vacío si se
  // guarda antes de que el clip haya decodificado nada.
  if (video.readyState < 2) return null;
  if (!video.videoWidth || !video.videoHeight) return null;

  const scale = Math.min(1, maxWidth / video.videoWidth);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);

  const context = canvas.getContext('2d');
  if (!context) return null;

  try {
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.6);
  } catch {
    return null;
  }
}

/** Guarda el vuelo pendiente antes de navegar. */
export function stashFlight(payload: FlightPayload): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    // Sin sessionStorage (modo privado, cuota) simplemente no hay animación.
  }
}

/** Lee el vuelo pendiente y lo consume: solo se reproduce una vez. */
export function takeFlight(): FlightPayload | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    return JSON.parse(raw) as FlightPayload;
  } catch {
    return null;
  }
}

/**
 * Anima el fotograma desde `payload.from` hasta el hueco de `target`.
 *
 * Se usa un clon flotante en `position: fixed` en lugar de mover la tarjeta:
 * la tarjeta ya está en su sitio dentro de la rejilla y moverla arrastraría al
 * resto. El clon vuela por encima y desaparece justo cuando la tarjeta aparece.
 */
export function playFlight(payload: FlightPayload, target: HTMLElement): Promise<void> {
  const to = rectOf(target);

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return Promise.resolve();
  }

  const clip = document.createElement('img');
  clip.src = payload.image;
  clip.alt = '';
  clip.setAttribute('aria-hidden', 'true');
  clip.className = 'pointer-events-none fixed z-50 object-cover';
  Object.assign(clip.style, {
    top: `${payload.from.top}px`,
    left: `${payload.from.left}px`,
    width: `${payload.from.width}px`,
    height: `${payload.from.height}px`,
    borderRadius: '0px',
  });
  document.body.appendChild(clip);

  // La tarjeta se mantiene invisible mientras el clip vuela hacia ella: así el
  // destino no «aparece» antes de tiempo y el aterrizaje se lee como uno solo.
  gsap.set(target, { autoAlpha: 0 });

  return new Promise((resolve) => {
    gsap
      .timeline({
        onComplete: () => {
          clip.remove();
          resolve();
        },
      })
      .to(clip, {
        top: to.top,
        left: to.left,
        width: to.width,
        height: to.height,
        borderRadius: '16px',
        duration: 0.68,
        ease: 'expo.inOut',
      })
      .to(clip, { autoAlpha: 0, duration: 0.18, ease: 'power2.in' }, '-=0.12')
      .to(target, { autoAlpha: 1, duration: 0.18, ease: 'power2.out' }, '<')
      .from(target, { scale: 0.92, duration: 0.45, ease: 'back.out(2)', clearProps: 'scale' }, '<');
  });
}
