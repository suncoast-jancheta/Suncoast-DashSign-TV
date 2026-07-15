/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider, useAppContext } from './contexts/AppContext';
import { ToastProvider } from './contexts/ToastContext';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Screens from './pages/Screens';
import ManageScreen from './pages/ManageScreen';
import Groups from './pages/Groups';
import ManageGroup from './pages/ManageGroup';
import Content from './pages/Content';
import Websites from './pages/Websites';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import Player from './pages/Player';

function AdminLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-suncoast-black text-suncoast-warm-gray font-mono uppercase tracking-widest text-sm">
      Loading Suncoast...
    </div>
  );
}

function AdminLayout() {
  const { loading } = useAppContext();
  if (loading) return <AdminLoading />;
  return <Layout />;
}

export default function App() {
  return (
    <AppProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/play/:id" element={<Player />} />
            <Route path="/" element={<AdminLayout />}>
              <Route index element={<Dashboard />} />
              <Route path="screens" element={<Screens />} />
              <Route path="screens/:id" element={<ManageScreen />} />
              <Route path="groups" element={<Groups />} />
              <Route path="groups/:id" element={<ManageGroup />} />
              <Route path="content" element={<Content />} />
              <Route path="websites" element={<Websites />} />
              <Route path="reports" element={<Reports />} />
              <Route path="settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AppProvider>
  );
}
