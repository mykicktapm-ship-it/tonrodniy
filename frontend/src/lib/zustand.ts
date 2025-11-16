import { useDebugValue, useSyncExternalStore } from 'react';

export type PartialState<TState> =
  | TState
  | Partial<TState>
  | ((state: TState) => TState | Partial<TState>);

export interface StoreApi<TState> {
  getState: () => TState;
  setState: (partial: PartialState<TState>, replace?: boolean) => void;
  subscribe: (listener: () => void) => () => void;
}

export type StateCreator<TState> = (
  set: StoreApi<TState>['setState'],
  get: StoreApi<TState>['getState'],
  api: StoreApi<TState>,
) => TState;

export type StateSelector<TState, TSelected> = (state: TState) => TSelected;
export type EqualityChecker<TSelected> = (state: TSelected, newState: TSelected) => boolean;

export type UseBoundStore<TState> = {
  (): TState;
  <TSelected>(selector: StateSelector<TState, TSelected>, equalityFn?: EqualityChecker<TSelected>): TSelected;
} & StoreApi<TState>;

const identitySelector = <TSelected>(state: TSelected) => state;

export function createStore<TState>(createState: StateCreator<TState>): StoreApi<TState> {
  let state: TState = {} as TState;
  const listeners = new Set<() => void>();

  const setState: StoreApi<TState>['setState'] = (partial, replace) => {
    const partialState = typeof partial === 'function' ? (partial as (state: TState) => TState | Partial<TState>)(state) : partial;
    if (partialState === undefined) {
      return;
    }

    const nextState = replace ? (partialState as TState) : { ...state, ...partialState };
    if (Object.is(state, nextState)) {
      return;
    }

    state = nextState;
    listeners.forEach((listener) => listener());
  };

  const getState = () => state;

  const subscribe: StoreApi<TState>['subscribe'] = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  const api: StoreApi<TState> = { setState, getState, subscribe };
  state = createState(setState, getState, api);
  return api;
}

export function create<TState>(createState: StateCreator<TState>): UseBoundStore<TState> {
  const api = createStore(createState);

  const useBoundStore = (<TSelected = TState>(
    selector: StateSelector<TState, TSelected> = identitySelector as StateSelector<TState, TSelected>,
    equalityFn: EqualityChecker<TSelected> = Object.is,
  ) => {
    let currentSlice = selector(api.getState());

    const subscribeWithSelector = (onStoreChange: () => void) =>
      api.subscribe(() => {
        const nextSlice = selector(api.getState());
        if (!equalityFn(currentSlice, nextSlice)) {
          currentSlice = nextSlice;
          onStoreChange();
        }
      });

    const getSnapshot = () => currentSlice;

    const slice = useSyncExternalStore(subscribeWithSelector, getSnapshot, getSnapshot);
    useDebugValue(slice);
    return slice;
  }) as UseBoundStore<TState>;

  return Object.assign(useBoundStore, api);
}
