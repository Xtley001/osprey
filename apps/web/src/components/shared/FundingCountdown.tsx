import React, { useState, useEffect } from 'react';

/**
 * NextFundingCountdown — countdown to the next HL funding settlement.
 * HL pays funding at the top of every hour.
 * LiveClock removed in Phase 1 (wall clock — useless in a trading system).
 */
export const NextFundingCountdown: React.FC<{ style?: React.CSSProperties }> = ({ style }) => {
  const [msLeft, setMsLeft] = useState(0);

  useEffect(() => {
    const update = () => {
      const now   = new Date();
      const next  = new Date(now);
      next.setMinutes(0, 0, 0);
      next.setHours(next.getHours() + 1);
      setMsLeft(next.getTime() - now.getTime());
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);

  const minutes = Math.floor(msLeft / 60_000);
  const seconds = Math.floor((msLeft % 60_000) / 1000);

  return (
    <span style={{
      fontFamily: 'var(--font-mono)', fontSize: 11,
      color: msLeft < 300_000 ? 'var(--accent-yellow)' : 'var(--text-muted)',
      ...style,
    }}>
      ⏱ {minutes}:{String(seconds).padStart(2, '0')} to funding
    </span>
  );
};
