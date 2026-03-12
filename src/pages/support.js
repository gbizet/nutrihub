import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../app/AppLayout.js';
import styles from './dashboard.module.css';
import { useDashboardState } from '../lib/dashboardStore';
import CoreWorkflowNav from '../components/CoreWorkflowNav';

const cardDefinitions = [
  {
    id: 'prompt-builder',
    to: '/prompt-builder',
    title: 'Export AI',
    description: 'Prompts journaliers, revue hebdo et export periode.',
  },
  {
    id: 'integrations',
    to: '/integrations',
    title: 'Sync',
    description: 'Drive, sante Android et checkpoints de sync.',
  },
  {
    id: 'foods',
    to: '/foods',
    title: 'Foods',
    description: 'Base aliments, import web/photo et nettoyage.',
  },
  {
    id: 'neat',
    to: '/neat',
    title: 'NEAT',
    description: 'Pas, activite utile et capture cardio du jour.',
  },
  {
    id: 'summary',
    to: '/summary',
    title: 'Audit',
    description: 'Controle secondaire des tendances, alertes et imports.',
  },
  {
    id: 'data-admin',
    to: '/data-admin',
    title: 'Admin',
    description: 'Surface technique pour snapshots, JSON et patchs.',
  },
];

export default function SupportPage() {
  const { state } = useDashboardState();

  const supportCards = useMemo(() => {
    const lastNeatDate = [...(state.neatLogs || [])]
      .map((row) => row?.date)
      .filter(Boolean)
      .sort()
      .at(-1);

    const statusById = {
      'prompt-builder': state.promptTemplates?.daily || state.promptTemplates?.weekly
        ? 'Templates perso actifs'
        : 'Templates par defaut',
      integrations: state.healthSync?.lastPushAt || state.healthSync?.lastImportAt
        ? `Push ${state.healthSync?.lastPushAt || '-'} | sante ${state.healthSync?.lastImportAt || '-'}`
        : 'Aucun checkpoint recent',
      foods: `${state.foods?.length || 0} fiche(s)`,
      neat: lastNeatDate ? `Dernier log ${lastNeatDate}` : 'Aucun log NEAT',
      summary: `Controle sur ${state.selectedDate}`,
      'data-admin': `${state.stateSnapshots?.length || 0} snapshot(s)`,
    };

    return cardDefinitions.map((card) => ({
      ...card,
      status: statusById[card.id] || '-',
    }));
  }, [state.foods, state.healthSync, state.neatLogs, state.promptTemplates, state.selectedDate, state.stateSnapshots]);

  return (
    <Layout title="Support" description="Hub secondaire des surfaces support">
      <main className={styles.page}>
        <div className={styles.container}>
          <section className={styles.hero}>
            <h1>Support</h1>
            <p>Hub secondaire pour Export AI, Sync, Foods, NEAT, Audit et Admin. Les flux coeur restent Accueil, Poids, Nutrition et Training.</p>
            <div className={styles.metaRow}>
              <span className={styles.pill}>Date active: {state.selectedDate}</span>
              <span className={`${styles.pill} ${styles.pillMuted}`}>Dernier import sante: {state.healthSync?.lastImportAt || '-'}</span>
              <span className={`${styles.pill} ${styles.pillMuted}`}>Dernier push: {state.healthSync?.lastPushAt || '-'}</span>
              <span className={`${styles.pill} ${styles.pillMuted}`}>Foods: {state.foods?.length || 0}</span>
            </div>
            <CoreWorkflowNav active="support" supportMode="full" />
          </section>

          <section className={styles.linkGrid}>
            {supportCards.map((card) => (
              <Link key={card.id} className={styles.linkCard} to={card.to}>
                <strong>{card.title}</strong>
                <p className={styles.smallMuted}>{card.description}</p>
                <div className={styles.smallMuted}>{card.status}</div>
              </Link>
            ))}
          </section>
        </div>
      </main>
    </Layout>
  );
}
