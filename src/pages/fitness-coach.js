import React from 'react';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import styles from './dashboard.module.css';
import CoreWorkflowNav from '../components/CoreWorkflowNav';

export default function FitnessCoachLegacyPage() {
  return (
    <Layout title="Dashboard Hub" description="Navigation vers les nouvelles pages du dashboard">
      <main className={styles.page}>
        <div className={styles.container}>
          <section className={styles.hero}>
            <h1>Cette page a ete remplacee</h1>
            <p>Le produit V2 est recentre sur quatre workflows: poids, nutrition, training et export AI.</p>
            <CoreWorkflowNav active="home" showSupport />
          </section>
          <section className={styles.linkGrid}>
            <Link className={styles.linkCard} to="/metrics"><strong>Poids</strong></Link>
            <Link className={styles.linkCard} to="/nutrition"><strong>Nutrition</strong></Link>
            <Link className={styles.linkCard} to="/training"><strong>Entrainement</strong></Link>
            <Link className={styles.linkCard} to="/prompt-builder"><strong>Export IA</strong></Link>
            <Link className={styles.linkCard} to="/foods"><strong>Foods</strong></Link>
            <Link className={styles.linkCard} to="/neat"><strong>NEAT</strong></Link>
            <Link className={styles.linkCard} to="/integrations"><strong>Sync</strong></Link>
            <Link className={styles.linkCard} to="/data-admin"><strong>Data</strong></Link>
          </section>
        </div>
      </main>
    </Layout>
  );
}
