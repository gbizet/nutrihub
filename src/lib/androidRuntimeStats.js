export const ANDROID_RUNTIME_STATS_KEY = 'nutri-android-runtime-stats-v1';
export const ANDROID_RUNTIME_STATS_EVENT = 'nutri-android-runtime-stats';

const DEFAULT_ANDROID_RUNTIME_STATS = {
  lastForegroundAt: '',
  lastForegroundReason: '',
  foregroundSequence: 0,
  duplicateForegroundSkipCount: 0,
  lastDuplicateForegroundAt: '',
  lastDuplicateForegroundReason: '',
  lastAutoPullAt: '',
  lastAutoPullDurationMs: 0,
  lastAutoPullSkippedReason: '',
  lastAutoHealthImportAt: '',
  lastAutoHealthImportDurationMs: 0,
  lastAutoHealthImportSkippedReason: '',
  lastPersistAt: '',
  lastPersistDurationMs: 0,
  lastPersistSizeBytes: 0,
  lastPersistSkippedReason: '',
  lastPersistWarningCode: '',
  lastAutoPushAt: '',
  lastAutoPushDebounceMs: 0,
  lastAutoPushSkippedReason: '',
};

const canUseStorage = () => typeof window !== 'undefined' && Boolean(window.localStorage);

const normalizeObject = (value, fallback = {}) => (
  value && typeof value === 'object' && !Array.isArray(value) ? value : fallback
);

const emitAndroidRuntimeStatsEvent = (detail) => {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  window.dispatchEvent(new CustomEvent(ANDROID_RUNTIME_STATS_EVENT, { detail }));
};

export const readAndroidRuntimeStats = () => {
  if (!canUseStorage()) return { ...DEFAULT_ANDROID_RUNTIME_STATS };
  try {
    return {
      ...DEFAULT_ANDROID_RUNTIME_STATS,
      ...normalizeObject(JSON.parse(window.localStorage.getItem(ANDROID_RUNTIME_STATS_KEY) || '{}')),
    };
  } catch {
    return { ...DEFAULT_ANDROID_RUNTIME_STATS };
  }
};

export const updateAndroidRuntimeStats = (patch) => {
  if (!canUseStorage()) return { ...DEFAULT_ANDROID_RUNTIME_STATS };
  const previous = readAndroidRuntimeStats();
  const next = {
    ...previous,
    ...(typeof patch === 'function' ? patch(previous) : normalizeObject(patch)),
  };
  window.localStorage.setItem(ANDROID_RUNTIME_STATS_KEY, JSON.stringify(next));
  emitAndroidRuntimeStatsEvent(next);
  return next;
};
