import { useState, useEffect } from 'react';

export type Breakpoint = 'mobile' | 'tablet' | 'desktop';

const BREAKPOINTS = { mobile: 768, tablet: 1024 } as const;

function getBreakpoint(w: number): Breakpoint {
  if (w < BREAKPOINTS.mobile) return 'mobile';
  if (w < BREAKPOINTS.tablet) return 'tablet';
  return 'desktop';
}

export function useBreakpoint(): { bp: Breakpoint; isMobile: boolean; isTablet: boolean; isDesktop: boolean; width: number } {
  const [width, setWidth] = useState(() => typeof window !== 'undefined' ? window.innerWidth : 1280);
  const [bp, setBp] = useState<Breakpoint>(() => getBreakpoint(typeof window !== 'undefined' ? window.innerWidth : 1280));

  useEffect(() => {
    const handler = () => {
      const w = window.innerWidth;
      setWidth(w);
      setBp(getBreakpoint(w));
    };
    window.addEventListener('resize', handler, { passive: true });
    handler();
    return () => window.removeEventListener('resize', handler);
  }, []);

  return { bp, isMobile: bp === 'mobile', isTablet: bp === 'tablet', isDesktop: bp === 'desktop', width };
}
