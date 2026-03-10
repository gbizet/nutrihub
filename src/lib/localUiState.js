import { useEffect, useRef, useState } from 'react';

const LOCAL_UI_STORAGE_KEY = 'nutri-sport-local-ui-v1';

const canUseStorage = () => typeof window !== 'undefined' && Boolean(window.localStorage);

const normalizeObject = (value, fallback = {}) => (
  value && typeof value === 'object' && !Array.isArray(value) ? value : fallback
);

const readLocalUiStore = () => {
  if (!canUseStorage()) return {};
  try {
    return normalizeObject(JSON.parse(window.localStorage.getItem(LOCAL_UI_STORAGE_KEY) || '{}'));
  } catch {
    return {};
  }
};

const writeLocalUiStore = (store) => {
  if (!canUseStorage()) return;
  window.localStorage.setItem(LOCAL_UI_STORAGE_KEY, JSON.stringify(normalizeObject(store)));
};

export const readLocalPageUiState = (pageId, fallback = {}) => {
  const store = readLocalUiStore();
  return {
    ...fallback,
    ...normalizeObject(store?.[pageId]),
  };
};

export const persistLocalPageUiState = (pageId, value) => {
  if (!pageId) return;
  const store = readLocalUiStore();
  writeLocalUiStore({
    ...store,
    [pageId]: normalizeObject(value),
  });
};

export const useLocalPageUiState = (pageId, initialState = {}) => {
  const initialRef = useRef(initialState);
  const [uiState, setUiState] = useState(() => readLocalPageUiState(pageId, initialRef.current));

  useEffect(() => {
    persistLocalPageUiState(pageId, uiState);
  }, [pageId, uiState]);

  return [uiState, setUiState];
};
