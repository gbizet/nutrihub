export const LOCAL_DASHBOARD_SNAPSHOTS_KEY = 'nutri-dashboard-manual-snapshots-v1';

const canUseStorage = () => typeof window !== 'undefined' && Boolean(window.localStorage);

const normalizeObject = (value, fallback = {}) => (
  value && typeof value === 'object' && !Array.isArray(value) ? value : fallback
);

const normalizeSnapshots = (value) => (
  Array.isArray(value)
    ? value.filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry))
    : []
);

const buildSnapshotPayload = (state) => {
  if (!state || typeof state !== 'object') return {};
  return {
    ...state,
    stateSnapshots: [],
  };
};

export const readLocalDashboardSnapshots = () => {
  if (!canUseStorage()) return [];
  try {
    return normalizeSnapshots(JSON.parse(window.localStorage.getItem(LOCAL_DASHBOARD_SNAPSHOTS_KEY) || '[]'));
  } catch {
    return [];
  }
};

export const writeLocalDashboardSnapshots = (snapshots = []) => {
  if (!canUseStorage()) return;
  window.localStorage.setItem(LOCAL_DASHBOARD_SNAPSHOTS_KEY, JSON.stringify(normalizeSnapshots(snapshots)));
};

export const createLocalDashboardSnapshot = (state, { label = '', maxSnapshots = 12 } = {}) => {
  const payload = buildSnapshotPayload(state);
  const snapshot = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    at: state?.updatedAt || new Date().toISOString(),
    selectedDate: state?.selectedDate || '',
    label: `${label || ''}`.trim(),
    size: JSON.stringify(payload).length,
    payload: normalizeObject(payload),
  };
  const nextSnapshots = [snapshot, ...readLocalDashboardSnapshots()].slice(0, maxSnapshots);
  writeLocalDashboardSnapshots(nextSnapshots);
  return snapshot;
};
