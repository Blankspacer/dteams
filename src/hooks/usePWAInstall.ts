import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

// Capture beforeinstallprompt and appinstalled at module load so events
// firing before React mounts (or while modals are closed) are never lost.
let globalDeferredPrompt: BeforeInstallPromptEvent | null = null;
let globalInstalled = false;
const promptListeners = new Set<() => void>();

function notifyPromptListeners() {
  promptListeners.forEach((listener) => listener());
}

if (typeof window !== 'undefined') {
  globalInstalled =
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true;

  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    globalDeferredPrompt = e as BeforeInstallPromptEvent;
    notifyPromptListeners();
  });

  window.addEventListener('appinstalled', () => {
    globalInstalled = true;
    globalDeferredPrompt = null;
    notifyPromptListeners();
  });
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(
    () => globalDeferredPrompt
  );
  const [isInstalled, setIsInstalled] = useState<boolean>(() => globalInstalled);
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [isMac, setIsMac] = useState(false);
  const [isWindows, setIsWindows] = useState(false);
  const [isInIframe, setIsInIframe] = useState(false);
  const [isInAppBrowser, setIsInAppBrowser] = useState(false);
  const [configuredAppUrl, setConfiguredAppUrl] = useState<string>('');

  useEffect(() => {
    const syncState = () => {
      setDeferredPrompt(globalDeferredPrompt);
      const standaloneNow =
        globalInstalled ||
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true;
      setIsInstalled(standaloneNow);
    };

    syncState();
    promptListeners.add(syncState);

    try {
      setIsInIframe(window.self !== window.top);
    } catch {
      setIsInIframe(true);
    }

    const ua = window.navigator.userAgent.toLowerCase();
    const ios = /iphone|ipad|ipod/.test(ua);
    const android = /android/.test(ua);
    setIsIOS(ios);
    setIsAndroid(android);
    setIsMac(/macintosh|mac os x/.test(ua) && !ios);
    setIsWindows(/windows/.test(ua));
    setIsInAppBrowser(
      /fbav|fban|instagram|line\/|whatsapp|micromessenger|snapchat|twitter|gsa\/|; wv\)/i.test(
        ua
      )
    );

    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const handleDisplayModeChange = () => syncState();
    mediaQuery.addEventListener?.('change', handleDisplayModeChange);

    fetch('/api/app-info')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.appUrl && typeof data.appUrl === 'string' && !data.appUrl.includes('MY_APP_URL')) {
          setConfiguredAppUrl(data.appUrl.replace(/\/$/, ''));
        }
      })
      .catch(() => {
        // Fallback to window.location.origin
      });

    return () => {
      promptListeners.delete(syncState);
      mediaQuery.removeEventListener?.('change', handleDisplayModeChange);
    };
  }, []);

  const install = async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    const promptEvent = globalDeferredPrompt || deferredPrompt;
    if (!promptEvent) return 'unavailable';

    // Clear reference immediately because BeforeInstallPromptEvent.prompt() is single-use
    globalDeferredPrompt = null;
    notifyPromptListeners();

    try {
      await promptEvent.prompt();
      const { outcome } = await promptEvent.userChoice;
      if (outcome === 'accepted') {
        globalInstalled = true;
        notifyPromptListeners();
        return 'accepted';
      }
      return 'dismissed';
    } catch {
      return 'unavailable';
    }
  };

  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const isLocalhost =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  // Use the active HTTPS origin when deployed/shared so users stay on the exact origin
  // hosting their active Service Worker & auth session; use APP_URL on localhost dev.
  const baseUrl =
    !isLocalhost && currentOrigin
      ? currentOrigin
      : configuredAppUrl || currentOrigin;

  const downloadLink = baseUrl ? `${baseUrl}/download` : '/download';
  const standaloneInstallLink = currentOrigin
    ? `${currentOrigin}/download?install=1`
    : '/download?install=1';

  const chromeIntentUrl =
    typeof window !== 'undefined' && isAndroid
      ? `intent://${window.location.host}/download?install=1#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(
          standaloneInstallLink
        )};end`
      : '';

  const isMobile = isIOS || isAndroid;
  const isDesktop = !isMobile;

  return {
    isInstallable: !!deferredPrompt,
    isInstalled,
    isIOS,
    isAndroid,
    isMac,
    isWindows,
    isMobile,
    isDesktop,
    isInIframe,
    isInAppBrowser,
    install,
    baseUrl,
    downloadLink,
    standaloneInstallLink,
    chromeIntentUrl,
  };
}

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}
