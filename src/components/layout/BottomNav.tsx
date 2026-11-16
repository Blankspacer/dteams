import React from 'react';
import { MessageSquare, Phone, Sparkles, User } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { AppTab } from '../../types';

export const BottomNav: React.FC = () => {
  const { activeTab, setActiveTab } = useApp();

  const tabs: Array<{ id: AppTab; label: string; icon: React.ReactNode }> = [
    { id: 'chat', label: 'Chat', icon: <MessageSquare className="w-5 h-5" /> },
    { id: 'video', label: 'Calls', icon: <Phone className="w-5 h-5" /> },
    { id: 'transcripts', label: 'AI Assistant', icon: <Sparkles className="w-5 h-5" /> },
    { id: 'account', label: 'Account', icon: <User className="w-5 h-5" /> },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-white/95 backdrop-blur-md border-t border-slate-200 grid grid-cols-4 items-center z-40">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`min-h-[44px] flex flex-col items-center justify-center transition-colors ${
              isActive ? 'text-sky-600 font-semibold' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {tab.icon}
            <span className="text-[11px] tracking-tight mt-0.5 whitespace-nowrap">
              {tab.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
};
