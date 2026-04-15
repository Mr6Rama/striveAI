import { clone, createInitialState } from './state-model.js';

const subscribers = new Set();
let state = createInitialState();

export function getState() {
  return state;
}

export function replaceState(nextState) {
  state = nextState;
  notify();
}

export function updateState(updater) {
  const draft = clone(state);
  const result = updater(draft) || draft;
  state = result;
  notify();
}

export function subscribe(handler) {
  subscribers.add(handler);
  return () => subscribers.delete(handler);
}

function notify() {
  subscribers.forEach((handler) => {
    try {
      handler(state);
    } catch (error) {
      console.error('Store subscriber error', error);
    }
  });
}

