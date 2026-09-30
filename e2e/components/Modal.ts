/**
 * Modal.ts  (Component Object)
 * -----------------------------
 * Componente generico para modals/dialogs de la app.
 * El modal de Cambio de Turno, confirmacion de borrado, etc.,
 * comparten comportamientos basicos: abrir, cerrar, scroll, guardar.
 *
 * Patron: Page Component Object
 *
 * Por que un Component Object para Modal:
 * - Varios page objects usan modals (ShiftPage, CalendarPage, etc.)
 * - La logica de "esperar que el modal este visible/oculto" se repite
 * - Si el overlay del modal cambia de clase, solo se toca aqui
 *
 * Uso dentro de un Page Object:
 *   this.modal = new Modal(page, 'shift-modal');
 *   await this.modal.waitUntilOpen();
 *   await this.modal.close();
 */

import { Page, Locator } from 'playwright';

export class Modal {
  private readonly page:     Page;
  private readonly testId:   string;
  private readonly locator:  Locator;
  private readonly timeout:  number;

  /**
   * @param page    - instancia de Playwright Page
   * @param testId  - data-testid del contenedor del modal (ej: 'shift-modal')
   * @param timeout - ms maximos de espera (default 10s)
   */
  constructor(page: Page, testId: string, timeout = 10_000) {
    this.page    = page;
    this.testId  = testId;
    this.timeout = timeout;
    this.locator = page.locator(`[data-testid="${testId}"]`);
  }

  // ── Estado ────────────────────────────────────────────────────────────────

  /**
   * Espera hasta que el modal sea visible en pantalla.
   * Se usa justo despues de la accion que lo abre (ej: click en boton).
   */
  async waitUntilOpen(): Promise<void> {
    try {
      await this.locator.waitFor({ state: 'visible', timeout: this.timeout });
      console.log(`[Modal] "${this.testId}" esta abierto`);
    } catch {
      throw new Error(
        `[Modal] El modal "${this.testId}" no aparecio en ${this.timeout}ms`
      );
    }
  }

  /**
   * Espera hasta que el modal desaparezca (despues de guardar o cancelar).
   */
  async waitUntilClosed(): Promise<void> {
    try {
      await this.locator.waitFor({ state: 'hidden', timeout: this.timeout });
      console.log(`[Modal] "${this.testId}" se cerro correctamente`);
    } catch {
      throw new Error(
        `[Modal] El modal "${this.testId}" no se cerro en ${this.timeout}ms`
      );
    }
  }

  /** Retorna true si el modal es visible en este momento */
  async isOpen(): Promise<boolean> {
    return this.locator.isVisible();
  }

  // ── Acciones ──────────────────────────────────────────────────────────────

  /**
   * Cierra el modal presionando la tecla Escape.
   * Funciona en la mayoria de dialogs de React.
   */
  async closeWithEscape(): Promise<void> {
    await this.page.keyboard.press('Escape');
    await this.waitUntilClosed();
  }

  /**
   * Cierra el modal haciendo click fuera de el (en el overlay).
   * Algunos modals lo permiten, otros no.
   */
  async closeByClickingOverlay(): Promise<void> {
    // Click en una coordenada fuera del modal (esquina superior izquierda)
    await this.page.mouse.click(10, 10);
    await this.page.waitForTimeout(500);
  }

  /**
   * Hace click en un boton dentro del modal identificado por data-testid.
   * @param buttonTestId - data-testid del boton
   */
  async clickButton(buttonTestId: string): Promise<void> {
    try {
      const btn = this.locator.locator(`[data-testid="${buttonTestId}"]`);
      await btn.waitFor({ state: 'visible', timeout: this.timeout });
      await btn.click();
    } catch (error) {
      throw new Error(
        `[Modal] No se pudo hacer click en boton "${buttonTestId}" dentro del modal: ${error}`
      );
    }
  }

  /**
   * Llena un campo de texto dentro del modal.
   * @param fieldTestId - data-testid del input
   * @param value       - valor a escribir
   */
  async fillField(fieldTestId: string, value: string): Promise<void> {
    try {
      const field = this.locator.locator(`[data-testid="${fieldTestId}"]`);
      await field.waitFor({ state: 'visible', timeout: this.timeout });
      await field.clear();
      await field.fill(value);
    } catch (error) {
      throw new Error(
        `[Modal] No se pudo llenar el campo "${fieldTestId}": ${error}`
      );
    }
  }

  // ── Assertions ────────────────────────────────────────────────────────────

  /** Afirma que el modal ESTA visible */
  async assertOpen(): Promise<void> {
    const open = await this.isOpen();
    if (!open) throw new Error(`[Modal] Se esperaba que "${this.testId}" estuviera abierto`);
  }

  /** Afirma que el modal NO esta visible */
  async assertClosed(): Promise<void> {
    const open = await this.isOpen();
    if (open) throw new Error(`[Modal] Se esperaba que "${this.testId}" estuviera cerrado`);
  }
}
