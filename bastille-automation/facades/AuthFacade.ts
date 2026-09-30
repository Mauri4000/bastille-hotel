/**
 * AuthFacade.ts
 * -------------
 * Fachada de autenticacion que simplifica las operaciones de login/logout
 * para que los steps BDD queden de UNA SOLA LINEA.
 *
 * Patron: Facade Pattern + Strategy Pattern
 *
 * Por que Facade:
 * - El step "Given que estoy autenticado como admin" debe ser 1 linea
 * - Internamente decide si usar UI (LoginPage) o API (AuthService)
 * - Oculta la complejidad de la decision al step
 *
 * Por que Strategy:
 * - LoginStrategy define el contrato
 * - UILoginStrategy: hace login por el formulario (para tests de auth)
 * - ApiLoginStrategy: hace login por API (para setup rapido)
 * - Si Bastille Hotel agrega Google OAuth, solo agregas GoogleLoginStrategy
 *
 * Flujo:
 *   Step → AuthFacade → LoginStrategy (UI o API) → LoginPage / AuthService
 *
 * Uso en steps:
 *   const facade = new AuthFacade(this.page);
 *   await facade.loginAsAdmin();           // login rapido (API si hay config, UI si no)
 *   await facade.loginViaUI(user);         // siempre por formulario (para tests de auth)
 *   await facade.logout();                 // cierra sesion
 */

import { Page } from 'playwright';
import { LoginPage }   from '../pages/LoginPage';
import { AuthService } from '../services/AuthService';
import { UserFactory, TestUser } from '../factories/UserFactory';
import { waitForUrl }  from '../utils/Helpers';

// ── Strategy Interface ────────────────────────────────────────────────────────

/**
 * Contrato que deben implementar todas las estrategias de login.
 * Patron Strategy: permite cambiar la implementacion sin modificar la Facade.
 */
interface LoginStrategy {
  /**
   * Ejecuta el flujo de autenticacion.
   * @param user - datos del usuario a autenticar
   */
  login(user: TestUser): Promise<void>;
}

// ── Estrategia 1: Login por UI (formulario) ───────────────────────────────────

/**
 * Hace login a traves del formulario visible en pantalla.
 * Usar cuando el TEST EN SI es sobre el login (tests positivos/negativos de auth).
 */
class UILoginStrategy implements LoginStrategy {
  constructor(private readonly page: Page) {}

  async login(user: TestUser): Promise<void> {
    const loginPage = new LoginPage(this.page);
    await loginPage.open();
    await loginPage.login(user.email, user.password);
    // Esperar la redireccion al dashboard
    await waitForUrl(this.page, '/admin');
    console.log(`[UILoginStrategy] Login exitoso por UI: ${user.email}`);
  }
}

// ── Estrategia 2: Login por API ───────────────────────────────────────────────

/**
 * Hace login directamente via API de Supabase (sin UI).
 * Usar cuando el login es solo un PRE-REQUISITO del test, no lo que se prueba.
 * Es mas rapido y mas estable para tests que prueban otras funcionalidades.
 */
class ApiLoginStrategy implements LoginStrategy {
  constructor(private readonly page: Page) {}

  async login(user: TestUser): Promise<void> {
    const authService = new AuthService(this.page);
    await authService.loginViaApi(user.email, user.password);
    console.log(`[ApiLoginStrategy] Login exitoso por API: ${user.email}`);
  }
}

// ── Facade ────────────────────────────────────────────────────────────────────

export class AuthFacade {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * Login como admin — metodo principal.
   * Usa API si SUPABASE_URL esta en el .env (mas rapido para CI).
   * Cae al login por UI si no hay config de Supabase.
   *
   * Este es el metodo que van a usar el 90% de los steps de Background:
   *   await facade.loginAsAdmin();
   */
  async loginAsAdmin(): Promise<void> {
    const user     = UserFactory.createAdmin();
    const strategy = this.selectStrategy();
    await strategy.login(user);
  }

  /**
   * Login por UI siempre (para tests que prueban el formulario de login).
   * Usar en los step definitions de login.feature.
   *
   * @param user - usuario a autenticar (viene de UserFactory)
   */
  async loginViaUI(user: TestUser): Promise<void> {
    const strategy = new UILoginStrategy(this.page);
    await strategy.login(user);
  }

  /**
   * Login para un usuario especifico (cualquier rol).
   * Usa la estrategia optima segun la configuracion disponible.
   *
   * @param user - objeto TestUser (creado con UserFactory)
   */
  async loginAs(user: TestUser): Promise<void> {
    const strategy = this.selectStrategy();
    await strategy.login(user);
  }

  /**
   * Cierra la sesion del usuario actual limpiando el storage.
   * Equivale a hacer logout sin tocar la UI.
   */
  async logout(): Promise<void> {
    const authService = new AuthService(this.page);
    await authService.clearSession();
    console.log('[AuthFacade] Sesion cerrada');
  }

  // ── Privado: seleccion de estrategia ─────────────────────────────────────

  /**
   * Decide que estrategia usar segun la configuracion.
   * Si hay SUPABASE_URL en el .env → API (rapido).
   * Si no → UI (siempre disponible).
   */
  private selectStrategy(): LoginStrategy {
    const hasSupabaseConfig =
      !!process.env.SUPABASE_URL && !!process.env.SUPABASE_ANON_KEY;

    if (hasSupabaseConfig) {
      console.log('[AuthFacade] Usando estrategia: API Login');
      return new ApiLoginStrategy(this.page);
    }

    console.log('[AuthFacade] Usando estrategia: UI Login');
    return new UILoginStrategy(this.page);
  }
}
