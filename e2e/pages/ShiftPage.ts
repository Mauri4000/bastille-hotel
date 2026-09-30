/**
 * ShiftPage.ts
 * ------------
 * Page Object para la pagina de Cambio de Turno (/admin/shift).
 * Cubre el registro de turnos, conteo de ropa y estados (Estado checkmarks).
 *
 * Patron: Page Object Model (POM) + Herencia de BasePage
 *
 * data-testid a agregar en ShiftPage.tsx para que estos tests funcionen:
 *   shift-table           → tabla principal de turnos
 *   btn-registrar-turno   → boton "+ Registrar turno"
 *   shift-modal           → modal de registro/edicion
 *   shift-form            → formulario dentro del modal
 *   shift-select-shift    → select del tipo de turno (MAÑANA/TARDE/NOCHE)
 *   shift-input-llaves    → input de cantidad de llaves
 *   shift-btn-save        → boton Guardar del modal
 *   shift-row-{id}        → fila de un turno especifico (cuando se conozca el ID)
 *   shift-ranking         → seccion del ranking de ropa
 */

import { Page } from 'playwright';
import { BasePage } from './BasePage';

export class ShiftPage extends BasePage {
  // ── Selectores ──────────────────────────────────────────────────────────────
  private readonly selTable          = 'shift-table';
  private readonly selBtnRegistrar   = 'btn-registrar-turno';
  private readonly selModal          = 'shift-modal';
  private readonly selForm           = 'shift-form';
  private readonly selSelectShift    = 'shift-select-shift';
  private readonly selInputLlaves    = 'shift-input-llaves';
  private readonly selBtnSave        = 'shift-btn-save';
  private readonly selRanking        = 'shift-ranking';

  constructor(page: Page) {
    super(page);
  }

  // ── Navegacion ───────────────────────────────────────────────────────────────

  /** Abre la pagina de Cambio de Turno */
  async open(): Promise<void> {
    await this.navigateTo('/admin/shift');
  }

  /**
   * Verifica que la pagina de turnos cargo correctamente.
   */
  async isLoaded(): Promise<boolean> {
    try {
      await this.assertVisible(this.selTable);
      return true;
    } catch {
      return false;
    }
  }

  // ── Acciones ─────────────────────────────────────────────────────────────────

  /**
   * Abre el modal de registro de nuevo turno.
   */
  async openNewShiftModal(): Promise<void> {
    console.log('[ShiftPage] Abriendo modal de nuevo turno');
    await this.click(this.getByTestId(this.selBtnRegistrar));
    // Esperar a que el modal este visible
    await this.assertVisible(this.selModal);
  }

  /**
   * Selecciona el tipo de turno en el select del modal.
   * @param shiftType - 'MAÑANA' | 'TARDE' | 'NOCHE'
   */
  async selectShiftType(shiftType: 'MAÑANA' | 'TARDE' | 'NOCHE'): Promise<void> {
    console.log(`[ShiftPage] Seleccionando turno: ${shiftType}`);
    try {
      const select = this.getByTestId(this.selSelectShift);
      await select.waitFor({ state: 'visible', timeout: this.timeout });
      await select.selectOption({ label: shiftType });
    } catch (error) {
      throw new Error(`[ShiftPage] Error al seleccionar turno "${shiftType}": ${error}`);
    }
  }

  /**
   * Ingresa la cantidad de llaves en el campo correspondiente.
   * @param count - numero de llaves (ej: '21')
   */
  async enterKeysCount(count: string): Promise<void> {
    await this.fill(this.getByTestId(this.selInputLlaves), count);
  }

  /**
   * Ingresa el conteo de ropa doblada para un tipo especifico.
   * Cada campo de ropa tiene data-testid = "linen-{key}" (ej: linen-towels-large).
   *
   * @param linenKey - clave del tipo de ropa (ej: 'towels-large')
   * @param count    - cantidad a ingresar
   */
  async enterLinenCount(linenKey: string, count: string): Promise<void> {
    const testId = `linen-${linenKey}`;
    try {
      await this.fill(this.getByTestId(testId), count);
    } catch (error) {
      throw new Error(
        `[ShiftPage] Error al ingresar ropa "${linenKey}": ${error}\n` +
        `Asegurate de que el input tiene data-testid="${testId}"`
      );
    }
  }

  /**
   * Hace click en el boton Guardar del modal para confirmar el registro.
   */
  async saveShift(): Promise<void> {
    console.log('[ShiftPage] Guardando turno');
    await this.click(this.getByTestId(this.selBtnSave));
    // Esperar a que el modal se cierre (confirmacion de guardado)
    await this.assertHidden(this.selModal);
  }

  // ── Assertions ───────────────────────────────────────────────────────────────

  /**
   * Verifica que la tabla de turnos es visible.
   */
  async assertTableVisible(): Promise<void> {
    await this.assertVisible(this.selTable, 'La tabla de turnos debe ser visible');
  }

  /**
   * Verifica que el modal de turno esta abierto.
   */
  async assertModalOpen(): Promise<void> {
    await this.assertVisible(this.selModal, 'El modal de turno debe estar abierto');
  }

  /**
   * Verifica que el modal de turno esta cerrado.
   */
  async assertModalClosed(): Promise<void> {
    await this.assertHidden(this.selModal);
  }

  /**
   * Verifica que la seccion de ranking de ropa es visible.
   * El ranking aparece solo cuando hay al menos un turno con ropa registrada.
   */
  async assertRankingVisible(): Promise<void> {
    await this.assertVisible(this.selRanking, 'El ranking de ropa debe ser visible');
  }

  /**
   * Verifica que los checkmarks de estado (INICIO/FINAL de caja)
   * de un turno especifico estan activos.
   *
   * @param rowTestId - data-testid de la fila del turno
   */
  async assertEstadoChecked(rowTestId: string): Promise<void> {
    // Los iconos de estado estan dentro de la fila
    const row = this.page.locator(`[data-testid="${rowTestId}"]`);
    await row.waitFor({ state: 'visible', timeout: this.timeout });
    // Verificar que hay al menos un checkmark verde (svg con clase text-green)
    const greenCheck = row.locator('[data-estado="ok"]');
    await expect(greenCheck.first()).toBeVisible({ timeout: this.timeout });
  }
}

// Importacion necesaria para el expect de Playwright
import { expect } from '@playwright/test';
