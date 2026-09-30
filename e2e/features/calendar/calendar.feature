# ============================================================
# Feature: Calendario de Reservas
# ============================================================
# Cubre la visualizacion y navegacion del calendario de habitaciones.
# Pre-condicion: el usuario debe estar autenticado (login).
#
# Tags:
#   @smoke    → carga basica del calendario
#   @e2e      → navegacion de meses, verificacion de celdas
# ============================================================

Feature: Calendario - Visualizacion de reservas por habitacion

  Background:
    # Antes de cada scenario, hacemos login y navegamos al calendario.
    Given que estoy autenticado como admin
    And estoy en la pagina del calendario


  # ── TESTS POSITIVOS ──────────────────────────────────────────────────────────

  @smoke
  Scenario: El calendario carga correctamente
    # Smoke basico: verifica que el grid y la tabla de habitaciones son visibles.
    Then el grid del calendario debe ser visible
    And la tabla de habitaciones debe ser visible


  @e2e
  Scenario: Navegar al mes anterior actualiza el label del mes
    # Verifica que el boton de mes anterior funciona y cambia el mes mostrado.
    Given que el mes actual es visible en el calendario
    When hago click en el boton de mes anterior
    Then el label del mes debe cambiar


  @e2e
  Scenario: Navegar al mes siguiente actualiza el label del mes
    # Verifica que el boton de mes siguiente funciona.
    Given que el mes actual es visible en el calendario
    When hago click en el boton de mes siguiente
    Then el label del mes debe cambiar


  @e2e
  Scenario Outline: Navegar N meses hacia adelante y volver al mes actual
    # Verifica que se puede navegar multiples meses y volver al origen.
    # Util para detectar bugs de estado en el componente de calendario.
    When navego <meses> meses hacia adelante
    And navego <meses> meses hacia atras
    Then el label del mes debe mostrar el mes actual

    Examples:
      | meses |
      | 1     |
      | 3     |
      | 6     |


  # ── TESTS NEGATIVOS ──────────────────────────────────────────────────────────

  @e2e @negative
  Scenario: Usuario sin autenticacion es redirigido al login
    # Verifica que la ruta /admin/calendar esta protegida.
    # Si el usuario no tiene sesion, debe ser redirigido al login.
    Given que NO estoy autenticado
    When intento acceder directamente a la pagina del calendario
    Then debo ser redirigido a la pagina de login
