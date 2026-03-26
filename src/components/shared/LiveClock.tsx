import React, { useState, useEffect } from 'react';

// Ticks every second — used in TopBar and anywhere a live wall clock is needed
export const LiveClock: React.FC<{ style?: React.CSSProperties }> = ({ style }) => {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Show HH:MM:SS UTC
  const utc = now.toUTCString().split(' ')[4]; // "HH:MM:SS"
  const local = now.toLocaleTimeString();

  return (
    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', ...style }}>
      {local} · <span style={{ color: 'var(--text-muted)', opacity: 0.6 }}>UTC {utc}</span>
    </span>
  );
};

// Shows how long until next HL funding payment (top of the hour)
export const NextFundingCountdown: React.FC<{ style?: React.CSSProperties }> = ({ style }) => {
  const [secs, setSecs] = useState(0);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const secsUntilHour = 3600 - (now.getMinutes() * 60 + now.getSeconds());
      setSecs(secsUntilHour);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');

  const urgency = secs < 120
    ? 'var(--accent-green)'
    : secs < 600
    ? 'var(--accent-yellow)'
    : 'var(--text-muted)';

  return (
    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: urgency, ...style }}>
      Next funding {m}:{s}
    </span>
  );
};
