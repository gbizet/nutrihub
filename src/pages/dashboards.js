import React, { useMemo, useState } from 'react';
import Layout from '@theme/Layout';
import styles from './dashboard.module.css';
import { useDashboardState } from '../lib/dashboardStore';
import CoreWorkflowNav from '../components/CoreWorkflowNav';

const AVAILABLE_WIDGETS = ['kpis', 'sparks', 'quick', 'training', 'neat'];

export default function DashboardsPage() {
  const { state, setState } = useDashboardState();
  const [profileName, setProfileName] = useState('');
  const active = state.dashboards?.active || 'default';
  const profiles = state.dashboards?.profiles || { default: ['kpis', 'sparks', 'quick'] };
  const widgets = useMemo(() => profiles[active] || [], [profiles, active]);

  const toggleWidget = (w) => {
    const set = new Set(widgets);
    if (set.has(w)) set.delete(w);
    else set.add(w);
    setState((prev) => ({
      ...prev,
      dashboards: {
        ...(prev.dashboards || {}),
        active,
        profiles: {
          ...((prev.dashboards || {}).profiles || {}),
          [active]: Array.from(set),
        },
      },
    }));
  };

  const createProfile = () => {
    const name = profileName.trim();
    if (!name) return;
    setState((prev) => ({
      ...prev,
      dashboards: {
        ...(prev.dashboards || {}),
        active: name,
        profiles: {
          ...((prev.dashboards || {}).profiles || {}),
          [name]: ['kpis', 'quick'],
        },
      },
    }));
    setProfileName('');
  };

  return (
    <Layout title="Dashboards" description="Profils dashboard et toggles modules">
      <main className={styles.page}>
        <div className={styles.container}>
          <section className={styles.hero}>
            <h1>Profils dashboard</h1>
            <p>Page legacy de parametrage. Le parcours V2 ne depend plus de profils de widgets.</p>
            <CoreWorkflowNav active="data-admin" showSupport />
          </section>
          <section className={styles.grid2}>
            <article className={styles.card}>
              <h2>Profil actif</h2>
              <select className={styles.select} value={active} onChange={(e) => setState((prev) => ({ ...prev, dashboards: { ...(prev.dashboards || {}), active: e.target.value } }))}>
                {Object.keys(profiles).map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
              <div className={styles.formGrid} style={{ marginTop: '0.6rem' }}>
                <input className={styles.input} placeholder="Nouveau profil" value={profileName} onChange={(e) => setProfileName(e.target.value)} />
                <button className={styles.button} type="button" onClick={createProfile}>Creer profil</button>
              </div>
            </article>
            <article className={styles.card}>
              <h2>Widgets</h2>
              <div className={styles.checkboxGrid}>
                {AVAILABLE_WIDGETS.map((w) => (
                  <label key={w} className={styles.smallMuted}>
                    <input type="checkbox" checked={widgets.includes(w)} onChange={() => toggleWidget(w)} /> {w}
                  </label>
                ))}
              </div>
            </article>
          </section>
        </div>
      </main>
    </Layout>
  );
}
