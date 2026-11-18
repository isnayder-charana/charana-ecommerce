import type { AuthAdapter, SessionUser } from './session';

/**
 * ADAPTADOR de desarrollo: "inicia sesión" sin AWS guardando un usuario de
 * prueba en este navegador. La API, con AUTH_MODE=dev, acepta el token
 * "dev:<usuario>" o "dev:<usuario>:admin". La API prohíbe este modo en producción.
 */
const STORAGE_KEY = 'ct_dev_user';
const CHANGE_EVENT = 'ct-dev-auth-change';

interface DevUser {
  username: string;
  admin: boolean;
}

function read(): DevUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const value = raw ? (JSON.parse(raw) as Partial<DevUser>) : null;
    if (typeof value?.username !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(value.username)) {
      return null;
    }
    return { username: value.username, admin: value.admin === true };
  } catch {
    return null;
  }
}

function notify() {
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function signInAsTestUser(username: string, admin = false): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ username, admin }));
  notify();
}

export const devAuth: AuthAdapter = {
  async currentUser(): Promise<SessionUser | null> {
    const user = read();
    if (!user) return null;
    return {
      id: user.username,
      email: `${user.username}@ejemplo.dev`,
      name: user.admin ? `${user.username} (admin)` : user.username,
      isAdmin: user.admin,
    };
  },

  async accessToken() {
    const user = read();
    return user ? `dev:${user.username}${user.admin ? ':admin' : ''}` : null;
  },

  // En modo dev la API saca el correo del mismo token (usuario@ejemplo.dev).
  async idToken() {
    return devAuth.accessToken();
  },

  async signOut() {
    localStorage.removeItem(STORAGE_KEY);
    notify();
  },

  subscribe(onChange) {
    // "storage" avisa de cambios hechos en OTRAS pestañas.
    const handler = () => onChange();
    window.addEventListener(CHANGE_EVENT, handler);
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener(CHANGE_EVENT, handler);
      window.removeEventListener('storage', handler);
    };
  },
};
