/**
 * LoginPage.ts
 * ------------
 * Page Object para la pantalla de login de Bastille Hotel (/admin).
 * Encapsula todos los selectores y acciones de autenticacion.
 *
 * Patron: Page Object Model (POM) + Herencia de BasePage
 *
 * data-testid usados (definidos en src/admin/pages/LoginPage.tsx):
 *   login-card     → contenedor de la tarjeta
 *   login-form     → formulario
 *   login-email    → input de email
 *   login-password → input de password
 *   login-submit   → boton "Ingresar"
 *   login-error    → mensaje de error (solo visible en fallo)
 */

import { Page } from 'playwright';
import { BasePage } from './BasePage';

export class LoginPage extends BasePage {
  // ── Selectores (todos por data-testid) ───────────────────────────────────────
  private readonly selCard     = 'login-card';
  private readonly selForm     = 'login-form';
  private readonly selEmail    = 'login-email';
  private readonly selPassword = 'login-password';
  private readonly selSubmit   = 'login-submit';
  private readonly selError    = 'login-error';

  constructor(page: Page) {
    super(page);
  }

  // ── Navegacion ───────────────────────────────────────────────────────────────

  /** Abre la pagina de login */
  async open(): Promise<void> {
    await this.navigateTo('/admin');
  }

  /**
   * Verifica que el formulario de login sea visible.
   * Se usa en el hook Before para asegurarse de que la pagina cargo.
   */
  async isLoaded(): Promise<boolean> {
    try {
      await this.assertVisible(this.selCard);
      return true;
    } catch {
      return false;
    }
  }

  // ── Acciones ─────────────────────────────────────────────────────────────────

  /**
   * Escribe el email en el campo de autenticacion.
   * @param email - direccion de email (valida o invalida segun el test)
   */
  async enterEmail(email: string): Promise<void> {
    await this.fill(this.getByTestId(this.selEmail), email);
  }

  /**
   * Escribe la contrasena en el campo de autenticacion.
   * @param password - contrasena (valida o invalida segun el test)
   */
  async enterPassword(password: string): Promise<void> {
    await this.fill(this.getByTestId(this.selPassword), password);
  }

  /**
   * Hace click en el boton "Ingresar" para enviar el formulario.
   */
  async clickSubmit(): Promise<void> {
    await this.click(this.getByTestId(this.selSubmit));
  }

  /**
   * Metodo completo de login: llena email, password y hace submit.
   * Usar este metodo en tests que no estan probando el flujo de login
   * sino que necesitan estar autenticados para probar otra cosa.
   *
   * @param email    - email del usuario
   * @param password - contrasena del usuario
   */
  async login(email: string, password: string): Promise<void> {
    console.log(`[LoginPage] Intentando login con: ${email}`);
    await this.enterEmail(email);
    await this.enterPassword(password);
    await this.clickSubmit();
  }

  // ── Assertions ───────────────────────────────────────────────────────────────

  /**
   * Verifica que el formulario de login es visible (usuario NO autenticado).
   */
  async assertLoginFormVisible(): Promise<void> {
    await this.assertVisible(this.selForm, 'El formulario de login debe estar visible');
  }

  /**
   * Verifica que el mensaje de error es visible con el texto esperado.
   * Se usa en tests negativos (credenciales incorrectas, campos vacios).
   *
   * @param expectedText - texto parcial que debe contener el error
   */
  async assertErrorMessage(expectedText?: string): Promise<void> {
    await this.assertVisible(this.selError, 'El mensaje de error debe ser visible');
    if (expectedText) {
      await this.assertText(this.selError, expectedText);
    }
  }

  /**
   * Verifica que NO hay mensaje de error visible.
   * Util para confirmar que el formulario inicio limpio.
   */
  async assertNoErrorMessage(): Promise<void> {
    await this.assertHidden(this.selError);
  }

  /**
   * Verifica que el login fue exitoso comprobando que la URL cambio
   * al dashboard de administracion.
   */
  async assertLoginSuccess(): Promise<void> {
    await this.assertUrlContains('/admin');
    // Ademas verificamos que el formulario de login ya NO esta visible
    // (el usuario fue redirigido al dashboard)
    await this.assertHidden(this.selForm);
  }
}
