# ============================================================
# Feature: Cambio de Turno
# ============================================================
# Cubre el registro de turnos, conteo de ropa y validaciones
# en la pagina de Cambio de Turno del panel admin.
#
# Tags:
#   @smoke    → carga de la pagina de turnos
#   @e2e      → registro completo, ropa, ranking
#   @negative → campos requeridos, valores invalidos
# ============================================================

Feature: Cambio de Turno - Registro y gestion de turnos

  Background:
    # Pre-condicion: estar autenticado antes de cada scenario.
    Given que estoy autenticado como admin
    And estoy en la pagina de cambio de turno


  # ── TESTS POSITIVOS ──────────────────────────────────────────────────────────

  @smoke
  Scenario: La pagina de cambio de turno carga correctamente
    # Smoke basico: verifica que la tabla de turnos es visible.
    Then la tabla de turnos debe ser visible
    And el boton de registrar turno debe ser visible


  @e2e
  Scenario: Abrir el modal de registro de turno
    # Verifica que el modal se abre correctamente al hacer click en el boton.
    When hago click en el boton registrar turno
    Then el modal de turno debe estar abierto
    And el formulario del turno debe ser visible


  @e2e
  Scenario: Cerrar el modal con el boton cancelar
    # Verifica que el modal se puede cerrar sin guardar cambios.
    When hago click en el boton registrar turno
    And hago click en el boton cancelar del modal
    Then el modal de turno debe estar cerrado


  @e2e
  Scenario Outline: Registrar turno con diferentes tipos de ropa
    # Verifica que se puede registrar la cantidad de ropa doblada
    # para diferentes tipos. Cada fila del Outline es un tipo de turno.
    When hago click en el boton registrar turno
    And selecciono el tipo de turno "<turno>"
    And ingreso "<llaves>" llaves
    And ingreso <toallas_grandes> toallas grandes dobladas
    And ingreso <sabanas_grandes> sabanas grandes dobladas
    And guardo el turno
    Then el modal debe cerrarse
    And la tabla debe mostrar el turno registrado con turno "<turno>"

    Examples:
      | turno   | llaves | toallas_grandes | sabanas_grandes |
      | MAÑANA  | 21     | 5               | 3               |
      | TARDE   | 22     | 8               | 4               |
      | NOCHE   | 20     | 2               | 1               |


  # ── TESTS NEGATIVOS ──────────────────────────────────────────────────────────

  @e2e @negative
  Scenario: No se puede guardar un turno sin seleccionar responsable
    # Verifica que el formulario valida campos requeridos.
    # Sin responsable, el boton Guardar no debe completar el registro.
    When hago click en el boton registrar turno
    And no selecciono ningun responsable
    And hago click en guardar sin completar campos requeridos
    Then el modal debe seguir abierto
    And debe mostrarse un mensaje de validacion


  @e2e @negative
  Scenario: Ingresar valor negativo en conteo de ropa
    # Verifica que los campos de ropa no aceptan valores negativos.
    When hago click en el boton registrar turno
    And intento ingresar "-5" en el campo de toallas grandes
    Then el campo de toallas grandes no debe aceptar el valor negativo


  @e2e @negative
  Scenario: Usuario sin autenticacion no puede acceder a cambio de turno
    # Verifica que la ruta /admin/shift esta protegida.
    Given que NO estoy autenticado
    When intento acceder directamente a la pagina de cambio de turno
    Then debo ser redirigido a la pagina de login
