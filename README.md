# C MINDS · Teleprompter

App web para escribir un speech, leerlo en teleprompter mientras te grabas con
la cámara, y descargar el vídeo.

```bash
npm install
cp .env.example .env
npm run dev          # http://localhost:4321
```

## Stack

| Pieza | Elección | Por qué |
|---|---|---|
| Framework | Astro 7 (`output: 'static'`) | Todo ocurre en el navegador; no hace falta servidor |
| Estilos | Tailwind CSS 4 vía `@tailwindcss/vite` | Sin `tailwind.config`: el tema vive en `src/styles/global.css` |
| Animación | GSAP 3 | Escalonados, dibujado de SVG y el reloj del teleprompter |
| Transiciones de página | `ClientRouter` de Astro | Elementos compartidos entre pantallas (`transition:name`) |
| Glass | LiquidClass + respaldo CSS | Ver [aviso de licencia](#licencia-de-liquidclass) |
| Datos | localStorage + IndexedDB | Guiones y metadatos / blobs de vídeo |

No hay React, Vue ni Svelte: cada pantalla es un `<script>` de módulo con
TypeScript. `npm run check` pasa sin errores.

## Pantallas

| Ruta | Pantalla | Archivo |
|---|---|---|
| `/` | Portada | [index.astro](src/pages/index.astro) |
| `/editor` | Escribir el speech (vacío / con texto) | [editor.astro](src/pages/editor.astro) |
| `/grabar` | Cámara, grabación y teleprompter | [grabar.astro](src/pages/grabar.astro) |
| `/grabaciones` | Mis grabaciones | [grabaciones.astro](src/pages/grabaciones.astro) |

## Funciones del teleprompter

Velocidad y tamaño se ajustan **antes de grabar y durante la toma**, con el
mismo gesto en ambos estados ([slider.ts](src/lib/slider.ts)):

- **Velocidad** — icono del corredor → regla horizontal de marcas, 10–140 px/s
  (0.25×–3.5×, base 40 px/s)
- **Tamaño de fuente** — icono `Tt` → barra vertical, 20–72 px; conserva la
  posición de lectura al reescalar

Al encuadrar, abrir cualquiera de los dos muestra el texto atenuado sobre el
vídeo para poder juzgar el ajuste; el panel se cierra solo a los 4,5 s, al tocar
fuera o al cambiar de estado.

Durante la grabación se suman ([teleprompter.ts](src/lib/teleprompter.ts)):

- **Reproducir / pausar** el desplazamiento del texto
- **Avanzar / retroceder** por bloques de líneas
- **Espejo horizontal** para cristales de teleprompter físicos
- **Editar el texto** sin salir del flujo (botón «Editar»)
- **Barra de progreso** de lectura

Atajos de teclado: `↑`/`↓` velocidad y `+`/`-` tamaño funcionan en encuadre y
en grabación; `espacio` (reproducir/pausar) y `←`/`→` (saltar líneas) solo
mientras se graba.

## Revisar y guardar

Al detener, el clip se abre **a pantalla completa**: se reproduce solo, se toca
para pausar y «Repetir» lo reinicia desde el principio.

La toma **no se guarda sola**. Vive en memoria hasta que se pulsa «Guardar
video»; salir descarta (con confirmación) y cerrar la pestaña avisa antes. Es lo
que hace que el botón signifique algo.

Al guardar, el clip **vuela encogiéndose hasta su tarjeta** en «Mis
grabaciones» ([flight.ts](src/lib/flight.ts)). La animación se ejecuta en la
página de destino, no en la de grabación: es la única forma de medir dónde cae
la tarjeta de verdad en lugar de recalcular a mano la rejilla. Lo que cruza
entre páginas es un fotograma congelado en `sessionStorage`, no el vídeo.

La **descarga** está en el detalle de cada tarjeta. El formato es MP4 o WebM
según lo que soporte el navegador ([media.ts](src/lib/media.ts) prueba los
códecs en orden).

## Sin scroll para llegar al botón

Ni el editor ni la biblioteca obligan a desplazarse para alcanzar la acción
principal, por largo que sea el speech o la lista:

- **Editor** — la pantalla no se desplaza; lo hace el textarea por dentro. El
  botón y la barra de deshacer quedan fuera del flujo del texto, así que no hay
  nada que los empuje. Se evita `position: fixed` a propósito: el teclado del
  móvil lo desplaza o lo tapa.
- **Biblioteca** — barra fija con degradado, y `pb-32` en el contenido para que
  la última fila pueda subir por encima sin quedar oculta.

El alto de la app sale de `--app-vh`, que sigue a `visualViewport` en vez de a
`100vh`: al abrir el teclado la interfaz encoge y el botón se queda encima, no
debajo.

## Formato de captura

La salida es **1080×1920 siempre**, dé lo que dé la cámara.

Esto no se puede conseguir con restricciones. Ninguna opción de
`getUserMedia` obliga a una cámara a entregar vertical: muchos móviles Android
e iOS abren el sensor en horizontal (4:3 o 16:9) y no hay forma de impedirlo
desde la web. Grabar esa pista tal cual produce un archivo apaisado por mucho
que la interfaz enseñe un marco vertical.

Por eso `composeVertical` ([media.ts](src/lib/media.ts)) redibuja cada
fotograma, recortado al centro, sobre un lienzo de 1080×1920 y graba
`canvas.captureStream()` con el audio original. El recorte es exactamente el
que aplica `object-cover` en la vista previa, así que lo que se ve es lo que se
graba. Si el navegador no sabe capturar un lienzo, se graba la pista original y
se avisa.

**Cuidado con `aspectRatio`.** Pedir `aspectRatio: { ideal: 9/16 }` parece lo
razonable y rompe el móvil: el navegador publica las capacidades de la cámara
en el espacio del sensor, montado en horizontal, así que el rango disponible va
de 1.33 a 1.78. Un valor de 0.5625 no es alcanzable y se recorta al extremo más
cercano — 1.33, o sea **4:3 apaisado**, el peor resultado posible. Se piden solo
`width`/`height` en vertical: los móviles que saben abrir el sensor en vertical
lo hacen, y los que no, entregan apaisado a buena resolución, que es justo lo
que necesita el recorte posterior.

Las resoluciones están en `CAPTURE_FORMATS`, ya con `cuadrado` y `horizontal`
definidos para el selector de formato que viene después; el marco en pantalla
sale de `--capture-aspect` sobre `#stage`.

Para saber qué hace un dispositivo concreto, `/grabar?debug=1` muestra en
pantalla lo que informa la pista, lo que pinta el `<video>` y la resolución de
salida. En un móvil no hay consola, y esa diferencia es justo la que explica
los problemas de encuadre.

## Escritorio

La app es de diseño móvil, y en pantallas grandes se presenta como tal en lugar
de estirarse:

- A partir de 1024 px, el lienzo es una **columna enmarcada** sobre un fondo con
  profundidad. Va a toda altura, sin esquinas redondeadas ni márgenes, para que
  la barra fija de «Nuevo prompt» siga alineada con ella.
- La pantalla de grabación **se ensancha a 560 px**: una webcam es apaisada y a
  430 px el encuadre quedaba en una franja diminuta dentro de una columna muy
  alta.
- Las tarjetas muestran un **botón de eliminar al pasar el ratón**. Con ratón,
  «arrastra la tarjeta hacia arriba» no se descubre; el botón es el equivalente
  nativo de escritorio y comparte el mismo borrado con deshacer. En táctil no
  hay hover, así que no estorba, y con teclado se alcanza con el tabulador.

## Eliminar con gesto

Arrastrar una tarjeta **hacia arriba** la borra: el relleno rojo crece desde
abajo y, al llenarse, soltar elimina ([swipe-delete.ts](src/lib/swipe-delete.ts)).
Bajar el dedo antes de soltar cancela.

Un gesto vertical dentro de una lista que también se desplaza en vertical
compite consigo mismo — por eso iOS usa gestos horizontales. Aquí el gesto solo
se reclama cuando es **claramente** un arrastre hacia arriba (supera una holgura
de 14 px y el eje vertical domina al horizontal): un deslizamiento rápido para
recorrer la lista sigue haciendo scroll. Con ratón no hay conflicto, así que en
escritorio el arrastre se reclama desde el primer píxel.

Al eliminar aparece un **snackbar con «Deshacer» durante 5 s**. El borrado es
reversible por construcción: la ficha se quita al momento (la tarjeta
desaparece), pero el vídeo **no se toca** hasta que vence el aviso. Deshacer es
entonces devolver la ficha a su sitio, sin haber perdido nada — un gesto de
deslizar se dispara demasiado fácil como para que sea irreversible.

Si alguien sale de la pantalla durante esos 5 s, el borrado aplazado nunca
llega a ejecutarse. Al volver a la lista se barren los vídeos que ya no tiene
ninguna ficha, lo que cubre también los cierres bruscos de pestaña.

El gesto es un atajo, no la única vía: el botón «Eliminar» del detalle hace
exactamente lo mismo y es la ruta accesible por teclado y lector de pantalla.

## Cámara y micrófono

`getUserMedia` solo funciona en **contexto seguro**: `https://` o `localhost`.
Si abres el dev server desde otro dispositivo por IP (`npm run dev` escucha en
`--host`), la cámara no arrancará; usa un túnel https.

La autorización va por tres vías, todas apuntando al mismo origen:

- Desarrollo → middleware en [astro.config.mjs](astro.config.mjs)
- Netlify / Cloudflare Pages → [public/\_headers](public/_headers)
- Vercel → [vercel.json](vercel.json)

Los errores de permiso se traducen a mensajes legibles (denegado, sin
dispositivo, cámara ocupada, contexto inseguro) en vez de dejar un fallo mudo.
Las pistas se detienen al salir de la pantalla, así que el indicador de cámara
se apaga.

## Almacenamiento

Por defecto **nada sale del navegador**:

- Guiones y metadatos → `localStorage` ([store.ts](src/lib/store.ts))
- Vídeos → IndexedDB ([db.ts](src/lib/db.ts))

El bucket está **preparado pero desactivado** (`PUBLIC_STORAGE_PROVIDER="none"`).
Para activarlo:

1. Rellena las credenciales en `.env` y elige proveedor (`s3`, `r2`, `supabase`, `gcs`).
2. Cambia a `output: 'server'` en `astro.config.mjs` y añade el adaptador.
3. Crea `src/pages/api/upload-url.ts` que firme la URL **en el servidor** — las
   claves no deben llegar al navegador.
4. Aplica CORS: `npm run bucket:cors -- --apply`.

Los dominios autorizados salen de `PUBLIC_ALLOWED_ORIGINS`, que es la única
fuente de verdad para [cors.ts](src/lib/storage/cors.ts) y para el script
[apply-bucket-cors.mjs](scripts/apply-bucket-cors.mjs). Sin `--apply` el script
imprime la política para revisarla.

## Tipografías

Sora (cuerpo) y Parkinsans (títulos), desde Google Fonts. Se usan con las
utilidades `font-sans` y `font-display`; los tokens están en
[global.css](src/styles/global.css).

## Licencia de LiquidClass

`src/lib/liquid-glass/liquidClass.js` viene de
[KaliforniaGator/LiquidClass](https://github.com/KaliforniaGator/LiquidClass) y
está bajo **AGPL-3.0**. Su cláusula de red obliga a publicar el código fuente
de la obra combinada si despliegas la app en un dominio público.

La app **no depende** de esa librería: la clase `.liquid` de `global.css`
reproduce el glass con `backdrop-filter` y sombras internas. Lee
[NOTICE.md](src/lib/liquid-glass/NOTICE.md) para las opciones antes de
desplegar.

## Comandos

```bash
npm run dev            # servidor de desarrollo
npm run build          # build de producción a dist/
npm run preview        # sirve dist/
npm run check          # astro check (TypeScript)
npm run bucket:cors    # imprime la política CORS (--apply para escribirla)
```

Las capturas de referencia del diseño están en [docs/reference/](docs/reference/).
