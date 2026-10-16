const listeners = new Set();

const initialState = {
  page: 'overview',
  dataset: null,
  datasets: [],
  filters: emptyFilters(),
  settings: {
    googleClientId: '',
    syncIntervalMinutes: 15,
    dateDayFirst: true,
    activeDatasetId: null,
  },
  google: {
    connected: false,
    accessToken: null,
    expiresAt: 0,
    email: '',
    status: 'idle',
    error: '',
  },
  reportSelection: new Set(),
  busy: false,
};

let state = { ...initialState };

export function emptyFilters() {
  return {
    dateColumnId: null,
    dateFrom: null,
    dateTo: null,
    keyword: '',
    conditions: [],
    groupByColumnId: null,
    groups: [],
  };
}

export function getState() {
  return state;
}

export function setState(patch) {
  const next = typeof patch === 'function' ? patch(state) : patch;
  state = { ...state, ...next };
  emit();
  return state;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  for (const fn of listeners) {
    try {
      fn(state);
    } catch (err) {
      console.error('state listener failed', err);
    }
  }
}

export function resetState() {
  state = { ...initialState, filters: emptyFilters(), reportSelection: new Set() };
  emit();
}
