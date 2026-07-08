import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { TrendingUp, TrendingDown, Minus, ChevronUp, ChevronDown } from 'lucide-react';
import { useScannerStore } from '../store/scannerStore';
import { useAppStore } from '../store/appStore';
import { useFeeStore } from '../store/feeStore';
import {
  detectRegime,
  formatUSD,
  formatPrice,
  formatPct,
  RATE_POLL_INTERVAL,
  type Category,
  type SortKey,
  type FundingRate,
} from '@osprey/engine';
import { Sparkline } from '../components/shared/Sparkline';
import { useBreakpoint } from '../hooks/useBreakpoint';
import { PageHeader, Segmented, SkeletonRows, ErrorBanner } from '../components/ui';

// Pre-launch removed from filter tabs (Phase 1)
const CATEGORIES: Category[] = ['All', 'Crypto', 'TradFi', 'HIP-3'];

type SortDir = 'desc' | 'asc';

const TrendIcon: React.FC<{ trend: FundingRate['trend'] }> = ({ trend }) => {
  if (trend === 'rising')  return <TrendingUp  size={11} color="var(--accent-green)" />;
  if (trend === 'falling') return <TrendingDown size={11} color="var(--accent-red)"  />;
  return <Minus size={11} color="var(--text-muted)" />;
};

// Defined outside component — avoids "cannot create component during render"
const ColHeader: React.FC<{
  label: string; sortKey?: SortKey; activeSortKey: SortKey; sortDir: SortDir;
  onSort: (k: SortKey) => void; style?: React.CSSProperties;
}> = ({ label, sortKey, activeSortKey, sortDir, onSort, style }) => {
  const isActive = !!sortKey && activeSortKey === sortKey;
  return (
    <th
      onClick={sortKey ? () => onSort(sortKey) : undefined}
      style={{
        padding: '10px 12px', textAlign: 'left', whiteSpace: 'nowrap',
        fontSize: 10, fontWeight: 600, color: isActive ? 'var(--hl-teal)' : 'var(--text-muted)',
        fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.06em',
        cursor: sortKey ? 'pointer' : 'default',
        userSelect: 'none', transition: 'color var(--t-fast)', ...style,
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
        {label}
        {isActive && (sortDir === 'desc' ? <ChevronDown size={11} /> : <ChevronUp size={11} />)}
        {sortKey && !isActive && <ChevronDown size={10} style={{ opacity: 0.3 }} />}
      </span>
    </th>
  );
};

const Scanner: React.FC = () => {
  const navigate    = useNavigate();
  const { isMobile } = useBreakpoint();
  const filter      = useScannerStore(s => s.filter);
  const sortBy      = useScannerStore(s => s.sortBy);
  const isLoading   = useScannerStore(s => s.isLoading);
  const lastUpdated = useScannerStore(s => s.lastUpdated);
  const allPairs    = useScannerStore(s => s.pairs);
  const apiError    = useScannerStore(s => s.error);
  const clearError  = useScannerStore(s => s.clearError);
  const pairsCount  = allPairs.length;
  const pairs       = useScannerStore(s => s.filteredPairs);
  const setFilter   = useScannerStore(s => s.setFilter);
  const setSortBy   = useScannerStore(s => s.setSortBy);
  const fees        = useFeeStore(s => s.fees);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { All: allPairs.length };
    allPairs.forEach(p => {
      counts[p.category] = (counts[p.category] ?? 0) + 1;
    });
    return counts;
  }, [allPairs]);

  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const displayPairs = sortDir === 'desc' ? pairs : [...pairs].reverse();

  const doFetch = useCallback(async () => {
    await useScannerStore.getState().fetchRates();
    const p = useScannerStore.getState().pairs;
    if (p.length > 0) {
      const appSt = useAppStore.getState();
      const { regime, nextPrevAvg } = detectRegime(p, appSt.prevRegimeAvg);
      appSt.setPrevRegimeAvg(nextPrevAvg);
      appSt.setRegime(regime);
    }
  }, []);

  const doFetchRef = useRef(doFetch);
  useEffect(() => { doFetchRef.current = doFetch; }, [doFetch]);

  useEffect(() => {
    doFetchRef.current();
    const id = setInterval(() => doFetchRef.current(), RATE_POLL_INTERVAL);
    return () => clearInterval(id);
  }, []);

  const handleColumnClick = useCallback((key: SortKey) => {
    if (sortBy === key) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(key);
      setSortDir('desc');
    }
  }, [sortBy, setSortBy]);

  // Net APY formula — CALC_AUDIT.md §1.3
  const computeNetAPY = (rate: number) => {
    const roundTripPct = fees.perpMaker + fees.perpTaker + fees.spotMaker + fees.spotTaker;
    const holdH = 168;
    return (rate * 8760 - (roundTripPct * 8760) / holdH) * 100;
  };

  return (
    <div className="fade-in" style={{ paddingTop: 'var(--sp-4)' }}>
      <PageHeader
        title="Funding Scanner"
        subtitle={`${pairsCount} pairs · HL pays every hour · click any column to sort`}
        style={{ marginBottom: 'var(--sp-4)' }}
      />

      {/* API error banner */}
      {apiError && (
        <ErrorBanner
          title="Hyperliquid API error"
          message={apiError}
          note={allPairs.length > 0 ? 'Showing last successful data.' : undefined}
          onRetry={() => { clearError(); useScannerStore.getState().fetchRates(); }}
          onDismiss={clearError}
        />
      )}

      {/* Category filters */}
      <div style={{ display: 'flex', gap: 'var(--sp-3)', marginBottom: 'var(--sp-3)', flexWrap: 'wrap', alignItems: 'center' }}>
        <Segmented
          aria-label="Filter by category"
          value={filter}
          onChange={setFilter}
          options={CATEGORIES
            .filter(cat => cat === 'All' || (categoryCounts[cat] ?? 0) > 0 || allPairs.length === 0)
            .map(cat => ({
              value: cat,
              label: (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {cat}
                  {allPairs.length > 0 && (
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--w-300)' }}>{categoryCounts[cat] ?? 0}</span>
                  )}
                </span>
              ),
            }))}
        />
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--w-300)' }}>
          {displayPairs.length} shown
        </span>
      </div>

      {/* Table */}
      <div className="table-wrap" style={{ background: 'var(--bg-surface)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--glass-border)' }}>
              <ColHeader label="Pair"   activeSortKey={sortBy} sortDir={sortDir} onSort={handleColumnClick} />
              <ColHeader label="Price"  activeSortKey={sortBy} sortDir={sortDir} onSort={handleColumnClick} />
              <ColHeader label="24h"    activeSortKey={sortBy} sortDir={sortDir} onSort={handleColumnClick} />
              <ColHeader label="Rate (1h)"  sortKey="rate"        activeSortKey={sortBy} sortDir={sortDir} onSort={handleColumnClick} />
              <ColHeader label="Rate (8h)"  activeSortKey={sortBy} sortDir={sortDir} onSort={handleColumnClick} />
              <ColHeader label="Annual"     sortKey="annualYield" activeSortKey={sortBy} sortDir={sortDir} onSort={handleColumnClick} />
              <ColHeader label="Net APY"    activeSortKey={sortBy} sortDir={sortDir} onSort={handleColumnClick} />
              <ColHeader label="Persist"    activeSortKey={sortBy} sortDir={sortDir} onSort={handleColumnClick} />
              <ColHeader label="7d"         activeSortKey={sortBy} sortDir={sortDir} onSort={handleColumnClick} />
              <ColHeader label="OI"         sortKey="oi"          activeSortKey={sortBy} sortDir={sortDir} onSort={handleColumnClick} />
              <ColHeader label="Volume"     sortKey="volume"      activeSortKey={sortBy} sortDir={sortDir} onSort={handleColumnClick} />
            </tr>
          </thead>
          <tbody>
            {isLoading && displayPairs.length === 0 ? (
              <SkeletonRows rows={12} cols={11} />
            ) : displayPairs.length === 0 ? (
              <tr><td colSpan={11} style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
                No pairs match this filter.
              </td></tr>
            ) : displayPairs.map(pair => {
              const netAPY = computeNetAPY(pair.currentRate);
              return (
                <tr
                  key={pair.symbol}
                  onClick={() => navigate(`/app/pair/${pair.symbol}`)}
                  role="button"
                  tabIndex={0}
                  aria-label={`View ${pair.symbol} details`}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/app/pair/${pair.symbol}`); } }}
                  style={{ borderBottom: '1px solid var(--glass-border)', cursor: 'pointer', transition: 'background var(--t-fast)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-elevated)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <td style={{ padding: '9px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13 }}>{pair.symbol}</span>
                      <span style={{
                        fontSize: 9, padding: '1px 5px', borderRadius: 'var(--r-sm)',
                        background: pair.category === 'TradFi' ? 'rgba(155,109,255,0.15)' : 'rgba(91,141,238,0.1)',
                        color: pair.category === 'TradFi' ? 'var(--accent-purple)' : 'var(--accent-blue)',
                      }}>{pair.category}</span>
                    </div>
                  </td>
                  <td style={{ padding: '9px 12px', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                    {formatPrice(pair.price)}
                  </td>
                  <td style={{ padding: '9px 12px', fontFamily: 'var(--font-mono)', fontSize: 12, color: pair.change24h >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                    {formatPct(pair.change24h)}
                  </td>
                  <td style={{ padding: '9px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span className={`rate-badge ${pair.heat}`}>{(pair.currentRate * 100).toFixed(4)}%</span>
                      <TrendIcon trend={pair.trend} />
                    </div>
                  </td>
                  <td style={{ padding: '9px 12px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)' }}>
                    {(pair.rate8hEquiv * 100).toFixed(4)}%
                  </td>
                  <td style={{ padding: '9px 12px', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--accent-green)' }}>
                    {(pair.annualYield * 100).toFixed(1)}%
                  </td>
                  <td style={{ padding: '9px 12px', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                    <span style={{ color: netAPY >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                      {netAPY.toFixed(1)}%
                    </span>
                  </td>
                  <td style={{ padding: '9px 12px' }}>
                    {pair.persistenceHours > 0 ? (
                      <span style={{
                        fontFamily: 'var(--font-mono)', fontSize: 11,
                        color: pair.persistenceHours >= 24 ? 'var(--accent-green)'
                             : pair.persistenceHours >= 6  ? 'var(--accent-yellow)'
                             : 'var(--text-muted)',
                      }}>
                        {pair.persistenceHours}h
                      </span>
                    ) : <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>—</span>}
                  </td>
                  <td style={{ padding: '4px 8px' }}>
                    {pair.sparkline7d.length >= 2
                      ? <Sparkline data={pair.sparkline7d} width={48} height={20} />
                      : <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>—</span>
                    }
                  </td>
                  <td style={{ padding: '9px 12px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)' }}>
                    {formatUSD(pair.openInterest)}
                  </td>
                  <td style={{ padding: '9px 12px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)' }}>
                    {formatUSD(pair.volume24h)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p style={{ marginTop: 'var(--sp-3)', fontSize: 11, color: 'var(--text-muted)', textAlign: 'right' }}>
        {lastUpdated > 0 && <>{new Date(lastUpdated).toLocaleTimeString()} · </>}
        HL pays funding every 1 hour · all rates hourly % · click any row for detail · Net APY est. @ 7d hold
      </p>
    </div>
  );
};

export default Scanner;
