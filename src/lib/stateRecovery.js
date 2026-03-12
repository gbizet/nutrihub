import { getRemoteStatePersistenceConfig } from './dashboardStore.js';
import { fetchJson } from './network.js';

const resolveStateServerSnapshotConfig = () => {
  const config = getRemoteStatePersistenceConfig();
  if (!config.enabled || !config.url) {
    return {
      enabled: false,
      url: '',
      headers: {},
      reason: config.reason || 'remote-disabled',
    };
  }

  if (!/\/api\/state\/?$/i.test(config.url)) {
    return {
      enabled: false,
      url: '',
      headers: {},
      reason: 'state-endpoint-mismatch',
    };
  }

  return {
    enabled: true,
    url: config.url.replace(/\/+$/, ''),
    headers: config.headers || {},
    reason: '',
  };
};

const buildSnapshotUrl = (suffix = '') => {
  const config = resolveStateServerSnapshotConfig();
  if (!config.enabled) return config;
  return {
    ...config,
    url: `${config.url}${suffix}`,
  };
};

export const canUseStateServerSnapshots = () => resolveStateServerSnapshotConfig().enabled;

export const listStateServerSnapshots = async () => {
  const config = buildSnapshotUrl('/snapshots');
  if (!config.enabled) return [];
  const payload = await fetchJson(config.url, {
    method: 'GET',
    headers: config.headers,
  });
  return Array.isArray(payload?.snapshots) ? payload.snapshots : [];
};

export const createStateServerSnapshot = async (state, options = {}) => {
  const config = buildSnapshotUrl('/snapshots');
  if (!config.enabled) return null;
  const payload = await fetchJson(config.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...config.headers,
    },
    body: JSON.stringify({
      state: state || null,
      reason: `${options.reason || ''}`.trim(),
      label: `${options.label || ''}`.trim(),
    }),
  });
  return payload?.snapshot || null;
};

export const restoreStateServerSnapshot = async (snapshotId) => {
  const config = buildSnapshotUrl('/restore');
  if (!config.enabled || !snapshotId) return null;
  const payload = await fetchJson(config.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...config.headers,
    },
    body: JSON.stringify({
      snapshotId,
    }),
  });
  return payload || null;
};
