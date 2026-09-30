/**
 * login.steps.ts
 * --------------
 * Step definitions para el feature de Login/Autenticacion.
 *
 * Patron aplicado: Thin Steps
 * - Los steps son delgados: 1 linea por accion, sin logica propia
 * - La logica vive en: LoginPage (UI), AuthFacade (decision de estrategia),
 *   UserFactory (datos de usuario)
 *
 * Flujo: Feature → Steps → Facade/Factory → Page → UI
 */

import { Given, When, Then } from '@cucumber/cucumber';
import { CustomWorld }       from '../../world/CustomWorld';
import { LoginPage }         from '../../pages/LoginPage';
import { AuthFacade }        from '../../facades/AuthFacade';
import { UserFactory }       from '../../factories/UserFactory';
import { waitForUrl }        from '../../utils/Helpers';

// ── GIVEN ────────────────────────────────────────────────────────────────────

Given('que estoy en la pagina de login', async function (this: CustomWorld) {
  if (!this.page) throw new Error('[Step] page no inicializado (hook Before no corrio)');

  const loginPage = new LoginPage(this.page);
  await loginPage.open();

  if (!await loginPage.isLoaded()) {
    throw new Error('[Step] La pagina de login no cargo');
  }
});

/**
 * Step reutilizado como Background en todos los features protegidos.
 * Usa AuthFacade → selecciona automaticamente UI o API segun el .env
 */
Given('que estoy autenticado como admin', async function (this: CustomWorld) {
  if (!this.page) throw new Error('[Step] page no inicializado');

  // 1 linea gracias al Facade Pattern
  await new AuthFacade(this.page).loginAsAdmin();
});

Given('que NO estoy autenticado', async function (this: CustomWorld) {
  if (!this.page) throw new Error('[Step] page no inicializado');

  // Limpia token de sesion para garantizar que no hay sesion activa
  await new AuthFacade(this.page).logout();
});

// ── WHEN ─────────────────────────────────────────────────────────────────────

When(
  'ingreso el email {string} y la password {string}',
  async function (this: CustomWorld, email: string, password: string) {
    if (!this.page) throw new Error('[Step] page no inicializado');

    const loginPage = new LoginPage(this.page);
    await loginPage.enterEmail(email);
    await loginPage.enterPassword(password);
  }
);

When('hago click en el boton Ingresar', async function (this: CustomWorld) {
  if (!this.page) throw new Error('[Step] page no inicializado');

  await new LoginPage(this.page).clickSubmit();
});

When('dejo el email y la password en blanco', async function (this: CustomWorld) {
  // Campos ya estan vacios al cargar la pagina — no se hace nada
  console.log('[Step] Campos en blanco (intencionalmente)');
});

// ── THEN ─────────────────────────────────────────────────────────────────────

Then('debo ser redirigido al dashboard admin', async function (this: CustomWorld) {
  if (!this.page) throw new Error('[Step] page no inicializado');

  await waitForUrl(this.page, '/admin');
  await new LoginPage(this.page).assertLoginSuccess();
});

Then('el formulario de login no debe ser visible', async function (this: CustomWorld) {
  if (!this.page) throw new Error('[Step] page no inicializado');

  await new LoginPage(this.page).assertHidden('login-form');
});

Then('el formulario de login debe ser visible', async function (this: CustomWorld) {
  if (!this.page) throw new Error('[Step] page no inicializado');

  await new LoginPage(this.page).assertLoginFormVisible();
});

Then('debo ver un mensaje de error', async function (this: CustomWorld) {
  if (!this.page) throw new Error('[Step] page no inicializado');

  // Dar tiempo a Supabase para responder con el error
  await this.page.waitForTimeout(2000);
  await new LoginPage(this.page).assertErrorMessage();
});

Then('no debe haber mensajes de error visibles', async function (this: CustomWorld) {
  if (!this.page) throw new Error('[Step] page no inicializado');

  await new LoginPage(this.page).assertNoErrorMessage();
});

Then('debo ser redirigido a la pagina de login', async function (this: CustomWorld) {
  if (!this.page) throw new Error('[Step] page no inicializado');

  await waitForUrl(this.page, '/admin');
  await new LoginPage(this.page).assertLoginFormVisible();
});
