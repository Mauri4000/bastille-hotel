/**
 * UserFactory.ts
 * --------------
 * Crea objetos de datos de usuario segun el rol.
 * Separa los datos de prueba de la logica de los tests.
 *
 * Patron: Factory Pattern
 *
 * Por que Factory:
 * - Si cambia el email del usuario de prueba, solo se toca este archivo
 * - Los steps y facades piden "dame un admin" sin saber los detalles
 * - Facil agregar nuevos roles en el futuro (marketing, recepcion)
 *
 * Uso:
 *   const admin = UserFactory.createAdmin();
 *   await loginPage.login(admin.email, admin.password);
 *
 *   const receptionist = UserFactory.createReceptionist();
 */

import { Config } from '../utils/Config';

// ── Tipos ─────────────────────────────────────────────────────────────────────

/** Roles disponibles en la aplicacion Bastille Hotel */
export type UserRole = 'admin' | 'recepcion' | 'marketing';

/** Estructura de datos de un usuario de prueba */
export interface TestUser {
  email:    string;
  password: string;
  role:     UserRole;
  name:     string;
}

// ── Factory ───────────────────────────────────────────────────────────────────

export class UserFactory {
  /**
   * Crea el objeto del usuario admin de prueba.
   * Las credenciales vienen del .env via Config.
   *
   * El usuario admin tiene acceso a todas las secciones del panel.
   */
  static createAdmin(): TestUser {
    return {
      email:    Config.credentials.validEmail,
      password: Config.credentials.validPassword,
      role:     'admin',
      name:     'Admin Test',
    };
  }

  /**
   * Crea un objeto de usuario con credenciales invalidas.
   * Se usa en tests negativos para verificar el rechazo del login.
   *
   * @param overrides - campos opcionales para sobrescribir (ej: solo el email)
   */
  static createInvalidUser(overrides: Partial<TestUser> = {}): TestUser {
    return {
      email:    Config.credentials.invalidEmail,
      password: Config.credentials.invalidPassword,
      role:     'recepcion',
      name:     'Usuario Invalido',
      ...overrides,
    };
  }

  /**
   * Crea un usuario con email valido pero password incorrecta.
   * Util para probar el mensaje de error especifico de password incorrecta.
   */
  static createUserWithWrongPassword(): TestUser {
    return {
      email:    Config.credentials.validEmail,
      password: Config.credentials.invalidPassword,
      role:     'admin',
      name:     'Admin (wrong pass)',
    };
  }

  /**
   * Crea un usuario con email mal formateado.
   * Util para probar la validacion de formato de email.
   */
  static createUserWithInvalidEmail(): TestUser {
    return {
      email:    'esto-no-es-un-email',
      password: 'AnyPass123',
      role:     'recepcion',
      name:     'Usuario Email Invalido',
    };
  }
}
