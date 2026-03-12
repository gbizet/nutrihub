import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import styles from '../pages/dashboard.module.css';

const DESKTOP_PRIMARY_ITEMS = [
  { id: 'home', to: '/', label: 'Accueil', caption: 'pilotage rapide' },
  { id: 'metrics', to: '/metrics', label: 'Poids', caption: 'tendance & saisie' },
  { id: 'nutrition', to: '/nutrition', label: 'Nutrition', caption: 'adherence du jour' },
  { id: 'training', to: '/training', label: 'Training', caption: 'perf & progression' },
  { id: 'prompt-builder', to: '/prompt-builder', label: 'Export AI', caption: 'contexte coach' },
];

const MOBILE_PRIMARY_ITEMS = DESKTOP_PRIMARY_ITEMS.filter((item) => item.id !== 'prompt-builder');

const SUPPORT_ITEMS = [
  { id: 'support', to: '/support', label: 'Support' },
  { id: 'prompt-builder', to: '/prompt-builder', label: 'Export AI' },
  { id: 'integrations', to: '/integrations', label: 'Sync' },
  { id: 'foods', to: '/foods', label: 'Foods' },
  { id: 'neat', to: '/neat', label: 'NEAT' },
  { id: 'summary', to: '/summary', label: 'Audit' },
  { id: 'data-admin', to: '/data-admin', label: 'Admin' },
];

const isMobileViewport = () => (
  typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(max-width: 700px)').matches
);

export default function CoreWorkflowNav({ active = '', supportMode = 'hub' }) {
  const [mobile, setMobile] = useState(isMobileViewport);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const media = window.matchMedia('(max-width: 700px)');
    const update = () => setMobile(media.matches);

    update();
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', update);
      return () => media.removeEventListener('change', update);
    }

    if (typeof media.addListener === 'function') {
      media.addListener(update);
      return () => media.removeListener(update);
    }

    return undefined;
  }, []);

  if (mobile) {
    const activeSupportItem = SUPPORT_ITEMS.find((item) => item.id === active) || null;

    return (
      <div className={`${styles.coreNav} ${styles.coreNavMobile}`}>
        <div className={styles.coreNavChipRow}>
          {MOBILE_PRIMARY_ITEMS.map((item) => {
            const isActive = item.id === active;
            return (
              <Link
                key={item.id}
                className={`${styles.coreNavChip} ${isActive ? styles.coreNavChipActive : ''}`}
                to={item.to}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
        <div className={styles.coreNavChipRow}>
          {supportMode === 'hub' && activeSupportItem ? (
            <Link
              className={`${styles.coreNavChip} ${styles.coreNavChipActive}`}
              to={activeSupportItem.to}
            >
              {activeSupportItem.label}
            </Link>
          ) : null}
          {supportMode === 'hub' ? (
            <Link
              className={`${styles.coreNavChip} ${active === 'support' ? styles.coreNavChipActive : ''}`}
              to="/support"
            >
              Plus
            </Link>
          ) : (
            SUPPORT_ITEMS.map((item) => {
              const isActive = item.id === active;
              return (
                <Link
                  key={item.id}
                  className={`${styles.coreNavChip} ${isActive ? styles.coreNavChipActive : ''}`}
                  to={item.to}
                >
                  {item.label}
                </Link>
              );
            })
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.coreNav}>
      <div className={styles.coreNavPrimary}>
        {DESKTOP_PRIMARY_ITEMS.map((item) => {
          const isActive = item.id === active;
          return (
            <Link
              key={item.id}
              className={`${styles.coreNavItem} ${isActive ? styles.coreNavItemActive : ''}`}
              to={item.to}
            >
              <strong>{item.label}</strong>
              <span className={styles.coreNavCaption}>{item.caption}</span>
            </Link>
          );
        })}
      </div>
      {supportMode === 'hub' && (
        <div className={styles.coreNavSupport}>
          <Link
            className={`${styles.coreNavSupportItem} ${active === 'support' ? styles.coreNavSupportItemActive : ''}`}
            to="/support"
          >
            Plus
          </Link>
        </div>
      )}
      {supportMode === 'full' && (
        <div className={styles.coreNavSupport}>
          {SUPPORT_ITEMS.map((item) => {
            const isActive = item.id === active;
            return (
              <Link
                key={item.id}
                className={`${styles.coreNavSupportItem} ${isActive ? styles.coreNavSupportItemActive : ''}`}
                to={item.to}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
