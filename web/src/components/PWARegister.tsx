'use client';

import { useEffect, useState } from 'react';

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

export default function PWARegister() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [online, setOnline] = useState(true);
  const [iosInstallHelp, setIosInstallHelp] = useState(false);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isSafari = /safari/i.test(navigator.userAgent) && !/crios|fxios|edgios/i.test(navigator.userAgent);

    setInstalled(standalone);
    setOnline(navigator.onLine);
    setIosInstallHelp(isIOS && isSafari && !standalone);

    const onBeforeInstall = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPromptEvent); };
    const onInstalled = () => { setInstalled(true); setInstallPrompt(null); setIosInstallHelp(false); };
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);

    let interval = 0;
    let reloading = false;
    const registerServiceWorker = async () => {
      if (!('serviceWorker' in navigator) || process.env.NODE_ENV !== 'production') return;
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        const watch = (worker: ServiceWorker | null) => {
          if (!worker) return;
          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) setWaiting(registration.waiting || worker);
          });
        };
        if (registration.waiting && navigator.serviceWorker.controller) setWaiting(registration.waiting);
        registration.addEventListener('updatefound', () => watch(registration.installing));
        // Hourly update check
        interval = window.setInterval(() => { void registration.update(); }, 60 * 60 * 1000);
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (reloading) return;
          reloading = true;
          window.location.reload();
        });
      } catch (error) {
        console.error('Orchestra service worker registration failed:', error);
      }
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    if (document.readyState === 'complete') void registerServiceWorker();
    else window.addEventListener('load', () => void registerServiceWorker(), { once: true });

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.clearInterval(interval);
    };
  }, []);

  const install = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === 'accepted') setInstalled(true);
    setInstallPrompt(null);
  };

  return (
    <>
      {!online && <div className="pwa-status" role="status">OFFLINE · CACHED PAGES ONLY</div>}
      {waiting && (
        <div className="pwa-update" role="status">
          New version ready
          <button type="button" onClick={() => waiting.postMessage({ type: 'SKIP_WAITING' })}>Reload</button>
          <button type="button" aria-label="Dismiss update notice" onClick={() => setWaiting(null)}>×</button>
        </div>
      )}
      {installPrompt && !installed && (
        <aside className="pwa-install" aria-label="Install Orchestra">
          <div className="pwa-install-copy">
            Install Orchestra?
            <small>Add to your home screen for a faster, app-like experience.</small>
          </div>
          <button onClick={install}>Install</button>
          <button className="pwa-dismiss" aria-label="Dismiss install prompt" onClick={() => setInstallPrompt(null)}>×</button>
        </aside>
      )}
      {iosInstallHelp && !installed && (
        <aside className="pwa-install" aria-label="Add Orchestra to your Home Screen">
          <div className="pwa-install-copy">
            Add to Home Screen
            <small>Tap Share in Safari, then choose “Add to Home Screen”.</small>
          </div>
          <button className="pwa-dismiss" aria-label="Dismiss install instructions" onClick={() => setIosInstallHelp(false)}>×</button>
        </aside>
      )}
    </>
  );
}
