import React, { useState } from 'react';
import { Download } from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import { MobileDownloadModal } from './MobileDownloadModal';

interface PWAInstallButtonProps {
  variant?: 'compact' | 'card';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ variant = 'compact' }) => {
  const { isInstallable, isInstalled, install } = usePWAInstall();
  const [modalOpen, setModalOpen] = useState(false);

  // If already running as an installed standalone PWA and compact header button is rendered, hide the install button
  if (isInstalled && variant === 'compact') {
    return null;
  }

  const handleClick = async () => {
    if (isInstallable && !isInstalled) {
      const outcome = await install();
      if (outcome === 'accepted') return;
    }
    setModalOpen(true);
  };

  if (variant === 'card') {
    return (
      <>
        <button
          type="button"
          onClick={handleClick}
          className="w-full min-h-[44px] px-4 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
        >
          <Download className="w-4 h-4 shrink-0" />
          <span>
            {isInstalled
              ? 'Share App Link'
              : isInstallable
                ? 'Download & Install App'
                : 'Download to This Device'}
          </span>
        </button>

        <MobileDownloadModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className="min-h-[40px] px-2.5 sm:px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
        title="Download SphereCall to your laptop or phone"
      >
        <Download className="w-4 h-4 text-sky-600 shrink-0" />
        <span>
          {isInstallable ? 'Install' : 'Download'}
          <span className="hidden sm:inline"> App</span>
        </span>
      </button>

      <MobileDownloadModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
};
