/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Component, ErrorInfo, ReactNode, useEffect, useState } from 'react';
import { Loader2, AlertCircle, X } from 'lucide-react';
import { AppProvider, useApp } from './context/AppContext';
import { AuthScreen } from './components/auth/AuthScreen';
import { TopNav } from './components/layout/TopNav';
import { BottomNav } from './components/layout/BottomNav';
import { Footer } from './components/layout/Footer';
import { SimpleChatView } from './components/chat/SimpleChatView';
import { SimpleVideoView } from './components/video/SimpleVideoView';
import { SimpleCalendarView } from './components/calendar/SimpleCalendarView';
import { SimpleTranscriptsView } from './components/transcripts/SimpleTranscriptsView';
import { SimpleAccountView } from './components/account/SimpleAccountView';
import { OfflineIndicator } from './components/common/OfflineIndicator';
import { MobileDownloadModal } from './components/common/MobileDownloadModal';
import { AddMemberModal } from './components/common/AddMemberModal';
import { IncomingCallOverlay } from './components/common/IncomingCallOverlay';
import { sounds } from './utils/audio';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

class AppErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let readable = error.message || 'An unexpected error occurred.';
    try {
      const parsed = JSON.parse(error.message);
      if (parsed?.error) {
        readable = `Database permission or sync error: ${parsed.error}`;
      }
    } catch {
      // Plain error message
    }
    return { hasError: true, message: readable };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Application error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-6 space-y-4 text-center">
            <AlertCircle className="w-10 h-10 text-rose-500 mx-auto" />
            <h1 className="text-lg font-bold text-slate-900">Something went wrong</h1>
            <p className="text-xs text-slate-600 break-words">{this.state.message}</p>
            <button
              onClick={() => window.location.reload()}
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold"
            >
              Reload App
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function MainAppShell() {
  const {
    firebaseUser,
    authLoading,
    activeTab,
    setActiveTab,
    isFirstLogin,
    dismissFirstLoginPrompt,
    errorBanner,
    setErrorBanner,
  } = useApp();
  const [downloadModalOpen, setDownloadModalOpen] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const isDownloadRoute =
      window.location.pathname === '/download' ||
      params.has('download') ||
      params.has('install');
    if (isDownloadRoute) {
      setDownloadModalOpen(true);
    }

    const unlockAudio = () => {
      sounds.unlock();
    };
    window.addEventListener('pointerdown', unlockAudio, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', unlockAudio);
    };
  }, []);

  const closeDownloadModal = () => {
    setDownloadModalOpen(false);
    if (window.location.pathname === '/download' || window.location.search.includes('download') || window.location.search.includes('install')) {
      window.history.replaceState({}, '', '/');
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <Loader2 className="w-7 h-7 animate-spin text-sky-600" />
          <span className="text-xs font-medium">Loading SphereCall...</span>
        </div>
      </div>
    );
  }

  if (!firebaseUser || !firebaseUser.emailVerified) {
    return (
      <>
        <AuthScreen />
        <OfflineIndicator />
        <MobileDownloadModal isOpen={downloadModalOpen} onClose={closeDownloadModal} />
      </>
    );
  }

  return (
    <div className="h-screen bg-slate-50 text-slate-900 flex flex-col overflow-hidden">
      <TopNav />

      {errorBanner && (
        <div className="bg-rose-50 border-b border-rose-200 px-4 py-2 text-xs text-rose-700 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="truncate">{errorBanner}</span>
          </div>
          <button
            onClick={() => setErrorBanner(null)}
            className="p-1 text-rose-600 hover:text-rose-900 shrink-0"
            aria-label="Dismiss error"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {activeTab === 'chat' && <SimpleChatView />}
        {activeTab === 'video' && <SimpleVideoView />}
        {activeTab === 'calendar' && <SimpleCalendarView />}
        {activeTab === 'transcripts' && <SimpleTranscriptsView />}
        {activeTab === 'account' && <SimpleAccountView />}
      </div>

      <Footer className="mb-16 md:mb-0" />
      <BottomNav />
      <IncomingCallOverlay />
      <OfflineIndicator />
      <MobileDownloadModal isOpen={downloadModalOpen} onClose={closeDownloadModal} />
      <AddMemberModal
        isOpen={isFirstLogin}
        onClose={dismissFirstLoginPrompt}
        initialTab="available"
        welcomeMode={true}
        onStartedChat={() => {
          setActiveTab('chat');
          dismissFirstLoginPrompt();
        }}
      />
    </div>
  );
}

export default function App() {
  return (
    <AppErrorBoundary>
      <AppProvider>
        <MainAppShell />
      </AppProvider>
    </AppErrorBoundary>
  );
}
