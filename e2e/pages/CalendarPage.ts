/**
 * CalendarPage.ts
 * ---------------
 * Page Object para la pagina del Calendario de Reservas (/admin/calendar).
 *
 * Patron: Page Object Model (POM) + Herencia de BasePage
 *
 * data-testid usados (definidos en src/admin/pages/CalendarPage.tsx):
 *   calendar-grid         → contenedor principal del calendario
 *   calendar-table        → tabla de habitaciones x dias
 *   btn-prev-month        → boton mes anterior
 *   btn-next-month        → boton mes siguiente
 *   month-label           → texto con "Mes Año" (ej: "Septiembre 2026")
 *   room-row-{id}         → fila de una habitacion especifica
 *   room-label-{id}       → celda con el nombre de la habitacion
 *   cell-{roomId}-{day}   → celda del calendario para una hab/dia
 *   urgencia-alert-{id}   → alerta de urgencia HABILITAR para una hab
 *   btn-marcar-habilitado → boton para marcar habitacion como habilitada
 */

import { Page } from 'playwright';
import { BasePage } from './BasePage';

export class CalendarPage extends BasePage {
  // ── Selectores ──────────────────────────────────────────────────────────────
  private readonly selGrid       = 'calendar-grid';
  private readonly selTable      = 'calendar-table';
  private readonly selPrevMonth  = 'btn-prev-month';
  private readonly selNextMonth  = 'btn-next-month';
  private readonly selMonthLabel = 'month-label';

  constructor(page: Page) {
    super(page);
  }

  // ── Navegacion ───────────────────────────────────────────────────────────────

  /** Abre la pagina del calendario */
  async open(): Promise<void> {
    await this.navigateTo('/admin/calendar');
  }

  /**
   * Verifica que el calendario cargo correctamente.
   * Busca el grid y la tabla de habitaciones.
   */
  async isLoaded(): Promise<boolean> {
    try {
      await this.assertVisible(this.selGrid);
      await this.assertVisible(this.selTable);
      return true;
    } catch {
      return false;
    }
  }

  // ── Acciones de navegacion de mes ────────────────────────────────────────────

  /**
   * Hace click en el boton de mes anterior.
   * Espera a que la tabla se actualice despues del click.
   */
  async goToPreviousMonth(): Promise<void> {
    console.log('[CalendarPage] Navegando al mes anterior');
    await this.click(this.getByTestId(this.selPrevMonth));
    // Esperamos un momento para que React re-renderice el calendario
    await this.page.waitForTimeout(500);
  }

  /**
   * Hace click en el boton de mes siguiente.
   */
  async goToNextMonth(): Promise<void> {
    console.log('[CalendarPage] Navegando al mes siguiente');
    await this.click(this.getByTestId(this.selNextMonth));
    await this.page.waitForTimeout(500);
  }

  // ── Getters de informacion ───────────────────────────────────────────────────

  /**
   * Retorna el texto del label del mes actual visible en pantalla.
   * Ejemplo: "Septiembre 2026"
   */
  async getCurrentMonthLabel(): Promise<string> {
    const locator = this.getByTestId(this.selMonthLabel);
    await locator.waitFor({ state: 'visible', timeout: this.timeout });
    return (await locator.textContent()) ?? '';
  }

  /**
   * Retorna el status de una celda del calendario.
   * El status es el valor del atributo data-status en la celda.
   *
   * @param roomId - ID de la habitacion
   * @param day    - dia del mes (numero, ej: 15)
   * @returns status: 'empty' | 'ocupado' | 'reserva' | 'mantenimiento' | 'limpieza' | 'habilitacion'
   */
  async getCellStatus(roomId: string, day: number): Promise<string> {
    try {
      const cell = this.page.locator(`[data-testid="cell-${roomId}-${day}"]`);
      await cell.waitFor({ state: 'attached', timeout: this.timeout });
      return (await cell.getAttribute('data-status')) ?? 'empty';
    } catch (error) {
      throw new Error(
        `[CalendarPage] No se encontro la celda para room=${roomId}, day=${day}: ${error}`
      );
    }
  }

  /**
   * Hace click en una celda del calendario para abrir el modal de reserva.
   *
   * @param roomId - ID de la habitacion
   * @param day    - dia del mes
   */
  async clickCell(roomId: string, day: number): Promise<void> {
    console.log(`[CalendarPage] Click en celda room=${roomId}, day=${day}`);
    try {
      const cell = this.page.locator(`[data-testid="cell-${roomId}-${day}"]`);
      await this.click(cell);
    } catch (error) {
      throw new Error(`[CalendarPage] Error al hacer click en celda: ${error}`);
    }
  }

  // ── Assertions ───────────────────────────────────────────────────────────────

  /**
   * Verifica que el grid principal del calendario es visible.
   */
  async assertCalendarVisible(): Promise<void> {
    await this.assertVisible(this.selGrid, 'El calendario debe estar visible');
    await this.assertVisible(this.selTable, 'La tabla del calendario debe estar visible');
  }

  /**
   * Verifica que el label del mes contiene el texto esperado.
   * @param expectedText - texto parcial del mes (ej: 'Septiembre', 'Octubre 2026')
   */
  async assertMonthLabel(expectedText: string): Promise<void> {
    await this.assertText(this.selMonthLabel, expectedText);
  }

  /**
   * Verifica que la fila de una habitacion existe en el calendario.
   * @param roomId - ID de la habitacion
   */
  async assertRoomRowVisible(roomId: string): Promise<void> {
    await this.assertVisible(
      `room-row-${roomId}`,
      `La fila de la habitacion ${roomId} debe ser visible`
    );
  }

  /**
   * Verifica que aparece la alerta de urgencia para una habitacion.
   * @param roomId - ID de la habitacion
   */
  async assertUrgenciaAlert(roomId: string): Promise<void> {
    await this.assertVisible(
      `urgencia-alert-${roomId}`,
      `La alerta de urgencia para habitacion ${roomId} debe ser visible`
    );
  }
}
