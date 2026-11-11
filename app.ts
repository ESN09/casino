import { create } from './store';
import { LocalServer } from '../server/localServer';
import { GameError, type DailyStatus, type GameServer, type ProfileView } from '../server/types';
import { sfx } from '../audio/sfx';

/**
 * État global côté client. Le client ne calcule jamais un gain : il reflète
 * le profil renvoyé par le serveur.
 */
export const server: GameServer = new LocalServer();

export type Route = 'lobby' | 'slots' | 'blackjack' | 'cases' | 'collection' | 'daily' | 'profile';

export interface Toast { id: number; text: string; kind: 'info' | 'win' | 'error' }

interface AppState {
  profile: ProfileView | null;
  daily: DailyStatus | null;
  route: Route;
  toasts: Toast[];
  sessionStart: number;
  go(route: Route): void;
  setProfile(p: ProfileView): void;
  refresh(): Promise<void>;
  toast(text: string, kind?: Toast['kind']): void;
  dismiss(id: number): void;
}

let toastId = 0;
const ROUTES: Route[] = ['lobby', 'slots', 'blackjack', 'cases', 'collection', 'daily', 'profile'];
const routeFromHash = (): Route => { const h = location.hash.slice(1) as Route; return ROUTES.includes(h) ? h : 'lobby'; };


export const useApp = create<AppState>((set, get) => ({
  profile: null,
  daily: null,
  route: routeFromHash(),
  toasts: [],
  sessionStart: Date.now(),
  go(route) {
    sfx.click();
    if (location.hash.slice(1) !== route) location.hash = route;
    set({ route });
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  },
  setProfile(p) {
    sfx.enabled = p.settings.sound;
    document.documentElement.classList.toggle('reduced-motion', p.settings.reducedMotion);
    set({ profile: p });
  },
  async refresh() {
    const [p, d] = await Promise.all([server.getProfile(), server.dailyStatus()]);
    get().setProfile(p);
    set({ daily: d });
  },
  toast(text, kind = 'info') {
    const id = ++toastId;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, text, kind }] }));
    setTimeout(() => get().dismiss(id), kind === 'error' ? 4500 : 3200);
  },
  dismiss(id) { set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })); },
}));

window.addEventListener('hashchange', () => { if (useApp.getState().route !== routeFromHash()) useApp.setState({ route: routeFromHash() }); });

/** Nouvelle clé d'idempotence par intention de l'utilisateur. */
export const newKey = (): string => globalThis.crypto.randomUUID();

/** Exécute un appel serveur et affiche les erreurs métier en toast. */
export async function call<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (e) {
    const msg = e instanceof GameError ? e.message : 'Une erreur inattendue est survenue.';
    if (!(e instanceof GameError)) console.error(e);
    useApp.getState().toast(msg, 'error');
    sfx.lose();
    return null;
  }
}

export const fmt = (n: number) => Math.round(n).toLocaleString('fr-FR');

export const reducedMotion = () =>
  !!useApp.getState().profile?.settings.reducedMotion || matchMedia('(prefers-reduced-motion: reduce)').matches;
