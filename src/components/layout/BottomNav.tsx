import React from 'react';
import { Calendar, MessageSquare, Phone, Sparkles, User } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { AppTab } from '../../types';

export const BottomNav: React.FC = () => {
  const { activeTab, setActiveTab, activeMeeting } = useApp();

  const tabs: Array<{ id: AppTab; label: string; icon: React.ReactNode; liveDot?: boolean }> = [
    { id: 'chat', label: 'Chat', icon: <MessageSquare className="w-5 h-5" /> },
    { id: 'video', label: 'Calls', icon: <Phone className="w-5 h-5" />, liveDot: Boolean(activeMeeting) },
    { id: 'calendar', label: 'Calendar', icon: <Calendar className="w-5 h-5" /> },
    { id: 'transcripts', label: 'AI MoM', icon: <Sparkles className="w-5 h-5" /> },
    { id: 'account', label: 'Account', icon: <User className="w-5 h-5" /> },
  ];

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 min-h-[4rem] pb-[env(safe-area-inset-bottom)] bg-white/95 backdrop-blur-md border-t border-slate-200 grid grid-cols-5 items-center z-40"
      aria-label="Mobile navigation"
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`relative min-h-[48px] flex flex-col items-center justify-center transition-colors ${
              isActive ? 'text-sky-600 font-semibold' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <div className="relative">
              {tab.icon}
              {tab.liveDot && (
                <span className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white animate-pulse" />
              )}
            </div>
            <span className="text-[11px] tracking-tight mt-0.5 whitespace-nowrap">
              {tab.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
};
