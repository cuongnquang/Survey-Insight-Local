import { store } from './store.js';
import { getState, setState, emptyFilters } from './state.js';
import { applyFilters } from './filters.js';
import { includedColumns } from './model.js';

export const DEFAULT_SETTINGS = {
  googleClientId: '',
  syncIntervalMinutes: 15,
  dateDayFirst: true,
  activeDatasetId: null,
};

export async function loadAll() {
  const storedSettings = (await store.getSettings()) || {};
  const settings = { ...DEFAULT_SETTINGS, ...storedSettings };
  const datasets = (await store.getAllDatasets()) || [];
  datasets.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const dataset = datasets.find((d) => d.id === settings.activeDatasetId) || datasets[0] || null;
  setState({ settings, datasets, dataset, reportSelection: new Set() });
  return { settings, datasets, dataset };
}

export function getDataset() {
  return getState().dataset;
}

export function getFilteredResponses() {
  const { dataset, filters, settings } = getState();
  if (!dataset) return [];
  const dayFirst = dataset.dateMeta?.dayFirst ?? settings.dateDayFirst;
  return applyFilters(dataset.responses, dataset.columns, filters, { dayFirst });
}

export async function saveDataset(dataset) {
  const next = { ...dataset, updatedAt: Date.now() };
  await store.saveDataset(next);
  setState((s) => {
    const exists = s.datasets.some((d) => d.id === next.id);
    const datasets = exists ? s.datasets.map((d) => (d.id === next.id ? next : d)) : [next, ...s.datasets];
    return {
      dataset: s.dataset && s.dataset.id === next.id ? next : s.dataset,
      datasets,
    };
  });
  return next;
}

export async function addDataset(dataset) {
  await store.saveDataset(dataset);
  await store.saveSetting('activeDatasetId', dataset.id);
  setState((s) => ({
    datasets: [dataset, ...s.datasets.filter((d) => d.id !== dataset.id)],
    dataset,
    filters: emptyFilters(),
    reportSelection: new Set(),
    settings: { ...s.settings, activeDatasetId: dataset.id },
  }));
  return dataset;
}

export async function setActiveDataset(id) {
  await store.saveSetting('activeDatasetId', id);
  setState((s) => ({
    dataset: s.datasets.find((d) => d.id === id) || null,
    filters: emptyFilters(),
    reportSelection: new Set(),
    settings: { ...s.settings, activeDatasetId: id },
  }));
  return getState().dataset;
}

export async function removeDataset(id) {
  await store.deleteDataset(id);
  const activeId = (() => {
    const s = getState();
    const remaining = s.datasets.filter((d) => d.id !== id);
    if (s.dataset?.id !== id) return s.dataset?.id || null;
    return remaining[0]?.id || null;
  })();
  await store.saveSetting('activeDatasetId', activeId);
  setState((s) => {
    const datasets = s.datasets.filter((d) => d.id !== id);
    const dataset = s.dataset?.id === id ? datasets[0] || null : s.dataset;
    return {
      datasets,
      dataset,
      filters: emptyFilters(),
      reportSelection: new Set(),
      settings: { ...s.settings, activeDatasetId: activeId },
    };
  });
}

export async function updateSettings(patch) {
  for (const [key, value] of Object.entries(patch)) {
    await store.saveSetting(key, value);
  }
  setState((s) => ({ settings: { ...s.settings, ...patch } }));
  return getState().settings;
}

export function setFilters(patch) {
  setState((s) => ({ filters: { ...s.filters, ...patch } }));
}

export function clearFilters() {
  setState({ filters: emptyFilters() });
}

export function toggleReportSelection(groupId, on) {
  setState((s) => {
    const next = new Set(s.reportSelection);
    if (on === undefined) {
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
    } else if (on) next.add(groupId);
    else next.delete(groupId);
    return { reportSelection: next };
  });
}

export function setReportSelection(ids) {
  setState({ reportSelection: new Set(ids) });
}

export function includedColumnList(dataset = getState().dataset) {
  return dataset ? includedColumns(dataset) : [];
}
