/**
 * Helpers.ts
 * ----------
 * Funciones de utilidad reutilizables en todos los tests.
 * Mantener aqui la logica comun evita duplicar codigo en los steps.
 *
 * Patron: Utility / Helper functions
 */

import { Page } from 'playwright';
import * as fs   from 'fs';
import * as path from 'path';

// ── Paths ─────────────────────────────────────────────────────────────────────

/** Carpeta donde se guardan los screenshots de fallos */
const SCREENSHOTS_DIR = path.resolve(__dirname, '../reports/screenshots');

// ── Screenshot helpers ────────────────────────────────────────────────────────

/**
 * Toma un screenshot y lo guarda en reports/screenshots/.
 * Se llama automaticamente desde el hook After cuando un test falla.
 *
 * @param page     - instancia de Playwright Page
 * @param testName - nombre del escenario (se usa como nombre de archivo)
 * @returns Buffer con la imagen PNG, o null si falla
 */
export async function takeScreenshot(
  page: Page,
  testName: string
): Promise<Buffer | null> {
  try {
    // Crear carpeta si no existe
    if (!fs.existsSync(SCREENSHOTS_DIR)) {
      fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
    }

    // Limpiar el nombre para usarlo como filename (sin caracteres especiales)
    const safeName = testName
      .replace(/[^a-z0-9]/gi, '_')
      .toLowerCase()
      .slice(0, 80);

    const timestamp  = new Date().toISOString().replace(/[:.]/g, '-');
    const filePath   = path.join(SCREENSHOTS_DIR, `${safeName}_${timestamp}.png`);

    const buffer = await page.screenshot({ path: filePath, fullPage: true });
    console.log(`[Screenshot] Guardado en: ${filePath}`);
    return buffer;
  } catch (error) {
    console.error('[Screenshot] Error al tomar screenshot:', error);
    return null;
  }
}

// ── Wait helpers ──────────────────────────────────────────────────────────────

/**
 * Espera hasta que la URL del browser contenga el path esperado.
 * Util para verificar redirecciones despues de login/logout.
 *
 * @param page         - instancia de Playwright Page
 * @param expectedPath - path parcial que debe aparecer en la URL (ej: '/admin')
 * @param timeout      - ms maximos de espera (default 10000)
 */
export async function waitForUrl(
  page: Page,
  expectedPath: string,
  timeout = 10_000
): Promise<void> {
  try {
    await page.waitForURL(`**${expectedPath}**`, { timeout });
  } catch (error) {
    const currentUrl = page.url();
    throw new Error(
      `[waitForUrl] Timeout esperando URL con "${expectedPath}".\n` +
      `URL actual: ${currentUrl}`
    );
  }
}

/**
 * Espera a que un elemento con data-testid sea visible.
 * Centraliza el selector para que sea facil cambiar a otro atributo en el futuro.
 *
 * @param page    - instancia de Playwright Page
 * @param testId  - valor del atributo data-testid (ej: 'login-form')
 * @param timeout - ms maximos de espera
 */
export async function waitForTestId(
  page: Page,
  testId: string,
  timeout = 10_000
): Promise<void> {
  try {
    await page.locator(`[data-testid="${testId}"]`).waitFor({ state: 'visible', timeout });
  } catch (error) {
    throw new Error(
      `[waitForTestId] El elemento [data-testid="${testId}"] no aparecio en ${timeout}ms.`
    );
  }
}

// ── String helpers ────────────────────────────────────────────────────────────

/**
 * Convierte una cadena vacia literalmente escrita en Gherkin ("") a undefined.
 * Util para Scenario Outlines donde una celda puede estar en blanco.
 *
 * @example
 *   blankToUndefined('""')  => undefined
 *   blankToUndefined('abc') => 'abc'
 */
export function blankToUndefined(value: string): string | undefined {
  return value === '""' || value.trim() === '' ? undefined : value;
}

/**
 * Pausa de N milisegundos. Usar solo en debug, nunca en CI.
 * En tests reales preferir waitForSelector o waitForURL.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
