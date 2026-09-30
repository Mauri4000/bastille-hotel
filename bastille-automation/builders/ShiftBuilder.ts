/**
 * ShiftBuilder.ts
 * ---------------
 * Construye objetos de datos para el formulario de Cambio de Turno.
 * El formulario tiene muchos campos (llaves, facturacion, cajas, 7 tipos de ropa),
 * por eso el Builder Pattern es ideal: se construye paso a paso con metodo fluido.
 *
 * Patron: Builder Pattern (Fluent Interface)
 *
 * Por que Builder:
 * - El turno tiene +10 campos. Sin Builder, los tests tienen objetos literales enormes.
 * - Permite construir solo los campos relevantes para cada test
 * - Los valores por defecto estan en un lugar, no dispersos en los tests
 * - Legible: new ShiftBuilder().withShift('TARDE').withLinen(5, 3, 2).build()
 *
 * Uso:
 *   // Turno minimo (solo campos requeridos)
 *   const shift = new ShiftBuilder().build();
 *
 *   // Turno con ropa especifica
 *   const shiftConRopa = new ShiftBuilder()
 *     .withShift('MAÑANA')
 *     .withKeys(21)
 *     .withLinen({ towelsLarge: 8, sheetsLarge: 4 })
 *     .build();
 *
 *   // Turno de noche sin ropa
 *   const shiftNoche = new ShiftBuilder()
 *     .withShift('NOCHE')
 *     .withKeys(20)
 *     .build();
 */

/** Tipos de turno disponibles */
export type ShiftType = 'MAÑANA' | 'TARDE' | 'NOCHE';

/** Conteo de ropa doblada */
export interface LinenCount {
  towelsLarge:  number;  // Toallas grandes
  towelsSmall:  number;  // Toallas pequeñas
  sheetsLarge:  number;  // Sábanas grandes
  sheetsSmall:  number;  // Sábanas pequeñas
  pillowcases:  number;  // Fundas
  tablecloths:  number;  // Manteles
  duvets:       number;  // Edredones
}

/** Estructura completa de datos de un turno */
export interface ShiftData {
  shift:              ShiftType;
  keysCount:          number;
  billingInitial:     number;
  billingFinal:       number;
  cashInitial:        number;
  cashFinal:          number;
  pettyCashInitial:   number;
  pettyCashFinal:     number;
  linen:              LinenCount;
}

// ── Builder ───────────────────────────────────────────────────────────────────

export class ShiftBuilder {
  /** Estado interno del objeto que se esta construyendo */
  private data: ShiftData = {
    // Valores por defecto (minimo para que el formulario sea valido)
    shift:            'MAÑANA',
    keysCount:        21,
    billingInitial:   668,
    billingFinal:     668,
    cashInitial:      525.50,
    cashFinal:        525.50,
    pettyCashInitial: 350.20,
    pettyCashFinal:   350.20,
    linen: {
      towelsLarge:  0,
      towelsSmall:  0,
      sheetsLarge:  0,
      sheetsSmall:  0,
      pillowcases:  0,
      tablecloths:  0,
      duvets:       0,
    },
  };

  // ── Metodos fluidos (cada uno retorna this para encadenar) ────────────────

  /**
   * Establece el tipo de turno.
   * @param shift - 'MAÑANA' | 'TARDE' | 'NOCHE'
   */
  withShift(shift: ShiftType): this {
    this.data.shift = shift;
    return this;
  }

  /**
   * Establece la cantidad de llaves entregadas.
   * @param count - numero de llaves (ej: 21)
   */
  withKeys(count: number): this {
    this.data.keysCount = count;
    return this;
  }

  /**
   * Establece los valores de facturacion al inicio y fin del turno.
   * @param initial - facturacion inicial (Bs.)
   * @param final   - facturacion final (Bs.)
   */
  withBilling(initial: number, final: number): this {
    this.data.billingInitial = initial;
    this.data.billingFinal   = final;
    return this;
  }

  /**
   * Establece los valores de caja mayor al inicio y fin del turno.
   */
  withCash(initial: number, final: number): this {
    this.data.cashInitial = initial;
    this.data.cashFinal   = final;
    return this;
  }

  /**
   * Establece los valores de caja chica al inicio y fin del turno.
   */
  withPettyCash(initial: number, final: number): this {
    this.data.pettyCashInitial = initial;
    this.data.pettyCashFinal   = final;
    return this;
  }

  /**
   * Establece los conteos de ropa doblada.
   * Solo necesitas pasar los campos que quieres cambiar;
   * los demas conservan el valor por defecto (0).
   *
   * @param linen - objeto parcial con los conteos de ropa
   *
   * @example
   *   .withLinen({ towelsLarge: 8, sheetsLarge: 4 })
   */
  withLinen(linen: Partial<LinenCount>): this {
    this.data.linen = { ...this.data.linen, ...linen };
    return this;
  }

  /**
   * Construye y retorna el objeto final de datos del turno.
   * Se llama al final de la cadena: .build()
   *
   * Retorna una copia del objeto (inmutable) para evitar modificaciones accidentales.
   */
  build(): ShiftData {
    return { ...this.data, linen: { ...this.data.linen } };
  }

  // ── Presets de turno tipicos ──────────────────────────────────────────────

  /**
   * Preset: turno de manana con ropa tipica de lunes.
   * Los presets son shortcuts para scenarios comunes.
   */
  static typicalMorning(): ShiftData {
    return new ShiftBuilder()
      .withShift('MAÑANA')
      .withKeys(21)
      .withLinen({ towelsLarge: 6, towelsSmall: 4, sheetsLarge: 3 })
      .build();
  }

  /**
   * Preset: turno de tarde sin ropa doblada (recepcionista no doblo ropa).
   */
  static afternoonNoLinen(): ShiftData {
    return new ShiftBuilder()
      .withShift('TARDE')
      .withKeys(22)
      .build(); // linen queda todo en 0
  }

  /**
   * Preset: turno de noche con ropa maxima (muchos huespedes).
   */
  static busyNight(): ShiftData {
    return new ShiftBuilder()
      .withShift('NOCHE')
      .withKeys(20)
      .withLinen({
        towelsLarge:  12,
        towelsSmall:  8,
        sheetsLarge:  10,
        sheetsSmall:  6,
        pillowcases:  8,
        tablecloths:  4,
        duvets:       3,
      })
      .build();
  }
}
