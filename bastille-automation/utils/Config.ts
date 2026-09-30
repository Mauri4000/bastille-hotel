/**
 * Config.ts
 * ---------
 * Centraliza todas las variables de entorno del framework.
 * Se carga UNA sola vez al arrancar la suite.
 *
 * Patron: Singleton + dotenv
 * Por que: si cambia la URL base solo tocas el .env, no el codigo.
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Carga el .env desde la raiz de la carpeta e2e/
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// ── Helpers privados ──────────────────────────────────────────────────────────

/**
 * Lee una variable de entorno y lanza error si no existe.
 * Obliga a que el .env este bien configurado antes de correr los tests.
 */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `[Config] Variable de entorno "${name}" no encontrada.\n` +
      `Copia e2e/.env.example a e2e/.env y completa los valores.`
    );
  }
  return value;
}

// ── Exportacion del objeto de configuracion ───────────────────────────────────

export const Config = {
  /** URL base de la aplicacion (ej: https://bastille-hotel-chi.vercel.app) */
  baseUrl: requireEnv('BASE_URL'),

  /** Credenciales del usuario de prueba con rol admin */
  credentials: {
    validEmail:    requireEnv('TEST_EMAIL'),
    validPassword: requireEnv('TEST_PASSWORD'),
    invalidEmail:    process.env.INVALID_EMAIL    ?? 'no-existe@fake.com',
    invalidPassword: process.env.INVALID_PASSWORD ?? 'WrongPass123!',
  },

  /** Timeout global en ms para waitFor, expect, etc. */
  timeout: parseInt(process.env.DEFAULT_TIMEOUT ?? '30000', 10),

  /** true = sin ventana del browser (CI), false = con ventana (debug local) */
  headless: process.env.HEADLESS !== 'false',
} as const;
