import React, { useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import GlobalSyncBar from './GlobalSyncBar';

const ensureMeta = (name) => {
  let tag = document.querySelector(`meta[name="${name}"]`);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute('name', name);
    document.head.appendChild(tag);
  }
  return tag;
};

const MOBILE_TITLE_BY_ROUTE = {
  home: 'Accueil',
  metrics: 'Poids',
  nutrition: 'Nutrition',
  training: 'Training',
  'prompt-builder': 'Export AI',
  support: 'Support',
  foods: 'Foods',
  neat: 'NEAT',
  'data-admin': 'Admin',
  summary: 'Audit',
  integrations: 'Sync',
};

export default function AppLayout({
  title,
  description,
  children,
  mobileChromeMode = 'compact',
  mobileTitleShort = '',
}) {
  const location = useLocation();
  const routeKey = useMemo(() => {
    const cleaned = `${location.pathname || '/'}`
      .replace(/^\/+/, '')
      .replace(/\/+$/, '');
    return cleaned || 'home';
  }, [location.pathname]);
  const resolvedMobileTitle = mobileTitleShort || MOBILE_TITLE_BY_ROUTE[routeKey] || title || 'Nutri';
  const syncCompact = location.pathname !== '/integrations' && mobileChromeMode !== 'default';

  useEffect(() => {
    const pageTitle = title ? `${title} | Nutri Sport Hub` : 'Nutri Sport Hub';
    document.title = pageTitle;
    if (description) ensureMeta('description').setAttribute('content', description);
  }, [description, title]);

  useEffect(() => {
    if (typeof document === 'undefined' || !document.body) return undefined;
    const { body } = document;
    body.dataset.mobileChrome = mobileChromeMode;
    body.dataset.mobileRoute = routeKey;
    body.dataset.syncCompact = syncCompact ? '1' : '0';

    return () => {
      delete body.dataset.mobileChrome;
      delete body.dataset.mobileRoute;
      delete body.dataset.syncCompact;
    };
  }, [mobileChromeMode, routeKey, syncCompact]);

  return (
    <>
      <GlobalSyncBar
        mobileChromeMode={mobileChromeMode}
        mobileTitleShort={resolvedMobileTitle}
        routeKey={routeKey}
        syncCompact={syncCompact}
      />
      {children}
    </>
  );
}
