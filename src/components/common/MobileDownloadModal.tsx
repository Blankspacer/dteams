import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  Smartphone,
  Laptop,
  MonitorSmartphone,
  Download,
  Copy,
  Check,
  Share2,
  X,
  Mail,
  Wifi,
  WifiOff,
  CheckCircle2,
  ExternalLink,
  MoreVertical,
  Share,
  PlusSquare,
  Globe,
} from 'lucide-react';
import { usePWAInstall, useOnlineStatus } from '../../hooks/usePWAInstall';

interface MobileDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
}

export const MobileDownloadModal: React.FC<MobileDownloadModalProps> = ({
  isOpen,
  onClose,
  title = 'Download App to Your Device',
}) => {
  const {
    isInstallable,
    isInstalled,
    isIOS,
    isAndroid,
    isMac,
    isMobile,
    isInIframe,
    isInAppBrowser,
    install,
    downloadLink,
    standaloneInstallLink,
    chromeIntentUrl,
  } = usePWAInstall();
  const isOnline = useOnlineStatus();
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [installPanelOpen, setInstallPanelOpen] = useState(false);
  const [installNotice, setInstallNotice] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);
  const [guideTab, setGuideTab] = useState<'laptop' | 'phone'>(isMobile ? 'phone' : 'laptop');
  const installPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setGuideTab(isMobile ? 'phone' : 'laptop');
  }, [isMobile]);

  useEffect(() => {
    if (!isOpen) {
      setInstallPanelOpen(false);
      setInstallNotice(null);
      return;
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !downloadLink) return;
    QRCode.toDataURL(downloadLink, {
      width: 220,
      margin: 2,
      color: { dark: '#0f172a', light: '#ffffff' },
    })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(''));
  }, [isOpen, downloadLink]);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(downloadLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Download SphereCall',
          text: 'Download SphereCall on your laptop or phone so we can chat, talk on video/voice calls, and share files:',
          url: downloadLink,
        });
        return;
      } catch {
        // User cancelled or share unsupported, fall back to copy
      }
    }
    handleCopy();
  };

  const revealInstallPanel = () => {
    setInstallPanelOpen(true);
    setGuideTab(isMobile ? 'phone' : 'laptop');
    setTimeout(() => {
      installPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 60);
  };

  const handleInstallClick = async () => {
    setInstallNotice(null);
    if (isInstallable) {
      setInstalling(true);
      try {
        const outcome = await install();
        if (outcome === 'accepted') {
          setInstallNotice('SphereCall is being installed on your device!');
          setInstallPanelOpen(false);
          return;
        }
        if (outcome === 'dismissed') {
          setInstallNotice(
            'Install prompt was dismissed. You can also install from your browser menu below:'
          );
        }
      } finally {
        setInstalling(false);
      }
    }
    revealInstallPanel();
  };

  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(
    `Download SphereCall on your laptop or phone so we can chat, call, and share files: ${downloadLink}`
  )}`;

  const mailtoUrl = `mailto:?subject=${encodeURIComponent(
    'Download SphereCall App (Laptop & Phone)'
  )}&body=${encodeURIComponent(
    `Open this link on your laptop or phone to install SphereCall:\n${downloadLink}\n\nOnce installed, sign in to chat, share files, and talk anytime over the internet.`
  )}`;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/55 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg overflow-hidden my-auto">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center shrink-0">
              <MonitorSmartphone className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-slate-900 truncate">{title}</h3>
              <p className="text-[11px] text-slate-500 truncate">
                Works on Laptop (Windows, Mac, Linux) & Phone (Android, iPhone)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[36px] min-w-[36px] flex items-center justify-center text-slate-400 hover:text-slate-700"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 sm:p-6 space-y-5">
          {/* Internet connectivity status */}
          <div
            className={`px-3.5 py-2.5 rounded-xl border text-xs font-medium flex items-center gap-2 ${
              isOnline
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-amber-50 border-amber-200 text-amber-800'
            }`}
          >
            {isOnline ? (
              <>
                <Wifi className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Online — install on your laptop or phone and talk & share live.</span>
              </>
            ) : (
              <>
                <WifiOff className="w-4 h-4 text-amber-600 shrink-0" />
                <span>You are offline — reconnect to download updates, talk, and share files.</span>
              </>
            )}
          </div>

          {/* Direct Install CTA on current device */}
          {isInstalled ? (
            <div className="p-3.5 rounded-xl bg-sky-50 border border-sky-200 text-sky-900 text-xs flex items-center gap-2.5">
              <CheckCircle2 className="w-5 h-5 text-sky-600 shrink-0" />
              <span>SphereCall is already installed as an app on this device.</span>
            </div>
          ) : (
            <div className="space-y-2.5">
              {isInstallable ? (
                <button
                  type="button"
                  onClick={handleInstallClick}
                  disabled={installing}
                  className="w-full min-h-[46px] px-4 rounded-xl bg-sky-600 hover:bg-sky-700 active:bg-sky-800 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
                >
                  <Download className="w-4 h-4 shrink-0" />
                  <span>
                    {installing
                      ? 'Opening Installer...'
                      : `Download & Install on This ${isMobile ? 'Phone' : 'Laptop'}`}
                  </span>
                </button>
              ) : isInIframe ? (
                <div className="p-3.5 rounded-xl bg-sky-50 border border-sky-200 space-y-2.5">
                  <p className="text-xs text-sky-950 leading-relaxed">
                    You are viewing inside an embedded preview. Open the full browser tab to download and install SphereCall directly onto your laptop or phone:
                  </p>
                  <a
                    href={standaloneInstallLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full min-h-[44px] px-4 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
                  >
                    <ExternalLink className="w-4 h-4 shrink-0" />
                    <span>Open Standalone Tab to Install App</span>
                  </a>
                </div>
              ) : isAndroid && isInAppBrowser && chromeIntentUrl ? (
                <div className="p-3.5 rounded-xl bg-sky-50 border border-sky-200 space-y-2.5">
                  <p className="text-xs text-sky-950 leading-relaxed">
                    In-app browsers (like WhatsApp or Gmail) block app downloads. Open this link in Google Chrome to install SphereCall to your phone home screen:
                  </p>
                  <a
                    href={chromeIntentUrl}
                    className="w-full min-h-[46px] px-4 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
                  >
                    <Globe className="w-4 h-4 shrink-0" />
                    <span>Open in Chrome to Install App</span>
                  </a>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleInstallClick}
                  className="w-full min-h-[46px] px-4 rounded-xl bg-sky-600 hover:bg-sky-700 active:bg-sky-800 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
                >
                  <Download className="w-4 h-4 shrink-0" />
                  <span>
                    {isIOS
                      ? 'Install on iPhone / iPad Home Screen'
                      : isMobile
                        ? 'Install on Phone Home Screen'
                        : 'Install on Laptop / Desktop'}
                  </span>
                </button>
              )}

              {installNotice && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 font-medium leading-relaxed">
                  {installNotice}
                </div>
              )}

              {installPanelOpen && (
                <div
                  ref={installPanelRef}
                  className="p-4 rounded-xl bg-sky-50 border-2 border-sky-300 space-y-3 text-xs text-slate-800"
                >
                  <div className="font-bold text-sky-950 flex items-center justify-between gap-2">
                    <span>
                      {isIOS
                        ? 'Add SphereCall to iPhone / iPad Home Screen'
                        : isAndroid
                          ? 'Add SphereCall to Android Home Screen'
                          : 'Install SphereCall on Your Computer'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setInstallPanelOpen(false)}
                      className="text-sky-700 hover:text-sky-950 text-[11px] font-semibold"
                    >
                      Hide
                    </button>
                  </div>

                  {isIOS ? (
                    <ol className="space-y-2 text-slate-700">
                      <li className="flex items-start gap-2">
                        <span className="w-5 h-5 rounded-full bg-sky-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                          1
                        </span>
                        <span>
                          Make sure this page is open in <strong>Safari</strong> (tap Copy Link below if you opened it inside another app).
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="w-5 h-5 rounded-full bg-sky-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                          2
                        </span>
                        <span className="flex items-center gap-1 flex-wrap">
                          Tap the <Share className="w-3.5 h-3.5 text-sky-600 inline" /> <strong>Share</strong> button in Safari&apos;s toolbar.
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="w-5 h-5 rounded-full bg-sky-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                          3
                        </span>
                        <span className="flex items-center gap-1 flex-wrap">
                          Scroll down, tap <PlusSquare className="w-3.5 h-3.5 text-sky-600 inline" /> <strong>Add to Home Screen</strong>, then tap <strong>Add</strong>.
                        </span>
                      </li>
                    </ol>
                  ) : isAndroid ? (
                    <div className="space-y-3">
                      <ol className="space-y-2 text-slate-700">
                        <li className="flex items-start gap-2">
                          <span className="w-5 h-5 rounded-full bg-sky-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                            1
                          </span>
                          <span className="flex items-center gap-1 flex-wrap">
                            Tap the browser menu <MoreVertical className="w-3.5 h-3.5 text-slate-700 inline" /> at the top-right corner of Chrome or Edge.
                          </span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="w-5 h-5 rounded-full bg-sky-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                            2
                          </span>
                          <span>
                            Tap <strong>Install app</strong> or <strong>Add to Home screen</strong> → <strong>Install</strong>.
                          </span>
                        </li>
                      </ol>

                      {chromeIntentUrl && (
                        <a
                          href={chromeIntentUrl}
                          className="w-full min-h-[40px] px-3.5 rounded-xl bg-white border border-sky-300 hover:bg-sky-100 text-sky-900 text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
                        >
                          <Globe className="w-4 h-4 text-sky-600 shrink-0" />
                          <span>Open in Google Chrome for 1-Tap Install</span>
                        </a>
                      )}
                    </div>
                  ) : (
                    <ol className="space-y-2 text-slate-700">
                      <li className="flex items-start gap-2">
                        <span className="w-5 h-5 rounded-full bg-sky-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                          1
                        </span>
                        <span>
                          {isMac
                            ? 'In Chrome or Edge click the Install icon (⊕) in the address bar. In Safari click File → Add to Dock.'
                            : 'In Chrome or Edge click the Install icon (⊕) on the right side of the address bar.'}
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="w-5 h-5 rounded-full bg-sky-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                          2
                        </span>
                        <span>
                          Or open the browser menu (⋮) → <strong>Cast, save, and share</strong> → <strong>Install SphereCall</strong>.
                        </span>
                      </li>
                    </ol>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Shareable App Download Link */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-800">
              App Download Link (Send to another laptop or phone)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={downloadLink}
                onFocus={(e) => e.target.select()}
                className="flex-1 min-h-[42px] bg-slate-50 border border-slate-300 rounded-xl px-3 text-xs font-mono text-slate-800 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleCopy}
                className="min-h-[42px] px-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center gap-1.5 shrink-0"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-1">
              <button
                type="button"
                onClick={handleShare}
                className="min-h-[40px] px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold flex items-center justify-center gap-1.5"
              >
                <Share2 className="w-3.5 h-3.5 text-sky-600" />
                <span>Share</span>
              </button>
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[40px] px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold flex items-center justify-center gap-1.5"
              >
                <ExternalLink className="w-3.5 h-3.5 text-emerald-600" />
                <span>WhatsApp</span>
              </a>
              <a
                href={mailtoUrl}
                className="min-h-[40px] px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold flex items-center justify-center gap-1.5"
              >
                <Mail className="w-3.5 h-3.5 text-sky-600" />
                <span>Email</span>
              </a>
            </div>
          </div>

          {/* QR Code & Laptop / Phone Steps */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-start pt-3 border-t border-slate-100">
            <div className="sm:col-span-5 flex flex-col items-center">
              {qrDataUrl ? (
                <div className="p-2 bg-white border border-slate-200 rounded-xl">
                  <img
                    src={qrDataUrl}
                    alt="QR code to download SphereCall app"
                    className="w-36 h-36 object-contain"
                  />
                </div>
              ) : (
                <div className="w-36 h-36 bg-slate-100 rounded-xl flex items-center justify-center text-xs text-slate-400">
                  QR Preview
                </div>
              )}
              <span className="mt-1.5 text-[11px] text-slate-500 font-medium">
                Scan with phone camera
              </span>
            </div>

            <div className="sm:col-span-7 space-y-2.5 text-xs text-slate-600">
              <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setGuideTab('laptop')}
                  className={`flex-1 min-h-[32px] px-2.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                    guideTab === 'laptop'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Laptop className="w-3.5 h-3.5" />
                  <span>Laptop</span>
                </button>
                <button
                  type="button"
                  onClick={() => setGuideTab('phone')}
                  className={`flex-1 min-h-[32px] px-2.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                    guideTab === 'phone'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>Phone</span>
                </button>
              </div>

              {guideTab === 'laptop' ? (
                <div className="space-y-2.5">
                  <div>
                    <div className="font-bold text-slate-900">Windows / Mac / Linux (Chrome or Edge)</div>
                    <p>
                      Open the link in a full tab, then click the <strong>Install</strong> icon in the address bar (or menu ⋮ → <strong>Install SphereCall</strong>).
                    </p>
                  </div>
                  <div>
                    <div className="font-bold text-slate-900">Mac (Safari)</div>
                    <p>
                      Open the link in Safari and click <strong>File → Add to Dock</strong> in the top menu bar.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div>
                    <div className="font-bold text-slate-900">Android (Chrome / Edge)</div>
                    <p>
                      Open the link and tap <strong>Download &amp; Install</strong> or browser menu ⋮ → <strong>Install app</strong>.
                    </p>
                  </div>
                  <div>
                    <div className="font-bold text-slate-900">iPhone / iPad (Safari)</div>
                    <p>
                      Open the link in Safari, tap <strong>Share</strong>, then choose <strong>Add to Home Screen</strong>.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
