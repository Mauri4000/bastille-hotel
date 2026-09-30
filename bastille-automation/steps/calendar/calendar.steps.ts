/**
 * calendar.steps.ts
 * -----------------
 * Step definitions para el feature del Calendario de Reservas.
 *
 * Patron: Thin steps → la logica de interaccion vive en CalendarPage.ts
 *
 * Nota: el step 'que estoy autenticado como admin' esta definido en
 *       login.steps.ts y es reutilizado aqui (Cucumber comparte steps
 *       entre todos los archivos del proyecto).
 */

import { Given, When, Then } from '@cucumber/cucumber';
import { CustomWorld }       from '../../world/CustomWorld';
import { CalendarPage }      from '../../pages/CalendarPage';
import { waitForUrl }        from '../../utils/Helpers';
import { Config }            from '../../utils/Config';

// Guardamos el mes inicial para poder comparar despues de navegar
let initialMonthLabel = '';

// ── GIVEN ────────────────────────────────────────────────────────────────────

Given('estoy en la pagina del calendario', async function (this: CustomWorld) {
  if (!this.page) throw new Error('[Step] this.page es null');

  const calendarPage = new CalendarPage(this.page);
  await calendarPage.open();

  const loaded = await calendarPage.isLoaded();
  if (!loaded) {
    throw new Error('[Step] El calendario no cargo correctamente');
  }
});

Given('que el mes actual es visible en el calendario', async function (this: CustomWorld) {
  if (!this.page) throw new Error('[Step] this.page es null');

  const calendarPage  = new CalendarPage(this.page);
  // Guardamos el label del mes antes de navegar para comparar despues
  initialMonthLabel = await calendarPage.getCurrentMonthLabel();
  console.log(`[Step] Mes inicial: "${initialMonthLabel}"`);
});

// ── WHEN ─────────────────────────────────────────────────────────────────────

When('hago click en el boton de mes anterior', async function (this: CustomWorld) {
  if (!this.page) throw new Error('[Step] this.page es null');

  const calendarPage = new CalendarPage(this.page);
  await calendarPage.goToPreviousMonth();
});

When('hago click en el boton de mes siguiente', async function (this: CustomWorld) {
  if (!this.page) throw new Error('[Step] this.page es null');

  const calendarPage = new CalendarPage(this.page);
  await calendarPage.goToNextMonth();
});

When('navego {int} meses hacia adelante', async function (this: CustomWorld, months: number) {
  if (!this.page) throw new Error('[Step] this.page es null');

  const calendarPage = new CalendarPage(this.page);

  // Guardar el mes inicial antes de empezar a navegar
  initialMonthLabel = await calendarPage.getCurrentMonthLabel();
  console.log(`[Step] Navegando ${months} meses hacia adelante desde: "${initialMonthLabel}"`);

  for (let i = 0; i < months; i++) {
    await calendarPage.goToNextMonth();
  }
});

When('navego {int} meses hacia atras', async function (this: CustomWorld, months: number) {
  if (!this.page) throw new Error('[Step] this.page es null');

  const calendarPage = new CalendarPage(this.page);
  console.log(`[Step] Navegando ${months} meses hacia atras`);

  for (let i = 0; i < months; i++) {
    await calendarPage.goToPreviousMonth();
  }
});

When(
  'intento acceder directamente a la pagina del calendario',
  async function (this: CustomWorld) {
    if (!this.page) throw new Error('[Step] this.page es null');

    const calendarPage = new CalendarPage(this.page);
    await calendarPage.open();
    // Esperamos la posible redireccion al login
    await this.page.waitForTimeout(2000);
  }
);

// ── THEN ─────────────────────────────────────────────────────────────────────

Then('el grid del calendario debe ser visible', async function (this: CustomWorld) {
  if (!this.page) throw new Error('[Step] this.page es null');

  const calendarPage = new CalendarPage(this.page);
  await calendarPage.assertCalendarVisible();
});

Then('la tabla de habitaciones debe ser visible', async function (this: CustomWorld) {
  if (!this.page) throw new Error('[Step] this.page es null');

  const calendarPage = new CalendarPage(this.page);
  await calendarPage.assertVisible('calendar-table');
});

Then('el label del mes debe cambiar', async function (this: CustomWorld) {
  if (!this.page) throw new Error('[Step] this.page es null');

  const calendarPage    = new CalendarPage(this.page);
  const newMonthLabel   = await calendarPage.getCurrentMonthLabel();

  console.log(`[Step] Mes inicial: "${initialMonthLabel}" | Mes nuevo: "${newMonthLabel}"`);

  // Verificar que el label cambio
  if (newMonthLabel === initialMonthLabel) {
    throw new Error(
      `[Step] El label del mes NO cambio. Sigue siendo: "${newMonthLabel}"`
    );
  }
  console.log('[Step] El label del mes cambio correctamente');
});

Then(
  'el label del mes debe mostrar el mes actual',
  async function (this: CustomWorld) {
    if (!this.page) throw new Error('[Step] this.page es null');

    const calendarPage  = new CalendarPage(this.page);
    const currentLabel  = await calendarPage.getCurrentMonthLabel();

    console.log(
      `[Step] Verificando: label="${currentLabel}" vs inicial="${initialMonthLabel}"`
    );

    // Despues de navegar N meses adelante y N atras, debemos estar en el mes original
    if (currentLabel !== initialMonthLabel) {
      throw new Error(
        `[Step] El mes no volvio al inicial.\n` +
        `Esperado: "${initialMonthLabel}"\n` +
        `Actual:   "${currentLabel}"`
      );
    }
  }
);
