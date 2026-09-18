/**
 * Consultas al DOM con tipo garantizado.
 *
 * `document.getElementById` devuelve `HTMLElement | null`, así que cada uso
 * arrastra una comprobación y, peor, TypeScript pierde el estrechamiento
 * dentro de los closures (que es justo donde vive la lógica de cada pantalla).
 * `need()` resuelve ambas cosas: falla pronto y devuelve el tipo exacto.
 */

export class MissingElementError extends Error {
  constructor(selector: string) {
    super(`No se encontró el elemento "${selector}" en el DOM.`);
    this.name = 'MissingElementError';
  }
}

/** Elemento obligatorio: lanza si falta o si no es del tipo esperado. */
export function need<T extends Element = HTMLElement>(
  id: string,
  ctor?: abstract new (...args: never[]) => T,
): T {
  const node = document.getElementById(id);
  if (!node) throw new MissingElementError(`#${id}`);
  if (ctor && !(node instanceof ctor)) {
    throw new MissingElementError(`#${id} (se esperaba ${ctor.name})`);
  }
  return node as unknown as T;
}

/** Elemento opcional: devuelve `null` si no está, sin lanzar. */
export function maybe<T extends Element = HTMLElement>(
  id: string,
  ctor?: abstract new (...args: never[]) => T,
): T | null {
  const node = document.getElementById(id);
  if (!node) return null;
  if (ctor && !(node instanceof ctor)) return null;
  return node as unknown as T;
}

/**
 * Arranca la lógica de una pantalla en cada carga de página.
 *
 * Con el ClientRouter de Astro el script del módulo se evalúa una sola vez,
 * así que la inicialización tiene que colgar de `astro:page-load`. Si la
 * pantalla no es la que toca (o falta un nodo) se descarta en silencio en vez
 * de romper la navegación entera.
 */
export function onScreen(rootId: string, setup: () => void | (() => void)): void {
  let teardown: (() => void) | void;

  document.addEventListener('astro:page-load', () => {
    if (!document.getElementById(rootId)) return;
    try {
      teardown = setup();
    } catch (error) {
      if (error instanceof MissingElementError) {
        console.warn(error.message);
        return;
      }
      throw error;
    }
  });

  document.addEventListener('astro:before-swap', () => {
    teardown?.();
    teardown = undefined;
  });
}
