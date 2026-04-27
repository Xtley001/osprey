import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { TrendingUp, TrendingDown, Minus, ChevronUp, ChevronDown } from 'lucide-react';
import { useScannerStore } from '../store/scannerStore';
import { useAppStore } from '../store/appStore';
import { detectRegime } from '../engine/regime';
import { formatUSD, formatPrice, formatPct } from '../utils/format';
import { RATE_POLL_INTERVAL } from '../utils/constants';
import { EntryModal } from '../components/shared/EntryModal';
import type { Category, SortKey, FundingRate } from '../types/funding';
import { useBreakpoint } from '../hooks/useBreakpoint';

const CATEGORIES: Category[] = ['All', 'Crypto', 'TradFi', 'HIP-3', 'Pre-launch'];

type SortDir = 'desc' | 'asc';

const TrendIcon: React.FC<{ trend: FundingRate['trend'] }> = ({ trend }) => {
  if (trend === 'rising')  return <TrendingUp  size={11} color="var(--accent-green)" />;
  if (trend === 'falling') return <TrendingDown size={11} color="var(--accent-red)"  />;
  return <Minus size={11} color="var(--text-muted)" />;
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

  // Count per category for badges on filter tabs
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { All: allPairs.length };
    allPairs.forEach(p => {
      counts[p.category] = (counts[p.category] ?? 0) + 1;
    });
    return counts;
  }, [allPairs]);

  const [sortDir, setSortDir]       = useState<SortDir>('desc');
  const [entryPair, setEntryPair]   = useState<FundingRate | null>(null);

  // Sorted pairs respect direction
  const displayPairs = sortDir === 'desc' ? pairs : [...pairs].reverse();

  const runRef = useRef<() => Promise<void>>();
  runRef.current = async () => {
    await useScannerStore.getState().fetchRates();
    const pairs = useScannerStore.getState().pairs;
    if (pairs.length > 0) {
      const appSt = useAppStore.getState();
      const { regime, nextPrevAvg } = detectRegime(pairs, appSt.prevRegimeAvg);
      appSt.setPrevRegimeAvg(nextPrevAvg);
      appSt.setRegime(regime);
    }
  };

  useEffect(() => {
    runRef.current?.();
    const id = setInterval(() => runRef.current?.(), RATE_POLL_INTERVAL);
    return () => clearInterval(id);
  }, []);

  const handleColumnClick = (key: SortKey) => {
    if (sortBy === key) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(key);
      setSortDir('desc');
    }
  };

  const ColHeader: React.FC<{ label: string; sortKey?: SortKey; style?: React.CSSProperties }> = ({ label, sortKey, style }) => {
    const isActive = sortKey && sortBy === sortKey;
    return (
      <th
        onClick={sortKey ? () => handleColumnClick(sortKey) : undefined}
        style={{
          padding: '10px 12px', textAlign: 'left', whiteSpace: 'nowrap',
          fontSize: 10, fontWeight: 600, color: isActive ? 'var(--hl-teal)' : 'var(--text-muted)',
          fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.06em',
          cursor: sortKey ? 'pointer' : 'default',
          userSelect: 'none',
          transition: 'color var(--t-fast)',
          ...style,
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
          {label}
          {isActive && (sortDir === 'desc'
            ? <ChevronDown size={11} />
            : <ChevronUp   size={11} />
          )}
          {sortKey && !isActive && <ChevronDown size={10} style={{ opacity: 0.3 }} />}
        </span>
      </th>
    );
  };

  return (
    <div className="fade-in" style={{ paddingTop: 'var(--sp-4)' }}>
      {entryPair && <EntryModal pair={entryPair} onClose={() => setEntryPair(null)} />}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--sp-4)' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20, marginBottom: 4 }}>
            Funding Scanner
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
            {pairsCount} pairs · HL pays every hour · click any column to sort
          </p>
        </div>
      </div>

      {/* API error banner */}
      {apiError && (
        <div style={{
          background: 'rgba(255,79,110,0.1)', border: '1px solid rgba(255,79,110,0.3)',
          borderRadius: 'var(--r-md)', padding: '10px 14px', marginBottom: 'var(--sp-3)',
          display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 12,
        }}>
          <span style={{ color: 'var(--accent-red)', fontWeight: 700, flexShrink: 0, marginTop: 1 }}>⚠</span>
          <div style={{ flex: 1 }}>
            <span style={{ color: 'var(--accent-red)', fontWeight: 600 }}>Hyperliquid API error — </span>
            <span style={{ color: 'var(--text-secondary)' }}>{apiError}</span>
            {allPairs.length > 0 && (
              <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>Showing last successful data.</span>
            )}
          </div>
          <button
            className="btn btn-ghost"
            style={{ fontSize: 11, padding: '3px 10px', flexShrink: 0 }}
            onClick={() => { clearError(); useScannerStore.getState().fetchRates(); }}
          >
            Retry
          </button>
          <button onClick={clearError} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16, padding: 0, flexShrink: 0 }}>×</button>
        </div>
      )}

      {/* Category filters */}
      <div style={{ display: 'flex', gap: 'var(--sp-2)', marginBottom: 'var(--sp-3)', flexWrap: 'wrap', alignItems: 'center' }}>
        {CATEGORIES.map(cat => {
          const count = categoryCounts[cat] ?? 0;
          const isActive = filter === cat;
          // Hide categories with 0 pairs (except All)
          if (cat !== 'All' && count === 0 && allPairs.length > 0) return null;
          return (
            <button key={cat} onClick={() => setFilter(cat)} style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '4px 10px', borderRadius: 'var(--r-md)',
              border: `1px solid ${isActive ? 'var(--hl-teal)' : 'var(--glass-border)'}`,
              background: isActive ? 'var(--hl-teal-dim)' : 'transparent',
              color: isActive ? 'var(--hl-teal)' : 'var(--text-secondary)',
              cursor: 'pointer', fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 500,
              transition: 'all var(--t-fast)',
            }}>
              {cat}
              {allPairs.length > 0 && (
                <span style={{
                  background: isActive ? 'rgba(67,232,216,0.2)' : 'var(--bg-elevated)',
                  color: isActive ? 'var(--hl-teal)' : 'var(--text-muted)',
                  borderRadius: 10, padding: '0px 5px', fontSize: 10,
                  fontFamily: 'var(--font-mono)', fontWeight: 600, minWidth: 18, textAlign: 'center',
                }}>{count}</span>
              )}
            </button>
          );
        })}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>
          {displayPairs.length} shown
        </span>
      </div>

      {/* Table */}
      <div className="table-wrap" style={{ background: 'var(--bg-surface)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 740 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--glass-border)' }}>
              <ColHeader label="Pair" />
              <ColHeader label="Price" />
              <ColHeader label="24h" />
              <ColHeader label="Rate (1h)" sortKey="rate" />
              <ColHeader label="Rate (8h)" />
              <ColHeader label="Annual" sortKey="annualYield" />
              <ColHeader label="OI" sortKey="oi" />
              <ColHeader label="Volume" sortKey="volume" />
              <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading && displayPairs.length === 0 ? (
              <tr><td colSpan={9} style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
                Loading rates…
              </td></tr>
            ) : displayPairs.length === 0 ? (
              <tr><td colSpan={9} style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
                No pairs match this filter.
              </td></tr>
            ) : displayPairs.map(pair => (
              <tr
                key={pair.symbol}
                onClick={() => navigate(`/pair/${pair.symbol}`)}
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
                <td style={{ padding: '9px 12px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)' }}>
                  {formatUSD(pair.openInterest)}
                </td>
                <td style={{ padding: '9px 12px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)' }}>
                  {formatUSD(pair.volume24h)}
                </td>
                <td style={{ padding: '9px 12px' }}>
                  <button
                    className="btn btn-primary"
                    style={{ padding: '3px 10px', fontSize: 11, gap: 4 }}
                    onClick={e => { e.stopPropagation(); setEntryPair(pair); }}
                  >
                    Enter
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ marginTop: 'var(--sp-3)', fontSize: 11, color: 'var(--text-muted)', textAlign: 'right' }}>
        {lastUpdated > 0 && <>{new Date(lastUpdated).toLocaleTimeString()} · </>}
        HL pays funding every 1 hour · all rates hourly % · click any row for detail
      </p>
    </div>
  );
};

export default Scanner;
