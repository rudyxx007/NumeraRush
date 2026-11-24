import { existsSync } from 'node:fs';
import { z } from 'zod';

function loadLocalEnvFile(): void {
  if (!existsSync('.env')) return;
  try {
    process.loadEnvFile('.env');
  } catch (error) {
    console.warn('[env] Unable to load apps/server/.env', error);
  }
}

loadLocalEnvFile();

const EnvSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  HOST: z.string().min(1).default('127.0.0.1'),
  CORS_ORIGIN: z.string().min(1).default('http://localhost:5173'),
  SUPABASE_URL: z.string().optional().default(''),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional().default(''),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`)
    .join('; ');
  console.error(`[env] Invalid environment configuration — ${details}`);
  console.error('[env] Copy apps/server/.env.example to apps/server/.env and fill in the values.');
  throw new Error(`INVALID_ENV: ${details}`);
}

export const env = parsed.data;

function isUsableSupabaseConfig(url: string | undefined, key: string | undefined): boolean {
  if (!url || !key) return false;
  if (url.includes('<') || url.includes('>') || key.includes('<')) return false;
  try {
    const parsedUrl = new URL(url);
    return (
      (parsedUrl.protocol === 'https:' || parsedUrl.protocol === 'http:') &&
      parsedUrl.hostname.includes('.')
    );
  } catch {
    return false;
  }
}

export const isSupabaseConfigured = isUsableSupabaseConfig(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
);
