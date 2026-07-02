import { useEffect, useRef, useState } from 'react';

export function usePWA() {
  const [installable, setInstallable] = useState(false);
  const [installed,   setInstalled]   = useState(false);
  const [updateReady, setUpdateReady] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<unknown>(null);
  const waitingWorker = useRef<ServiceWorker | null>(null);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').then((reg) => {
        // A worker already waiting means an update is ready to apply.
        if (reg.waiting) {
          waitingWorker.current = reg.waiting;
          setUpdateReady(true);
        }
        // Detect a new worker installing while a controller already exists.
        reg.addEventListener('updatefound', () => {
          const installing = reg.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              waitingWorker.current = installing;
              setUpdateReady(true);
            }
          });
        });
      }).catch(console.error); // eslint-disable-line no-console

      // When the new worker takes control, reload once so the page and its
      // assets come from the same SW version (standard SWR update pattern).
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return;
        refreshing = true;
        window.location.reload();
      });
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (window.matchMedia('(display-mode: standalone)').matches) setInstalled(true);

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setInstallable(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', () => setInstalled(true));
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const install = async () => {
    if (!deferredPrompt) return;
    const prompt = deferredPrompt as { prompt: () => void; userChoice: Promise<{ outcome: string }> };
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === 'accepted') setInstalled(true);
    setDeferredPrompt(null);
    setInstallable(false);
  };

  // Called when the user accepts the "new version" prompt. Tells the waiting
  // worker to activate; controllerchange (above) then reloads the page.
  const applyUpdate = () => {
    waitingWorker.current?.postMessage({ type: 'SKIP_WAITING' });
    setUpdateReady(false);
  };

  return { installable, installed, install, updateReady, applyUpdate };
}
