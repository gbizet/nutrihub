import React from 'react';
import Link from '@docusaurus/Link';
import styles from '../pages/dashboard.module.css';

const PRIMARY_ITEMS = [
  { id: 'home', to: '/', label: 'Accueil', caption: 'pilotage rapide' },
  { id: 'metrics', to: '/metrics', label: 'Poids', caption: 'tendance & saisie' },
  { id: 'nutrition', to: '/nutrition', label: 'Nutrition', caption: 'adherence du jour' },
  { id: 'training', to: '/training', label: 'Training', caption: 'perf & progression' },
  { id: 'prompt-builder', to: '/prompt-builder', label: 'Export AI', caption: 'analyse sur periode' },
];

const SUPPORT_ITEMS = [
  { id: 'foods', to: '/foods', label: 'Foods' },
  { id: 'neat', to: '/neat', label: 'NEAT' },
  { id: 'integrations', to: '/integrations', label: 'Sync' },
  { id: 'data-admin', to: '/data-admin', label: 'Data' },
  { id: 'summary', to: '/summary', label: 'Resume' },
];

export default function CoreWorkflowNav({ active = '', showSupport = true }) {
  return (
    <div className={styles.coreNav}>
      <div className={styles.coreNavPrimary}>
        {PRIMARY_ITEMS.map((item) => {
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
      {showSupport && (
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
