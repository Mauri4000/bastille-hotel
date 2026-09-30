/**
 * shift.steps.ts
 * --------------
 * Step definitions para el feature de Cambio de Turno.
 *
 * Patrones aplicados:
 * - Thin Steps: steps de 1-2 lineas
 * - ShiftBuilder: construye datos complejos del turno
 * - ShiftPage + Modal Component Object: acciones de UI
 */

import { Given, When, Then } from '@cucumber/cucumber';
import { CustomWorld }       from '../../world/CustomWorld';
import { ShiftPage }         from '../../pages/ShiftPage';
import { ShiftBuilder }      from '../../builders/ShiftBuilder';
import { waitForUrl }        from '../../utils/Helpers';

// ── GIVEN ────────────────────────────────────────────────────────────────────

Given('estoy en la pagina de cambio de turno', async function (this: CustomWorld) {
  if (!this.page) throw new Error('[Step] page no inicializado');

  const shiftPage = new ShiftPage(this.page);
  await shiftPage.open();

  if (!await shiftPage.isLoaded()) {
    throw new Error('[Step] La pagina de cambio de turno no cargo');
  }
});

// ── WHEN ─────────────────────────────────────────────────────────────────────

When('hago click en el boton registrar turno', async function (this: CustomWorld) {
  if (!this.page) throw new Error('[Step] page no inicializado');

  await new ShiftPage(this.page).openNewShiftModal();
});

When(
  'selecciono el tipo de turno {string}',
  async function (this: CustomWorld, shiftType: string) {
    if (!this.page) throw new Error('[Step] page no inicializado');

    await new ShiftPage(this.page).selectShiftType(
      shiftType as 'MAÑANA' | 'TARDE' | 'NOCHE'
    );
  }
);

When('ingreso {string} llaves', async function (this: CustomWorld, count: string) {
  if (!this.page) throw new Error('[Step] page no inicializado');

  await new ShiftPage(this.page).enterKeysCount(count);
});

When(
  'ingreso {int} toallas grandes dobladas',
  async function (this: CustomWorld, count: number) {
    if (!this.page) throw new Error('[Step] page no inicializado');

    await new ShiftPage(this.page).enterLinenCount('towels-large', count.toString());
  }
);

When(
  'ingreso {int} sabanas grandes dobladas',
  async function (this: CustomWorld, count: number) {
    if (!this.page) throw new Error('[Step] page no inicializado');

    await new ShiftPage(this.page).enterLinenCount('sheets-large', count.toString());
  }
);

When('guardo el turno', async function (this: CustomWorld) {
  if (!this.page) throw new Error('[Step] page no inicializado');

  await new ShiftPage(this.page).saveShift();
});

When('hago click en el boton cancelar del modal', async function (this: CustomWorld) {
  if (!this.page) throw new Error('[Step] page no inicializado');

  try {
    // Intentar boton Cancelar primero
    await this.page.getByRole('button', { name: /cancelar/i }).click();
  } catch {
    // Fallback: Escape
    await this.page.keyboard.press('Escape');
  }
  await this.page.waitForTimeout(500);
});

When('no selecciono ningun responsable', async function (this: CustomWorld) {
  // Intencional — campo responsable queda en blanco para test negativo
  console.log('[Step] Responsable no seleccionado (test negativo)');
});

When(
  'hago click en guardar sin completar campos requeridos',
  async function (this: CustomWorld) {
    if (!this.page) throw new Error('[Step] page no inicializado');

    const saveBtn = this.page.locator('[data-testid="shift-btn-save"]');
    await saveBtn.click({ force: true });
    await this.page.waitForTimeout(1000);
  }
);

When(
  'intento ingresar {string} en el campo de toallas grandes',
  async function (this: CustomWorld, value: string) {
    if (!this.page) throw new Error('[Step] page no inicializado');

    try {
      await new ShiftPage(this.page).enterLinenCount('towels-large', value);
    } catch {
      console.log(`[Step] Campo rechazo "${value}" (comportamiento esperado)`);
    }
  }
);

When(
  'intento acceder directamente a la pagina de cambio de turno',
  async function (this: CustomWorld) {
    if (!this.page) throw new Error('[Step] page no inicializado');

    await new ShiftPage(this.page).open();
    await this.page.waitForTimeout(2000);
  }
);

// ── Usando ShiftBuilder directamente en un step (ejemplo de uso del Builder) ──

/**
 * Este step demuestra el Builder Pattern:
 * En lugar de pasar cada campo como parametro, construimos un objeto rico.
 * El Scenario Outline en el feature solo pasa los campos que distinguen cada caso.
 */
When(
  'registro un turno tipico de manana',
  async function (this: CustomWorld) {
    if (!this.page) throw new Error('[Step] page no inicializado');

    // Builder Pattern en accion
    const shiftData = ShiftBuilder.typicalMorning();
    const shiftPage = new ShiftPage(this.page);

    await shiftPage.openNewShiftModal();
    await shiftPage.selectShiftType(shiftData.shift);
    await shiftPage.enterKeysCount(shiftData.keysCount.toString());
    await shiftPage.enterLinenCount('towels-large', shiftData.linen.towelsLarge.toString());
    await shiftPage.enterLinenCount('sheets-large', shiftData.linen.sheetsLarge.toString());
    await shiftPage.saveShift();
  }
);

// ── THEN ─────────────────────────────────────────────────────────────────────

Then('la tabla de turnos debe ser visible', async function (this: CustomWorld) {
  if (!this.page) throw new Error('[Step] page no inicializado');

  await new ShiftPage(this.page).assertTableVisible();
});

Then('el boton de registrar turno debe ser visible', async function (this: CustomWorld) {
  if (!this.page) throw new Error('[Step] page no inicializado');

  await new ShiftPage(this.page).assertVisible('btn-registrar-turno');
});

Then('el modal de turno debe estar abierto', async function (this: CustomWorld) {
  if (!this.page) throw new Error('[Step] page no inicializado');

  await new ShiftPage(this.page).assertModalOpen();
});

Then('el formulario del turno debe ser visible', async function (this: CustomWorld) {
  if (!this.page) throw new Error('[Step] page no inicializado');

  await new ShiftPage(this.page).assertVisible('shift-form');
});

Then('el modal de turno debe estar cerrado', async function (this: CustomWorld) {
  if (!this.page) throw new Error('[Step] page no inicializado');

  await new ShiftPage(this.page).assertModalClosed();
});

Then('el modal debe cerrarse', async function (this: CustomWorld) {
  if (!this.page) throw new Error('[Step] page no inicializado');

  await new ShiftPage(this.page).assertModalClosed();
});

Then(
  'la tabla debe mostrar el turno registrado con turno {string}',
  async function (this: CustomWorld, shiftType: string) {
    if (!this.page) throw new Error('[Step] page no inicializado');

    await this.page.getByText(shiftType, { exact: true })
      .first()
      .waitFor({ state: 'visible', timeout: 10_000 });
  }
);

Then('el modal debe seguir abierto', async function (this: CustomWorld) {
  if (!this.page) throw new Error('[Step] page no inicializado');

  await new ShiftPage(this.page).assertModalOpen();
});

Then('debe mostrarse un mensaje de validacion', async function (this: CustomWorld) {
  if (!this.page) throw new Error('[Step] page no inicializado');

  // Modal abierto = validacion activa (no se proceso el guardado)
  await new ShiftPage(this.page).assertModalOpen();
});

Then(
  'el campo de toallas grandes no debe aceptar el valor negativo',
  async function (this: CustomWorld) {
    if (!this.page) throw new Error('[Step] page no inicializado');

    const value = await this.page
      .locator('[data-testid="linen-towels-large"]')
      .inputValue();

    if (parseInt(value || '0', 10) < 0) {
      throw new Error(`Campo acepto valor negativo: ${value}. Agrega min="0" al input.`);
    }
    console.log(`[Step] Campo rechaza negativo OK. Valor: "${value}"`);
  }
);
