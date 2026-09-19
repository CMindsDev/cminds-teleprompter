import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';

/** Precarga el build completo; los datos personales permanecen en sus almacenes. */
export function offlineApp() {
  return {
    name: 'offline-app',
    hooks: {
      'astro:build:done': async ({ dir }) => {
        const root = fileURLToPath(dir);
        const files = [];
        const walk = async (folder) => {
          for (const item of await readdir(folder, { withFileTypes: true })) {
            const path = join(folder, item.name);
            if (item.isDirectory()) await walk(path);
            else if (/\.(html|js|css|svg|png|woff2?)$/.test(item.name) && item.name !== 'sw.js') files.push(path);
          }
        };
        await walk(root);
        files.sort();
        const hash = createHash('sha256');
        const urls = [];
        for (const path of files) {
          const url = '/' + relative(root, path).replaceAll('\\', '/');
          hash.update(url).update(await readFile(path));
          urls.push(url.endsWith('/index.html') ? url.slice(0, -10) : url);
        }
        const cacheName = 'cminds-app-' + hash.digest('hex').slice(0, 16);
        await writeFile(join(root, 'sw.js'), `
const CACHE = ${JSON.stringify(cacheName)};
const ASSETS = ${JSON.stringify(urls)};
self.addEventListener('install', event => {
  // Sin \`skipWaiting\` la versión nueva se queda en espera hasta que se cierren
  // TODAS las pestañas controladas por la anterior. En un móvil eso no pasa
  // nunca, así que el usuario seguiría viendo la interfaz vieja indefinidamente
  // por mucho que se despliegue. El cliente recarga al cambiar de controlador.
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith('cminds-app-') && name !== CACHE) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  const path = url.pathname;
  const key = ASSETS.includes(path) ? path : ASSETS.includes(path + '/') ? path + '/' : null;
  if (!key) return;
  // Las páginas son estáticas: ?id= se resuelve siempre con los datos locales.
  // Un único build por caché evita mezclar HTML y módulos de otras versiones.
  event.respondWith(caches.open(CACHE).then(async cache =>
    (await cache.match(key)) || fetch(event.request)
  ));
});
`);
      },
    },
  };
}
