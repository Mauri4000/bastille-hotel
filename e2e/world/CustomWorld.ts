/**
 * CustomWorld.ts
 * --------------
 * "El mundo" de Cucumber: es el objeto 'this' dentro de cada step definition.
 * Aqui viven la instancia del browser, la page, y metodos de setup/teardown.
 *
 * Patron: World (Cucumber) + Singleton (browser compartido entre steps del mismo escenario)
 *
 * Por que CustomWorld:
 * - Evita pasar 'page' como parametro en cada step
 * - Centraliza el ciclo de vida del browser
 * - Permite acceder a page desde cualquier step con this.page
 */

import { IWorldOptions, World, setWorldConstructor } from '@cucumber/cucumber';
import { Browser, BrowserContext, Page, chromium } from 'playwright';
import { Config } from '../utils/Config';

// ── Tipado del World para TypeScript ──────────────────────────────────────────

export interface ICustomWorld extends World {
  browser:  Browser  | null;
  context:  BrowserContext | null;
  page:     Page     | null;

  /** Abre el browser y crea una page lista para usar */
  initBrowser(): Promise<void>;

  /** Cierra el browser y libera recursos */
  closeBrowser(): Promise<void>;
}

// ── Implementacion ────────────────────────────────────────────────────────────

export class CustomWorld extends World implements ICustomWorld {
  browser:  Browser        | null = null;
  context:  BrowserContext | null = null;
  page:     Page           | null = null;

  constructor(options: IWorldOptions) {
    super(options);
  }

  /**
   * Abre Chromium y crea una BrowserContext + Page.
   * Se llama en el hook Before de cada escenario.
   *
   * headless: false  → el browser se ve en pantalla (util para debug)
   * headless: true   → sin ventana (para correr en CI/GitHub Actions)
   */
  async initBrowser(): Promise<void> {
    try {
      this.browser = await chromium.launch({
        headless: Config.headless,
        slowMo: Config.headless ? 0 : 100, // 100ms de delay en modo visible, ayuda a ver los pasos
      });

      // Crear contexto con viewport estandar
      this.context = await this.browser.newContext({
        viewport: { width: 1280, height: 720 },
        // Ignorar errores de certificado SSL en ambientes de prueba
        ignoreHTTPSErrors: true,
      });

      this.page = await this.context.newPage();
      console.log(`[World] Browser iniciado - headless: ${Config.headless}`);
    } catch (error) {
      throw new Error(`[World] Error al iniciar el browser: ${error}`);
    }
  }

  /**
   * Cierra la page, el context y el browser.
   * Se llama en el hook After de cada escenario.
   */
  async closeBrowser(): Promise<void> {
    try {
      await this.page?.close();
      await this.context?.close();
      await this.browser?.close();
      this.page    = null;
      this.context = null;
      this.browser = null;
      console.log('[World] Browser cerrado correctamente');
    } catch (error) {
      console.error('[World] Error al cerrar el browser:', error);
    }
  }
}

// Registrar CustomWorld como el World de Cucumber
setWorldConstructor(CustomWorld);
