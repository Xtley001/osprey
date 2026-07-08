import { LayoutGrid, Bot, Briefcase, BarChart2, Settings } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface NavItem {
  to: string;
  icon: LucideIcon;
  label: string;
  /** Shown in the mobile bottom bar. Secondary items live in the sidebar only. */
  primary: boolean;
}

// Single source of truth for the dashboard navigation. The app lives under
// /app; the marketing zone (/, /docs) is separate. Order = the product flow:
//   discover → act → monitor → analyze → configure
// Developers moved to the public /docs page — a docs surface doesn't belong in
// the trading nav.
export const NAV_ITEMS: NavItem[] = [
  { to: '/app',           icon: LayoutGrid, label: 'Scanner',   primary: true },
  { to: '/app/harvest',   icon: Bot,        label: 'Harvest',   primary: true },
  { to: '/app/portfolio', icon: Briefcase,  label: 'Portfolio', primary: true },
  { to: '/app/analytics', icon: BarChart2,  label: 'Analytics', primary: true },
  { to: '/app/settings',  icon: Settings,   label: 'Settings',  primary: true },
];
