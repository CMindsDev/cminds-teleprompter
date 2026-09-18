#!/usr/bin/env node
/**
 * Aplica la política CORS del bucket a partir de PUBLIC_ALLOWED_ORIGINS.
 *
 *   node scripts/apply-bucket-cors.mjs           # imprime la política
 *   node scripts/apply-bucket-cors.mjs --apply   # la escribe en el bucket
 *
 * `--apply` requiere el SDK del proveedor instalado, p. ej.:
 *   npm i -D @aws-sdk/client-s3     (para s3 / r2)
 */
import { readFileSync } from 'node:fs';
import process from 'node:process';

/** Lee .env sin dependencias: basta para pares clave=valor. */
function loadEnv(file = '.env') {
  try {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (match) process.env[match[1]] ??= match[2].replace(/^["']|["']$/g, '');
    }
  } catch {
    console.warn('No se encontró .env; se usan las variables del entorno.');
  }
}

const normalizeOrigin = (value) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`).origin;
  } catch {
    return null;
  }
};

loadEnv();

const origins = [
  ...new Set(
    String(process.env.PUBLIC_ALLOWED_ORIGINS ?? '')
      .split(',')
      .map(normalizeOrigin)
      .filter(Boolean),
  ),
];

if (origins.length === 0) {
  console.error('PUBLIC_ALLOWED_ORIGINS está vacío. Define al menos un dominio en .env.');
  process.exit(1);
}

const provider = process.env.PUBLIC_STORAGE_PROVIDER ?? 'none';
const policy = [
  {
    AllowedOrigins: origins,
    AllowedMethods: ['GET', 'HEAD', 'PUT', 'POST'],
    AllowedHeaders: ['*'],
    ExposeHeaders: ['ETag', 'Content-Length', 'Content-Type'],
    MaxAgeSeconds: 3600,
  },
];

console.log(`Proveedor: ${provider}`);
console.log(`Dominios autorizados:\n  ${origins.join('\n  ')}\n`);
console.log(JSON.stringify({ CORSRules: policy }, null, 2));

if (!process.argv.includes('--apply')) {
  console.log('\n(modo lectura) Añade --apply para escribir la política en el bucket.');
  process.exit(0);
}

if (provider !== 's3' && provider !== 'r2') {
  console.error(`\n--apply solo está implementado para s3/r2. Para "${provider}" aplica la política a mano.`);
  process.exit(1);
}

const { S3Client, PutBucketCorsCommand } = await import('@aws-sdk/client-s3').catch(() => {
  console.error('\nFalta @aws-sdk/client-s3. Instálalo con: npm i -D @aws-sdk/client-s3');
  process.exit(1);
});

const client = new S3Client({
  region: process.env.STORAGE_REGION || 'auto',
  endpoint: process.env.STORAGE_ENDPOINT || undefined,
  credentials: {
    accessKeyId: process.env.STORAGE_ACCESS_KEY_ID,
    secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY,
  },
});

await client.send(
  new PutBucketCorsCommand({
    Bucket: process.env.STORAGE_BUCKET,
    CORSConfiguration: { CORSRules: policy },
  }),
);

console.log(`\n✓ Política CORS aplicada a "${process.env.STORAGE_BUCKET}".`);
