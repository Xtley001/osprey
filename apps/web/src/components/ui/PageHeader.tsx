import React from 'react';

export interface PageHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Right-aligned actions (buttons, badges). */
  actions?: React.ReactNode;
  /** Inline element rendered next to the title (e.g. a LIVE badge). */
  badge?: React.ReactNode;
  style?: React.CSSProperties;
}

/**
 * Standard page header — replaces the hand-rolled
 * `<div flex space-between><h1>…</h1><actions/></div>` at the top of every page.
 * One h1 type treatment instead of six slightly different ones.
 */
export const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle, actions, badge, style }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--sp-4)', marginBottom: 'var(--sp-5)', flexWrap: 'wrap', ...style }}>
    <div style={{ minWidth: 0 }}>
      <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20, marginBottom: subtitle ? 4 : 0, display: 'flex', alignItems: 'center', gap: 10 }}>
        {title}
        {badge}
      </h1>
      {subtitle && <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{subtitle}</p>}
    </div>
    {actions && <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>{actions}</div>}
  </div>
);

export default PageHeader;
