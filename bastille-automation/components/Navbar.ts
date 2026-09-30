/**
 * Navbar.ts  (Component Object)
 * ------------------------------
 * Encapsula el sidebar de navegacion del panel admin.
 * Este componente aparece en TODAS las paginas autenticadas,
 * por eso vive en /components en lugar de en /pages.
 *
 * Patron: Page Component Object
 *
 * Por que Component Object:
 * - El sidebar se usa en Dashboard, Calendario, Turno, etc.
 * - Si cambia un selector del menu, solo se toca este archivo.
 * - Las paginas lo instancian en su constructor: this.navbar = new Navbar(page)
 *
 * Uso:
 *   const homePage = new DashboardPage(page);
 *   await homePage.navbar.navigateTo('calendar');
 */

import { Page, Locator } from 'playwright';

/** Claves de navegacion del sidebar */
export type NavSection =
  | 'dashboard'
  | 'calendar'
  | 'limpiezas'
  | 'transactions'
  | 'guests'
  | 'stock'
  | 'shift'
  | 'billetes'
  | 'reportes';

/** Mapa de seccion → texto del link en el sidebar */
const NAV_LABELS: Record<NavSection, string> = {
  dashboard:    'Dashboard',
  calendar:     'Calendario',
  limpiezas:    'Limpiezas',
  transactions: 'Ingresos / Egresos',
  guests:       'Base de Huéspedes',
  stock:        'Stock Hotel',
  shift:        'Cambio de Turno',
  billetes:     'Billetes',
  reportes:     'Reportes',
};

export class Navbar {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  // ── Locators ──────────────────────────────────────────────────────────────

  /** Link del sidebar por seccion */
  private navLink(section: NavSection): Locator {
    return this.page.getByRole('link', { name: NAV_LABELS[section], exact: false });
  }

  // ── Acciones ──────────────────────────────────────────────────────────────

  /**
   * Hace click en un item del sidebar y espera la carga de la pagina destino.
   *
   * @param section - nombre de la seccion (ej: 'calendar', 'shift')
   */
  async navigateTo(section: NavSection): Promise<void> {
    console.log(`[Navbar] Navegando a: ${section}`);
    try {
      const link = this.navLink(section);
      await link.waitFor({ state: 'visible', timeout: 10_000 });
      await link.click();
      // Esperar a que la nueva pagina cargue (sin depender de un selector especifico)
      await this.page.waitForLoadState('domcontentloaded');
    } catch (error) {
      throw new Error(`[Navbar] No se pudo navegar a "${section}": ${error}`);
    }
  }

  /**
   * Verifica que el link de una seccion del sidebar es visible.
   * Util para confirmar que el usuario tiene acceso a esa seccion segun su rol.
   *
   * @param section - seccion a verificar
   */
  async assertSectionVisible(section: NavSection): Promise<void> {
    const link = this.navLink(section);
    const isVisible = await link.isVisible();
    if (!isVisible) {
      throw new Error(`[Navbar] La seccion "${section}" no es visible en el sidebar`);
    }
  }

  /**
   * Verifica que el link de una seccion NO es visible.
   * Util para verificar restricciones de rol (ej: marketing no ve Billetes).
   *
   * @param section - seccion que debe estar oculta
   */
  async assertSectionHidden(section: NavSection): Promise<void> {
    const link = this.navLink(section);
    const isVisible = await link.isVisible();
    if (isVisible) {
      throw new Error(
        `[Navbar] La seccion "${section}" es visible pero no deberia serlo para este rol`
      );
    }
  }
}
