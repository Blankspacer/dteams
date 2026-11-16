import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Video } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { AppTab, UserStatus } from '../../types';
import { PWAInstallButton } from '../common/PWAInstallButton';
import { STATUS_META } from '../../utils/presence';

export const TopNav: React.FC = () => {
  const { activeTab, setActiveTab, startVideoCall, activeMeeting, currentProfile, updateMyProfile } =
    useApp();
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!statusMenuOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setStatusMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [statusMenuOpen]);

  const navItems: Array<{ id: AppTab; label: string }> = [
    { id: 'chat', label: 'Chat' },
    { id: 'video', label: 'Video Call' },
    { id: 'transcripts', label: 'Transcripts' },
    { id: 'account', label: 'Account' },
  ];

  const myStatus: UserStatus = currentProfile?.status || 'online';
  const statusMeta = STATUS_META[myStatus];
  const statusOptions: Array<{ value: UserStatus; label: string; hint: string }> = [
    { value: 'online', label: 'Online', hint: 'Available to chat & call' },
    { value: 'busy', label: 'Busy', hint: 'In a meeting or focused' },
    { value: 'away', label: 'Away', hint: 'Stepped away briefly' },
    { value: 'offline', label: 'Offline', hint: 'Appear offline to team' },
  ];

  return (
    <header className="h-14 bg-white border-b border-slate-200 px-3 sm:px-6 flex items-center justify-between gap-2 sm:gap-6 shrink-0 sticky top-0 z-30">
      {/* Zone 1: Single text element wordmark */}
      <button
        onClick={() => setActiveTab('chat')}
        className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 flex items-center gap-2"
      >
        <span className="w-7 h-7 rounded-lg bg-sky-600 text-white flex items-center justify-center text-sm font-bold">
          S
        </span>
        <span>SphereCall</span>
      </button>

      {/* Zone 2: 4 concise single-line nav links */}
      <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`py-1.5 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                isActive
                  ? 'border-sky-600 text-slate-900 font-semibold'
                  : 'border-transparent hover:text-slate-900'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Zone 3: My Status Selector + Download + Primary Call Action */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        {currentProfile && (
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setStatusMenuOpen((o) => !o)}
              className="min-h-[40px] px-2.5 sm:px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
              title={`Your status: ${statusMeta.label}`}
              aria-label="Change your availability status"
            >
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${statusMeta.dotClass}`} />
              <span className="hidden sm:inline">{statusMeta.label}</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {statusMenuOpen && (
              <div className="absolute right-0 mt-1.5 w-52 bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 z-50">
                <div className="px-3 py-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                  Set Your Status
                </div>
                {statusOptions.map((opt) => {
                  const meta = STATUS_META[opt.value];
                  const active = myStatus === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        setStatusMenuOpen(false);
                        updateMyProfile({ status: opt.value });
                      }}
                      className={`w-full px-3 py-2 text-left flex items-start gap-2.5 hover:bg-slate-50 transition-colors ${
                        active ? 'bg-sky-50/70' : ''
                      }`}
                    >
                      <span className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${meta.dotClass}`} />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-900">{opt.label}</div>
                        <div className="text-[11px] text-slate-500">{opt.hint}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <PWAInstallButton variant="compact" />

        <button
          onClick={() => {
            if (activeMeeting) {
              setActiveTab('video');
            } else {
              startVideoCall();
            }
          }}
          className="px-3 sm:px-4 py-2 min-h-[40px] rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs sm:text-sm font-semibold flex items-center gap-1.5 sm:gap-2 transition-colors whitespace-nowrap shrink-0"
        >
          <Video className="w-4 h-4" />
          <span className="hidden sm:inline">{activeMeeting ? 'Return to Call' : 'Start Call'}</span>
          <span className="sm:hidden">{activeMeeting ? 'Call' : 'Call'}</span>
        </button>
      </div>
    </header>
  );
};
