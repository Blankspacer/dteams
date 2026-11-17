import React, { useEffect, useRef, useState } from 'react';
import { Bell, BellOff, Camera, ChevronDown, LogOut, Phone, User, Users, Video, Volume2, VolumeX } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useMeetingNotifications } from '../../context/NotificationContext';
import { AppTab, UserStatus } from '../../types';
import { PWAInstallButton } from '../common/PWAInstallButton';
import { STATUS_META } from '../../utils/presence';
import { compressAvatarImage } from '../../utils/avatar';

export const TopNav: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    startVideoCall,
    activeMeeting,
    firebaseUser,
    currentProfile,
    updateMyProfile,
    signOut,
    setErrorBanner,
    openCreateGroupModal,
  } = useApp();
  const {
    permission: notifPermission,
    remindersEnabled,
    soundEnabled,
    activeReminders,
    toggleRemindersEnabled,
    toggleSoundEnabled,
    requestNotificationPermission,
    sendTestReminder,
  } = useMeetingNotifications();
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [notifMenuOpen, setNotifMenuOpen] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const notifMenuRef = useRef<HTMLDivElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!accountMenuOpen && !notifMenuOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setAccountMenuOpen(false);
      }
      if (notifMenuRef.current && !notifMenuRef.current.contains(e.target as Node)) {
        setNotifMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [accountMenuOpen, notifMenuOpen]);

  const navItems: Array<{ id: AppTab; label: string }> = [
    { id: 'chat', label: 'Chat' },
    { id: 'video', label: 'Calls' },
    { id: 'calendar', label: 'Calendar' },
    { id: 'transcripts', label: 'AI Assistant' },
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

  const displayName =
    currentProfile?.displayName || firebaseUser?.displayName || firebaseUser?.email || 'Account';
  const initials = displayName.slice(0, 2).toUpperCase();

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const compressed = await compressAvatarImage(file);
      await updateMyProfile({ avatar: compressed });
      setAccountMenuOpen(false);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Could not update profile photo.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    setAccountMenuOpen(false);
    try {
      await signOut();
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <header className="h-14 w-full max-w-full bg-white border-b border-slate-200 px-2.5 sm:px-6 flex items-center justify-between gap-1.5 sm:gap-4 shrink-0 sticky top-0 z-30">
      {/* Zone 1: Wordmark */}
      <button
        onClick={() => setActiveTab('chat')}
        className="text-[15px] sm:text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap min-w-0 flex items-center gap-1.5 sm:gap-2"
      >
        <span className="w-7 h-7 rounded-lg bg-sky-600 text-white flex items-center justify-center text-sm font-bold shrink-0">
          S
        </span>
        <span className="truncate">SphereCall</span>
      </button>

      {/* Zone 2: Primary Desktop Nav */}
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

      {/* Zone 3: Quick Actions + Notifications + Profile Menu + Always-Visible Log Out */}
      <div className="flex items-center gap-1 sm:gap-2 shrink-0">
        <button
          type="button"
          onClick={openCreateGroupModal}
          className="hidden md:flex px-3 py-2 min-h-[40px] rounded-xl border border-slate-200 bg-white hover:bg-sky-50 hover:border-sky-300 text-slate-700 hover:text-sky-700 text-xs font-semibold items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
          title="Create Group"
          aria-label="Create Group"
        >
          <Users className="w-4 h-4 text-sky-600 shrink-0" />
          <span className="hidden xl:inline">Create Group</span>
        </button>

        <div className="hidden lg:block shrink-0">
          <PWAInstallButton variant="compact" />
        </div>

        {!activeMeeting && (
          <button
            type="button"
            onClick={() => startVideoCall(undefined, undefined, 'voice')}
            className="hidden sm:flex px-3 py-2 min-h-[40px] rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-semibold items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            title="Start Voice Call"
            aria-label="Start Voice Call"
          >
            <Phone className="w-4 h-4 shrink-0" />
            <span>Voice</span>
          </button>
        )}

        <button
          onClick={() => {
            if (activeMeeting) {
              setActiveTab('video');
            } else {
              startVideoCall(undefined, undefined, 'video');
            }
          }}
          className="hidden min-[360px]:flex min-h-[40px] min-w-[40px] sm:min-w-0 px-2.5 sm:px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs sm:text-sm font-semibold items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
          title={activeMeeting ? 'Return to active call' : 'Start Video Call'}
          aria-label={activeMeeting ? 'Return to active call' : 'Start Video Call'}
        >
          <Video className="w-4 h-4 shrink-0" />
          <span className="hidden sm:inline">{activeMeeting ? 'Return to Call' : 'Video Call'}</span>
        </button>

        {/* 5-Minute Meeting Push Notifications Menu */}
        <div className="relative" ref={notifMenuRef}>
          <button
            type="button"
            onClick={() => {
              setAccountMenuOpen(false);
              setNotifMenuOpen((o) => !o);
            }}
            className={`relative min-h-[40px] min-w-[40px] w-10 rounded-xl border flex items-center justify-center transition-colors shrink-0 ${
              remindersEnabled
                ? 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                : 'border-slate-200 bg-slate-50 text-slate-400'
            }`}
            title="Meeting push notifications (5 min before)"
            aria-label="Meeting push notifications"
          >
            {remindersEnabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
            {activeReminders.length > 0 ? (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
                {activeReminders.length}
              </span>
            ) : (
              remindersEnabled &&
              notifPermission === 'default' && (
                <span className="w-2 h-2 rounded-full bg-amber-500 absolute top-1.5 right-1.5" />
              )
            )}
          </button>

          {notifMenuOpen && (
            <div className="fixed left-3 right-3 top-14 sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:mt-1.5 sm:w-72 bg-white border border-slate-200 rounded-2xl shadow-lg p-3.5 space-y-3 z-50">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-xs font-bold text-slate-900">Meeting Push Alerts</div>
                  <div className="text-[11px] text-slate-500">
                    Alerts you 5 minutes before calendar meetings start.
                  </div>
                </div>
                <span
                  className={`px-2 py-0.5 rounded-md text-[10px] font-semibold shrink-0 ${
                    notifPermission === 'granted'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : notifPermission === 'denied'
                        ? 'bg-rose-50 text-rose-700 border border-rose-200'
                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                  }`}
                >
                  {notifPermission === 'granted'
                    ? 'Push Ready'
                    : notifPermission === 'denied'
                      ? 'Blocked'
                      : notifPermission === 'unsupported'
                        ? 'In-App'
                        : 'Allow Push'}
                </span>
              </div>

              <div className="space-y-1.5 pt-1 border-t border-slate-100">
                <button
                  type="button"
                  onClick={toggleRemindersEnabled}
                  className="w-full min-h-[38px] py-1.5 px-2 rounded-lg hover:bg-slate-50 flex items-center justify-between text-xs font-medium text-slate-800"
                >
                  <span>5-Min Meeting Reminders</span>
                  <span
                    className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                      remindersEnabled ? 'bg-sky-100 text-sky-700' : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {remindersEnabled ? 'ON' : 'OFF'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={toggleSoundEnabled}
                  className="w-full min-h-[38px] py-1.5 px-2 rounded-lg hover:bg-slate-50 flex items-center justify-between text-xs font-medium text-slate-800"
                >
                  <span className="flex items-center gap-1.5">
                    {soundEnabled ? (
                      <Volume2 className="w-3.5 h-3.5 text-sky-600" />
                    ) : (
                      <VolumeX className="w-3.5 h-3.5 text-slate-400" />
                    )}
                    <span>Alert Chime Sound</span>
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                      soundEnabled ? 'bg-sky-100 text-sky-700' : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {soundEnabled ? 'ON' : 'OFF'}
                  </span>
                </button>
              </div>

              <div className="flex flex-col gap-1.5 pt-1 border-t border-slate-100">
                {notifPermission === 'default' && (
                  <button
                    type="button"
                    onClick={() => requestNotificationPermission()}
                    className="w-full min-h-[40px] px-3 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Bell className="w-3.5 h-3.5" />
                    <span>Enable Browser Push Alerts</span>
                  </button>
                )}

                {notifPermission === 'denied' && (
                  <p className="text-[11px] text-rose-600 leading-snug">
                    Browser notifications are blocked in site settings; in-app 5-minute alert banners and sound chimes remain active.
                  </p>
                )}

                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setNotifMenuOpen(false);
                      sendTestReminder();
                    }}
                    className="min-h-[38px] px-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-[11px] font-semibold"
                  >
                    Test Alert
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNotifMenuOpen(false);
                      setActiveTab('calendar');
                    }}
                    className="min-h-[38px] px-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-semibold"
                  >
                    Open Calendar
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* User Avatar + Status Menu */}
        <div className="relative" ref={menuRef}>
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/*"
            onChange={handlePhotoUpload}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => {
              setNotifMenuOpen(false);
              setAccountMenuOpen((o) => !o);
            }}
            className="min-h-[40px] pl-1 pr-1.5 sm:pl-1.5 sm:pr-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 flex items-center gap-1 sm:gap-1.5 transition-colors whitespace-nowrap shrink-0"
            title={`${displayName} (${statusMeta.label})`}
            aria-label="Open profile and status menu"
          >
            <div className="relative shrink-0">
              {currentProfile?.avatar ? (
                <img
                  src={currentProfile.avatar}
                  alt={displayName}
                  referrerPolicy="no-referrer"
                  className="w-7 h-7 rounded-full object-cover border border-slate-200"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-sky-600 text-white text-[11px] font-bold flex items-center justify-center">
                  {initials}
                </div>
              )}
              <span
                className={`w-2.5 h-2.5 rounded-full border-2 border-white absolute -bottom-0.5 -right-0.5 ${statusMeta.dotClass}`}
              />
            </div>
            <span className="hidden lg:inline max-w-[96px] truncate">{statusMeta.label}</span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {accountMenuOpen && (
            <div className="fixed left-3 right-3 top-14 sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:mt-1.5 sm:w-64 bg-white border border-slate-200 rounded-2xl shadow-lg py-2 z-50 max-h-[calc(100dvh-5rem)] overflow-y-auto">
              <div className="px-3.5 py-2.5 border-b border-slate-100 flex items-center gap-2.5">
                {currentProfile?.avatar ? (
                  <img
                    src={currentProfile.avatar}
                    alt={displayName}
                    referrerPolicy="no-referrer"
                    className="w-9 h-9 rounded-full object-cover border border-slate-200 shrink-0"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-sky-600 text-white text-xs font-bold flex items-center justify-center shrink-0">
                    {initials}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-900 truncate">{displayName}</div>
                  {currentProfile?.username && (
                    <div className="text-[11px] font-semibold text-sky-700 truncate">
                      @{currentProfile.username}
                    </div>
                  )}
                  <div className="text-[11px] text-slate-500 truncate">{firebaseUser?.email}</div>
                </div>
              </div>

              <div className="py-1 border-b border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setAccountMenuOpen(false);
                    openCreateGroupModal();
                  }}
                  className="md:hidden w-full min-h-[40px] px-3.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors"
                >
                  <Users className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                  <span>Create Group</span>
                </button>
                <button
                  type="button"
                  disabled={uploadingPhoto}
                  onClick={() => avatarInputRef.current?.click()}
                  className="w-full min-h-[40px] px-3.5 py-2 text-left text-xs font-semibold text-sky-700 hover:bg-sky-50 flex items-center gap-2 transition-colors disabled:opacity-50"
                >
                  <Camera className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {uploadingPhoto
                      ? 'Uploading Photo...'
                      : currentProfile?.avatar
                        ? 'Change Profile Image'
                        : 'Add Profile Image'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAccountMenuOpen(false);
                    setActiveTab('account');
                  }}
                  className="w-full min-h-[40px] px-3.5 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors"
                >
                  <User className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  <span>Account &amp; Profile Settings</span>
                </button>
              </div>

              <div className="py-1 border-b border-slate-100">
                <div className="px-3.5 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
                  Set Status
                </div>
                {statusOptions.map((opt) => {
                  const meta = STATUS_META[opt.value];
                  const active = myStatus === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        setAccountMenuOpen(false);
                        updateMyProfile({ status: opt.value });
                      }}
                      className={`w-full min-h-[40px] px-3.5 py-1.5 text-left flex items-start gap-2.5 hover:bg-slate-50 transition-colors ${
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

              <div className="pt-1">
                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={loggingOut}
                  className="w-full min-h-[42px] px-3.5 py-2 text-left text-xs font-semibold text-rose-600 hover:bg-rose-50 flex items-center gap-2 transition-colors disabled:opacity-50"
                >
                  <LogOut className="w-3.5 h-3.5 shrink-0" />
                  <span>{loggingOut ? 'Logging out...' : 'Log Out'}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Direct Logout Button (always 1-tap visible inside viewport on mobile & desktop) */}
        <button
          type="button"
          onClick={handleLogout}
          disabled={loggingOut}
          className="min-h-[40px] px-2.5 sm:px-3 rounded-xl border border-rose-200 md:border-slate-200 bg-rose-50/70 md:bg-white hover:bg-rose-50 hover:border-rose-300 hover:text-rose-700 text-rose-700 md:text-slate-700 text-[11px] sm:text-xs font-semibold flex items-center justify-center gap-1 sm:gap-1.5 transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
          title="Log Out"
          aria-label="Log Out"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          <span className="hidden min-[380px]:inline md:hidden">Logout</span>
          <span className="hidden lg:inline">{loggingOut ? 'Logging out...' : 'Log Out'}</span>
        </button>
      </div>
    </header>
  );
};
