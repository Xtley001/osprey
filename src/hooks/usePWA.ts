import { useEffect, useState } from 'react';

export function usePWA() {
  const [installable, setInstallable] = useState(false);
  const [installed,   setInstalled]   = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<unknown>(null);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(console.error);
    }
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

  return { installable, installed, install };
}
