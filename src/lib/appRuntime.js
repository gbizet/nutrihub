export const APP_ACTIVITY_EVENT = 'nutri-app-activity';

const resolveDocumentActivity = () => {
  if (typeof document === 'undefined') return true;
  return document.visibilityState !== 'hidden';
};

let runtimeState = {
  isActive: resolveDocumentActivity(),
  autoRefreshBusy: false,
  autoRefreshReason: '',
  autoRefreshSequence: 0,
  source: 'boot',
  updatedAt: new Date().toISOString(),
};

const emitRuntimeEvent = () => {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  window.dispatchEvent(new CustomEvent(APP_ACTIVITY_EVENT, { detail: runtimeState }));
};

export const readAppRuntimeState = () => ({ ...runtimeState });

export const isAppActive = () => Boolean(runtimeState.isActive);

export const isAutoRefreshBusy = () => Boolean(runtimeState.autoRefreshBusy);

export const setAppActive = (isActive, patch = {}) => {
  runtimeState = {
    ...runtimeState,
    ...patch,
    isActive: Boolean(isActive),
    updatedAt: new Date().toISOString(),
  };
  emitRuntimeEvent();
  return runtimeState;
};

export const setAutoRefreshBusy = (busy, patch = {}) => {
  runtimeState = {
    ...runtimeState,
    ...patch,
    autoRefreshBusy: Boolean(busy),
    autoRefreshReason: busy ? `${patch.reason || runtimeState.autoRefreshReason || ''}` : '',
    updatedAt: new Date().toISOString(),
  };
  emitRuntimeEvent();
  return runtimeState;
};
