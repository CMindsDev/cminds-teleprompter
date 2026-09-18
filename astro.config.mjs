// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

/**
 * Autoriza cámara y micrófono en el propio origen durante el desarrollo.
 *
 * `vite.server.headers` no llega a las respuestas HTML que sirve Astro, así que
 * la cabecera se inyecta con un middleware del servidor de desarrollo. En
 * producción la ponen `public/_headers` (Netlify / Cloudflare) y `vercel.json`.
 */
const PERMISSIONS_POLICY = 'camera=(self), microphone=(self), display-capture=(self)';

/** @type {import('astro').AstroIntegration} */
const devPermissionsPolicy = {
  name: 'dev-permissions-policy',
  hooks: {
    'astro:server:setup': ({ server }) => {
      server.middlewares.use((_request, response, next) => {
        response.setHeader('Permissions-Policy', PERMISSIONS_POLICY);
        next();
      });
    },
  },
};

// https://astro.build/config
export default defineConfig({
  site: process.env.PUBLIC_SITE_URL || 'http://localhost:4321',
  // Todo el teleprompter es de navegador (getUserMedia + MediaRecorder), así que
  // `static` basta. Si más adelante se firma la subida al bucket desde el
  // servidor, cambiar a `output: 'server'` y añadir el adaptador de la plataforma.
  output: 'static',
  prefetch: { prefetchAll: true, defaultStrategy: 'viewport' },
  integrations: [devPermissionsPolicy],
  vite: {
    plugins: [tailwindcss()],
  },
});
