/**
 * hooks.ts
 * --------
 * Hooks globales de Cucumber: Before y After de cada escenario.
 *
 * Before → inicializa el browser y la page
 * After  → toma screenshot si el test fallo, luego cierra el browser
 *
 * Por que hooks globales:
 * - Evita repetir setup/teardown en cada step definition
 * - Garantiza que siempre se limpia el browser aunque el test falle
 * - Los screenshots de fallo son el primer paso para diagnosticar errores
 */

import { Before, After, ITestCaseHookParameter, Status } from '@cucumber/cucumber';
import { CustomWorld } from '../world/CustomWorld';
import { takeScreenshot } from '../utils/Helpers';

// ── Before: se ejecuta ANTES de cada escenario ───────────────────────────────

Before(async function (this: CustomWorld, scenario: ITestCaseHookParameter) {
  const scenarioName = scenario.pickle.name;
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`[Before] Iniciando: "${scenarioName}"`);
  console.log(`${'─'.repeat(60)}`);

  // Inicializa Chromium + context + page
  await this.initBrowser();
});

// ── After: se ejecuta DESPUES de cada escenario (fallo o exito) ──────────────

After(async function (this: CustomWorld, scenario: ITestCaseHookParameter) {
  const scenarioName = scenario.pickle.name;
  const result       = scenario.result;
  const status       = result?.status;

  // Si el test FALLO → tomar screenshot para adjuntar al reporte
  if (status === Status.FAILED && this.page) {
    console.log(`[After] Test FALLIDO: "${scenarioName}" - tomando screenshot...`);

    try {
      // Tomar screenshot y adjuntarlo al reporte de Cucumber/Allure
      const screenshotBuffer = await takeScreenshot(this.page, scenarioName);
      if (screenshotBuffer) {
        // attach() de Cucumber agrega el screenshot al reporte HTML/Allure
        await this.attach(screenshotBuffer, 'image/png');
        console.log('[After] Screenshot adjuntado al reporte');
      }
    } catch (screenshotError) {
      console.error('[After] No se pudo tomar screenshot:', screenshotError);
    }
  }

  // Siempre cerrar el browser al final (fallo o exito)
  await this.closeBrowser();

  console.log(`[After] Fin: "${scenarioName}" → ${status ?? 'UNKNOWN'}\n`);
});
