import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AppShell from './components/layout/AppShell';
import Scanner from './pages/Scanner';
import PairDetail from './pages/PairDetail';
import Backtester from './pages/Backtester';
import Portfolio from './pages/Portfolio';
import Analytics from './pages/Analytics';
import Settings from './pages/Settings';
import AutoTrader from './pages/AutoTrader';

const queryClient = new QueryClient();

const App: React.FC = () => (
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AppShell />}>
          <Route index element={<Scanner />} />
          <Route path="pair/:symbol" element={<PairDetail />} />
          <Route path="backtest" element={<Backtester />} />
          <Route path="portfolio" element={<Portfolio />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="settings"    element={<Settings />} />
          <Route path="autotrader"  element={<AutoTrader />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </QueryClientProvider>
);

export default App;
