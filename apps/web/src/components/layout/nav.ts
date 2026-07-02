import { LayoutGrid, Bot, Briefcase, BarChart2, Code2, Settings } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface NavItem {
  to: string;
  icon: LucideIcon;
  label: string;
  /** Shown in the mobile bottom bar. Secondary items live in the sidebar only. */
  primary: boolean;
}

// Single source of truth for navigation (audit P2-3 — was duplicated across
// AppShell + Sidebar). Order = the intended product flow:
//   discover → act → monitor → analyze → integrate → configure
//
// `primary` items appear in the mobile bottom bar. Settings stays primary so
// wallet connection is reachable on mobile (no sidebar there); Developers is a
// desktop-oriented docs page and lives in the sidebar only.
export const NAV_ITEMS: NavItem[] = [
  { to: '/',           icon: LayoutGrid, label: 'Scanner',    primary: true  },
  { to: '/harvest',    icon: Bot,        label: 'Harvest',    primary: true  },
  { to: '/portfolio',  icon: Briefcase,  label: 'Portfolio',  primary: true  },
  { to: '/analytics',  icon: BarChart2,  label: 'Analytics',  primary: true  },
  { to: '/developers', icon: Code2,      label: 'Developers', primary: false },
  { to: '/settings',   icon: Settings,   label: 'Settings',   primary: true  },
];
