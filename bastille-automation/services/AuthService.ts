/**
 * AuthService.ts
 * --------------
 * Servicio de autenticacion que hace login directamente via API de Supabase,
 * sin tocar el browser. Mas rapido que el login por UI.
 *
 * Patron: Service Layer
 *
 * Cuando usar AuthService vs LoginPage:
 * ┌─────────────────────────────────────┬──────────────────┬────────────────┐
 * │ Escenario                           │ Usar             │ Por que        │
 * ├─────────────────────────────────────┼──────────────────┼────────────────┤
 * │ Test que PRUEBA el login             │ LoginPage (UI)   │ Es el sujeto   │
 * │ Test de Calendario (login necesario) │ AuthService(API) │ Login es setup │
 * │ Test negativo de credenciales        │ LoginPage (UI)   │ Prueba la UI   │
 * └─────────────────────────────────────┴──────────────────┴────────────────┘
 *
 * El token de sesion se inyecta en el localStorage del browser
 * para que Supabase lo reconozca sin pasar por el formulario.
 *
 * Uso:
 *   const authService = new AuthService(page);
 *   await authService.loginViaApi(user.email, user.password);
 *   // Ahora page tiene la sesion activa → navegar directo al dashboard
 */

import { Page } from 'playwright';
import { Config } from '../utils/Config';

/** Estructura minima de la respuesta de sesion de Supabase */
interface SupabaseSession {
  access_token:  string;
  refresh_token: string;
  expires_in:    number;
  token_type:    string;
  user: {
    id:    string;
    email: string;
    role:  string;
  };
}

export class AuthService {
  private readonly page:    Page;
  private readonly apiUrl:  string;
  private readonly anonKey: string;

  /**
   * @param page    - instancia de Playwright Page (para inyectar el token)
   * @param apiUrl  - URL de la API de Supabase (ej: https://xxx.supabase.co)
   * @param anonKey - clave publica de Supabase (VITE_SUPABASE_ANON_KEY)
   */
  constructor(page: Page, apiUrl?: string, anonKey?: string) {
    this.page    = page;
    // Estos valores pueden venir del .env o se pasan directamente
    this.apiUrl  = apiUrl  ?? process.env.SUPABASE_URL      ?? '';
    this.anonKey = anonKey ?? process.env.SUPABASE_ANON_KEY ?? '';
  }

  /**
   * Hace login directamente contra la API REST de Supabase (sin UI).
   * Inyecta el token en localStorage para que la app React lo reconozca.
   *
   * @param email    - email del usuario
   * @param password - contrasena del usuario
   */
  async loginViaApi(email: string, password: string): Promise<void> {
    if (!this.apiUrl || !this.anonKey) {
      console.warn(
        '[AuthService] SUPABASE_URL o SUPABASE_ANON_KEY no configurados en .env.\n' +
        'Usando login por UI como fallback.'
      );
      return;
    }

    try {
      console.log(`[AuthService] Login via API para: ${email}`);

      // Llamada directa a la API de autenticacion de Supabase
      const response = await fetch(
        `${this.apiUrl}/auth/v1/token?grant_type=password`,
        {
          method:  'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey':       this.anonKey,
          },
          body: JSON.stringify({ email, password }),
        }
      );

      if (!response.ok) {
        throw new Error(`[AuthService] API respondio con ${response.status}: ${response.statusText}`);
      }

      const session: SupabaseSession = await response.json();

      // Navegar primero a la app para que localStorage exista en ese dominio
      await this.page.goto(Config.baseUrl, { waitUntil: 'domcontentloaded' });

      // Inyectar el token en localStorage — el mismo formato que usa supabase-js
      await this.page.evaluate(
        ({ session, projectRef }) => {
          // La clave de localStorage que usa supabase-js es: sb-{projectRef}-auth-token
          const storageKey = `sb-${projectRef}-auth-token`;
          const value = JSON.stringify({
            access_token:  session.access_token,
            refresh_token: session.refresh_token,
            expires_in:    session.expires_in,
            token_type:    session.token_type,
            user:          session.user,
          });
          localStorage.setItem(storageKey, value);
        },
        {
          session,
          // El projectRef es la parte de la URL: https://{projectRef}.supabase.co
          projectRef: this.apiUrl.replace('https://', '').replace('.supabase.co', ''),
        }
      );

      // Recargar la app para que React lea el token del localStorage
      await this.page.reload({ waitUntil: 'domcontentloaded' });
      console.log('[AuthService] Sesion inyectada exitosamente');
    } catch (error) {
      throw new Error(`[AuthService] Error en login via API: ${error}`);
    }
  }

  /**
   * Limpia la sesion del browser eliminando el token de localStorage.
   * Equivalente a hacer logout desde el punto de vista de la app.
   */
  async clearSession(): Promise<void> {
    await this.page.evaluate(() => {
      // Eliminar todas las claves de Supabase del localStorage
      const keysToDelete = Object.keys(localStorage).filter(k => k.startsWith('sb-'));
      keysToDelete.forEach(k => localStorage.removeItem(k));
      sessionStorage.clear();
    });
    console.log('[AuthService] Sesion limpiada');
  }
}
