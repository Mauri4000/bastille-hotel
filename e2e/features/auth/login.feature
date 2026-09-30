# ============================================================
# Feature: Login / Autenticacion
# ============================================================
# Cubre los flujos de ingreso al panel admin de Bastille Hotel.
# Tests positivos: login exitoso con credenciales validas.
# Tests negativos: credenciales invalidas, campos vacios.
#
# Tags:
#   @smoke      → se corre en cada deploy (subconjunto minimo critico)
#   @e2e        → suite completa de flujos de usuario
#   @negative   → solo tests de escenarios de fallo/error
# ============================================================

Feature: Login - Autenticacion al panel admin

  Background:
    # Este bloque se ejecuta ANTES de cada scenario en este feature.
    # Navega a la pagina de login y verifica que cargo bien.
    Given que estoy en la pagina de login


  # ── TESTS POSITIVOS ──────────────────────────────────────────────────────────

  @smoke @e2e
  Scenario: Login exitoso con credenciales validas
    # Verifica el flujo feliz: usuario ingresa credenciales correctas
    # y es redirigido al dashboard de administracion.
    When ingreso el email "<TEST_EMAIL>" y la password "<TEST_PASSWORD>"
    And hago click en el boton Ingresar
    Then debo ser redirigido al dashboard admin
    And el formulario de login no debe ser visible


  # ── SCENARIO OUTLINE: multiples combinaciones de credenciales invalidas ───────

  @e2e @negative
  Scenario Outline: Login fallido con credenciales invalidas
    # Scenario Outline permite probar varias combinaciones sin repetir steps.
    # La columna <caso> es solo descriptiva para el reporte.
    When ingreso el email "<email>" y la password "<password>"
    And hago click en el boton Ingresar
    Then debo ver un mensaje de error

    Examples:
      | caso                         | email                      | password       |
      | Email invalido               | noexiste@fake.com          | cualquier123   |
      | Password incorrecta          | <TEST_EMAIL>               | WrongPass999!  |
      | Email mal formateado         | esto-no-es-un-email        | AnyPass123     |


  @e2e @negative
  Scenario: Login con campos vacios muestra validacion
    # Verifica que el formulario no se envia si ambos campos estan vacios.
    # El browser o React deben mostrar un mensaje de validacion.
    When dejo el email y la password en blanco
    And hago click en el boton Ingresar
    Then el formulario de login debe seguir visible


  @smoke
  Scenario: La pagina de login carga correctamente
    # Test minimo: solo verifica que la pagina y el formulario cargan.
    # Si este falla, todos los demas fallaran tambien → es el primer smoke.
    Then el formulario de login debe ser visible
    And no debe haber mensajes de error visibles
