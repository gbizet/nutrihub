import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import HomePage from '../pages/index';
import MetricsPage from '../pages/metrics';
import NutritionPage from '../pages/nutrition';
import TrainingPage from '../pages/training';
import PromptBuilderPage from '../pages/prompt-builder';
import FoodsPage from '../pages/foods';
import NeatPage from '../pages/neat';
import DataAdminPage from '../pages/data-admin';
import SummaryPage from '../pages/summary';
import IntegrationsPage from '../pages/integrations';
import SupportPage from '../pages/support';

const LEGACY_REDIRECTS = [
  { from: '/docs', to: '/' },
];

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/metrics" element={<MetricsPage />} />
      <Route path="/nutrition" element={<NutritionPage />} />
      <Route path="/training" element={<TrainingPage />} />
      <Route path="/prompt-builder" element={<PromptBuilderPage />} />
      <Route path="/support" element={<SupportPage />} />
      <Route path="/foods" element={<FoodsPage />} />
      <Route path="/neat" element={<NeatPage />} />
      <Route path="/data-admin" element={<DataAdminPage />} />
      <Route path="/summary" element={<SummaryPage />} />
      <Route path="/dashboards" element={<Navigate to="/support" replace />} />
      <Route path="/integrations" element={<IntegrationsPage />} />
      <Route path="/fitness-coach" element={<Navigate to="/support" replace />} />
      {LEGACY_REDIRECTS.map((item) => (
        <Route key={item.from} path={item.from} element={<Navigate to={item.to} replace />} />
      ))}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
