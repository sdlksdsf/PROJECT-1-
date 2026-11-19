// Minimal external store (no extra dependency). Components subscribe to primitive slices
// with useSyncExternalStore, so only the parts of the UI that changed re-render.
import { useSyncExternalStore } from 'react';

type Listener = () => void;

export interface Store<S> {
  get(): S;
  set(patch: Partial<S> | ((s: S) => Partial<S>)): void;
  subscribe(listener: Listener): () => void;
}

export function createStore<S extends object>(initial: S): Store<S> {
  let state = initial;
  const listeners = new Set<Listener>();
  return {
    get: () => state,
    set(patch) {
      const next = typeof patch === 'function' ? patch(state) : patch;
      state = { ...state, ...next };
      listeners.forEach((l) => l());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export function useStore<S extends object, T>(store: Store<S>, selector: (s: S) => T): T {
  return useSyncExternalStore(store.subscribe, () => selector(store.get()));
}
