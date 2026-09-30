/**
 * BasePage.ts
 * -----------
 * Clase abstracta base que heredan todos los Page Objects.
 * Contiene metodos comunes reutilizables y configuracion de timeout.
 *
 * Patron: Page Object Model (POM) + Herencia (Inheritance)
 *
 * Por que abstract:
 * - No se puede instanciar directamente, obliga a crear clases concretas
 * - Garantiza que cada pagina implemente el metodo isLoaded()
 */

import { Page, Locator, expect } from '@playwright/test';
import { Config } from '../utils/Config';

export abstract class BasePage {
  /** Instancia de Playwright Page. Se inyecta en el constructor. */
  protected readonly page: Page;

  /** Timeout por defecto tomado del Config */
  protected readonly timeout: number;

  constructor(page: Page) {
    this.page    = page;
    this.timeout = Config.timeout;
  }

  // ── Navegacion ──────────────────────────────────────────────────────────────

  /**
   * Navega a la URL base de la aplicacion + el path de esta pagina.
   * @param path - ruta relativa (ej: '/admin', '/admin/calendar')
   */
  async navigateTo(path: string): Promise<void> {
    const url = `${Config.baseUrl}${path}`;
    console.log(`[BasePage] Navegando a: ${url}`);
    try {
      await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: this.timeout });
    } catch (error) {
      throw new Error(`[BasePage] No se pudo navegar a "${url}": ${error}`);
    }
  }

  /**
   * Verifica que la pagina actual esta cargada correctamente.
   * Cada subclase debe implementar su propia logica de verificacion.
   */
  abstract isLoaded(): Promise<boolean>;

  // ── Selectors helpers ───────────────────────────────────────────────────────

  /**
   * Retorna un Locator por data-testid.
   * Usar este metodo mantiene consistencia en todos los Page Objects.
   *
   * @param testId - valor del atributo data-testid
   */
  protected getByTestId(testId: string): Locator {
    return this.page.locator(`[data-testid="${testId}"]`);
  }

  /**
   * Retorna un Locator por texto visible (case-insensitive).
   * Util para botones y links cuando no tienen data-testid.
   */
  protected getByText(text: string): Locator {
    return this.page.getByText(text, { exact: false });
  }

  // ── Acciones comunes ────────────────────────────────────────────────────────

  /**
   * Hace click en un elemento y espera que sea visible primero.
   * @param locator - el elemento donde hacer click
   */
  protected async click(locator: Locator): Promise<void> {
    try {
      await locator.waitFor({ state: 'visible', timeout: this.timeout });
      await locator.click();
    } catch (error) {
      throw new Error(`[BasePage] Error al hacer click: ${error}`);
    }
  }

  /**
   * Limpia el campo y escribe texto nuevo.
   * @param locator - el campo de texto
   * @param text    - texto a escribir
   */
  protected async fill(locator: Locator, text: string): Promise<void> {
    try {
      await locator.waitFor({ state: 'visible', timeout: this.timeout });
      await locator.clear();
      await locator.fill(text);
    } catch (error) {
      throw new Error(`[BasePage] Error al escribir en campo: ${error}`);
    }
  }

  /**
   * Verifica que un elemento con data-testid sea visible en pantalla.
   * @param testId  - valor del data-testid
   * @param message - mensaje personalizado si falla el assert
   */
  async assertVisible(testId: string, message?: string): Promise<void> {
    const locator = this.getByTestId(testId);
    await expect(locator, message ?? `[data-testid="${testId}"] debe ser visible`).toBeVisible({
      timeout: this.timeout,
    });
  }

  /**
   * Verifica que un elemento con data-testid NO sea visible.
   * @param testId  - valor del data-testid
   */
  async assertHidden(testId: string): Promise<void> {
    const locator = this.getByTestId(testId);
    await expect(locator, `[data-testid="${testId}"] debe estar oculto`).toBeHidden({
      timeout: this.timeout,
    });
  }

  /**
   * Verifica que un elemento contenga el texto esperado.
   * @param testId       - valor del data-testid
   * @param expectedText - texto que debe contener el elemento
   */
  async assertText(testId: string, expectedText: string): Promise<void> {
    const locator = this.getByTestId(testId);
    await expect(locator).toContainText(expectedText, { timeout: this.timeout });
  }

  // ── URL ─────────────────────────────────────────────────────────────────────

  /** Retorna la URL actual del browser */
  getCurrentUrl(): string {
    return this.page.url();
  }

  /** Verifica que la URL actual contenga el path esperado */
  async assertUrlContains(expectedPath: string): Promise<void> {
    await expect(this.page).toHaveURL(new RegExp(expectedPath.replace(/\//g, '\\/')), {
      timeout: this.timeout,
    });
  }
}
