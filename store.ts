import { useSyncExternalStore } from 'react';

/**
 * Mini-store compatible avec l'API de Zustand (`create((set, get) => ...)`).
 * Remplaçable par `import { create } from 'zustand'` sans toucher aux appels.
 * (Zustand n'était pas installable dans l'environnement de build hors-ligne.)
 */
type SetState<T> = (partial: Partial<T> | ((s: T) => Partial<T>)) => void;

export function create<T extends object>(init: (set: SetState<T>, get: () => T) => T) {
  let state: T;
  const listeners = new Set<() => void>();
  const get = () => state;
  const set: SetState<T> = (partial) => {
    const next = typeof partial === 'function' ? partial(state) : partial;
    state = { ...state, ...next };
    listeners.forEach((l) => l());
  };
  state = init(set, get);
  const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };

  function useStore(): T;
  function useStore<U>(selector: (s: T) => U): U;
  function useStore<U>(selector?: (s: T) => U) {
    const sel = selector ?? ((s: T) => s as unknown as U);
    return useSyncExternalStore(subscribe, () => sel(state), () => sel(state));
  }
  return Object.assign(useStore, { getState: get, setState: set, subscribe });
}
