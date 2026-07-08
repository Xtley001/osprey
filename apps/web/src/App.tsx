import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AppShell from './components/layout/AppShell';
import Landing from './pages/Landing';
import Scanner from './pages/Scanner';
import PairDetail from './pages/PairDetail';
import Portfolio from './pages/Portfolio';
import Analytics from './pages/Analytics';
import Settings from './pages/Settings';
import Harvest from './pages/Harvest';
import Developers from './pages/Developers';

// Sensible cross-navigation caching defaults so pages don't refetch-from-empty
// on every mount (see FRONTEND_UX_AUDIT.md P0-3). Data stays instant on back-nav.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,          // rates/history considered fresh for 30s
      gcTime: 5 * 60_000,         // keep cached data 5m after last use
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

// Reset the scroll container (and window) to the top on every route change.
// The main scroll container lives in AppShell; without this, navigating to a
// new page lands you at the previous page's scroll offset (audit P0-2).
const ScrollToTop: React.FC = () => {
  const { pathname } = useLocation();
  useEffect(() => {
    document.getElementById('app-scroll')?.scrollTo({ top: 0, left: 0 });
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
};

const App: React.FC = () => (
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <ScrollToTop />
      <Routes>
        {/* Marketing zone — public, no app shell */}
        <Route path="/" element={<Landing />} />
        <Route path="/docs" element={<Developers />} />

        {/* App zone — the dashboard */}
        <Route path="/app" element={<AppShell />}>
          <Route index element={<Scanner />} />
          <Route path="pair/:symbol" element={<PairDetail />} />
          <Route path="portfolio"  element={<Portfolio />} />
          <Route path="analytics"  element={<Analytics />} />
          <Route path="harvest"    element={<Harvest />} />
          <Route path="settings"   element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </QueryClientProvider>
);

export default App;
