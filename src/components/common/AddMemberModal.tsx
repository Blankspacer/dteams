import React, { useEffect, useState } from 'react';
import {
  UserPlus,
  Users,
  X,
  Mail,
  User,
  Briefcase,
  Building2,
  Copy,
  Check,
  Send,
  AlertCircle,
  CheckCircle2,
  Search,
  MessageSquare,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { TeamInvite, UserStatus } from '../../types';
import { UserStatusBadge } from './UserStatusBadge';
import {
  STATUS_META,
  countUsersByPresence,
  getEffectiveUserStatus,
  sortUsersByPresence,
} from '../../utils/presence';

interface AddMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'available' | 'invite';
  welcomeMode?: boolean;
  onStartedChat?: () => void;
}

export const AddMemberModal: React.FC<AddMemberModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'available',
  welcomeMode = false,
  onStartedChat,
}) => {
  const {
    firebaseUser,
    currentProfile,
    teamUsers,
    contacts,
    conversations,
    inviteTeamMember,
    addContactsAndStartChat,
    startDirectChat,
    presenceNow,
  } = useApp();

  const [tab, setTab] = useState<'available' | 'invite'>(initialTab);
  const [participantSearch, setParticipantSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | UserStatus>('all');
  const [selectedUids, setSelectedUids] = useState<string[]>([]);
  const [addingSelected, setAddingSelected] = useState(false);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [title, setTitle] = useState('');
  const [department, setDepartment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdInvite, setCreatedInvite] = useState<TeamInvite | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setTab(initialTab);
      setParticipantSearch('');
      setStatusFilter('all');
      setSelectedUids([]);
      setError(null);
    }
  }, [isOpen, initialTab]);

  if (!isOpen) return null;

  const addedUidSet = new Set<string>([
    ...contacts.map((c) => c.uid),
    ...conversations
      .filter((c) => c.type === 'direct')
      .flatMap((c) => c.participantIds),
  ]);

  const otherUsers = sortUsersByPresence(
    teamUsers.filter((u) => u.uid !== firebaseUser?.uid),
    firebaseUser?.uid,
    presenceNow
  );
  const presenceCounts = countUsersByPresence(otherUsers, firebaseUser?.uid, presenceNow);
  const filteredUsers = otherUsers.filter((u) => {
    const matchesSearch =
      u.displayName.toLowerCase().includes(participantSearch.toLowerCase()) ||
      (u.title || '').toLowerCase().includes(participantSearch.toLowerCase()) ||
      (u.department || '').toLowerCase().includes(participantSearch.toLowerCase());
    const matchesStatus =
      statusFilter === 'all' ||
      getEffectiveUserStatus(u, firebaseUser?.uid, presenceNow) === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const resetForm = () => {
    setName('');
    setEmail('');
    setTitle('');
    setDepartment('');
    setError(null);
    setCreatedInvite(null);
    setCopied(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const toggleSelectUid = (uid: string) => {
    setSelectedUids((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    );
  };

  const handleAddSingleAndChat = async (uid: string) => {
    setError(null);
    setAddingSelected(true);
    try {
      await addContactsAndStartChat([uid]);
      onStartedChat?.();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add participant.');
    } finally {
      setAddingSelected(false);
    }
  };

  const handleOpenExistingChat = async (uid: string) => {
    setError(null);
    setAddingSelected(true);
    try {
      await startDirectChat(uid);
      onStartedChat?.();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open chat.');
    } finally {
      setAddingSelected(false);
    }
  };

  const handleAddSelectedAndChat = async () => {
    if (selectedUids.length === 0 || addingSelected) return;
    setError(null);
    setAddingSelected(true);
    try {
      await addContactsAndStartChat(selectedUids);
      onStartedChat?.();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add participants.');
    } finally {
      setAddingSelected(false);
    }
  };

  const handleSubmitInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Please enter the team member name.');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await inviteTeamMember({
        name,
        email,
        title,
        department,
      });
      if (result) {
        setCreatedInvite(result);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add team member.');
    } finally {
      setSubmitting(false);
    }
  };

  const appUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const mobileDownloadUrl = appUrl ? `${appUrl}/download` : '/download';

  const handleCopyInvite = () => {
    const inviteText = createdInvite
      ? `Hi ${createdInvite.name}, download SphereCall and join our team workspace here: ${mobileDownloadUrl} (sign in with ${createdInvite.email})`
      : mobileDownloadUrl;
    navigator.clipboard.writeText(inviteText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const mailtoHref = createdInvite
    ? `mailto:${encodeURIComponent(createdInvite.email)}?subject=${encodeURIComponent(
        `${currentProfile?.displayName || 'Your teammate'} invited you to SphereCall`
      )}&body=${encodeURIComponent(
        `Hi ${createdInvite.name},\n\nYou've been added to our team workspace on SphereCall.\n\nDownload & install the app or open it in your browser:\n${mobileDownloadUrl}\n\nSign in with Gmail or register with ${createdInvite.email} to chat, call, and share files.\n`
      )}`
    : '#';

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center shrink-0">
              {tab === 'available' ? (
                <Users className="w-4 h-4" />
              ) : (
                <UserPlus className="w-4 h-4" />
              )}
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-slate-900 truncate">
                {welcomeMode
                  ? 'Welcome! Choose People to Chat With'
                  : 'Add Participants & Members'}
              </h3>
              {welcomeMode && (
                <p className="text-[11px] text-slate-500 truncate">
                  Add available SphereCall users below or invite a new member by email.
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="min-h-[36px] min-w-[36px] flex items-center justify-center text-slate-400 hover:text-slate-700 shrink-0"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="px-6 pt-3 pb-2 border-b border-slate-100 bg-slate-50/70 shrink-0">
          <div className="grid grid-cols-2 gap-1.5 bg-slate-200/70 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => {
                setError(null);
                setTab('available');
              }}
              className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                tab === 'available'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Users className="w-3.5 h-3.5 text-sky-600" />
              <span>Available ({otherUsers.length})</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setTab('invite');
              }}
              className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                tab === 'invite'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5 text-sky-600" />
              <span>Add Member (Email)</span>
            </button>
          </div>
        </div>

        {/* Body */}
        {tab === 'available' ? (
          <>
            <div className="p-5 sm:p-6 space-y-3.5 overflow-y-auto flex-1">
              {error && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  value={participantSearch}
                  onChange={(e) => setParticipantSearch(e.target.value)}
                  placeholder="Search people using SphereCall..."
                  className="w-full min-h-[40px] bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-sky-600 focus:bg-white"
                />
              </div>

              {otherUsers.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {(['online', 'busy', 'away', 'offline'] as UserStatus[]).map((st) => {
                    const meta = STATUS_META[st];
                    const active = statusFilter === st;
                    return (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setStatusFilter((prev) => (prev === st ? 'all' : st))}
                        className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold flex items-center gap-1.5 transition-colors ${
                          active
                            ? `${meta.badgeClass} ring-1 ring-inset ring-current/25`
                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full ${meta.dotClass}`} />
                        <span>{meta.label}</span>
                        <span className="tabular-nums opacity-75">{presenceCounts[st]}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {otherUsers.length === 0 ? (
                <div className="p-6 border border-dashed border-slate-200 rounded-xl text-center space-y-3">
                  <Users className="w-8 h-8 text-slate-300 mx-auto" />
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-slate-800">
                      No other participants have signed up yet
                    </p>
                    <p className="text-xs text-slate-500">
                      Invite your teammates by email so they appear here for instant chat and calls.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTab('invite')}
                    className="min-h-[40px] px-4 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold inline-flex items-center gap-1.5"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>Add Member by Email</span>
                  </button>
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">
                  No participants match &ldquo;{participantSearch}&rdquo;.
                </div>
              ) : (
                <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-72 overflow-y-auto">
                  {filteredUsers.map((member) => {
                    const isAdded = addedUidSet.has(member.uid);
                    const isSelected = selectedUids.includes(member.uid);
                    const effectiveStatus = getEffectiveUserStatus(
                      member,
                      firebaseUser?.uid,
                      presenceNow
                    );
                    const meta = STATUS_META[effectiveStatus];

                    return (
                      <div
                        key={member.uid}
                        className={`px-3.5 py-2.5 flex items-center justify-between gap-2.5 transition-colors ${
                          isSelected ? 'bg-sky-50/70' : 'hover:bg-slate-50'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            isAdded ? handleOpenExistingChat(member.uid) : toggleSelectUid(member.uid)
                          }
                          className="flex-1 min-w-0 flex items-center gap-3 text-left"
                        >
                          {!isAdded && (
                            <div
                              className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                                isSelected
                                  ? 'bg-sky-600 border-sky-600 text-white'
                                  : 'border-slate-300 bg-white'
                              }`}
                            >
                              {isSelected && <Check className="w-3.5 h-3.5" />}
                            </div>
                          )}

                          <div className="relative shrink-0">
                            {member.avatar ? (
                              <img
                                src={member.avatar}
                                alt={member.displayName}
                                referrerPolicy="no-referrer"
                                className="w-9 h-9 rounded-full object-cover border border-slate-200"
                              />
                            ) : (
                              <div className="w-9 h-9 rounded-full bg-slate-200 text-slate-700 text-xs font-semibold flex items-center justify-center">
                                {member.displayName.slice(0, 2).toUpperCase()}
                              </div>
                            )}
                            <span
                              className={`w-2.5 h-2.5 rounded-full border-2 border-white absolute bottom-0 right-0 ${meta.dotClass}`}
                              title={meta.label}
                            />
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-semibold text-slate-900 truncate flex items-center gap-1.5">
                              <span className="truncate">{member.displayName}</span>
                              {isAdded && (
                                <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded shrink-0">
                                  Added
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 truncate flex items-center gap-1.5 mt-0.5">
                              <UserStatusBadge status={effectiveStatus} compact />
                              {(member.title || member.department) && (
                                <span className="truncate">
                                  · {[member.title, member.department].filter(Boolean).join(' · ')}
                                </span>
                              )}
                            </div>
                          </div>
                        </button>

                        {isAdded ? (
                          <button
                            type="button"
                            disabled={addingSelected}
                            onClick={() => handleOpenExistingChat(member.uid)}
                            className="min-h-[34px] px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold flex items-center gap-1.5 shrink-0"
                          >
                            <MessageSquare className="w-3.5 h-3.5 text-sky-600" />
                            <span>Chat</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={addingSelected}
                            onClick={() => handleAddSingleAndChat(member.uid)}
                            className="min-h-[34px] px-3 rounded-lg bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white text-xs font-semibold flex items-center gap-1 shrink-0"
                          >
                            <UserPlus className="w-3.5 h-3.5" />
                            <span>Add &amp; Chat</span>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-2.5 shrink-0">
              <button
                type="button"
                onClick={handleClose}
                className="min-h-[40px] px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold"
              >
                {welcomeMode ? 'Skip to #general' : 'Close'}
              </button>

              {selectedUids.length > 0 ? (
                <button
                  type="button"
                  disabled={addingSelected}
                  onClick={handleAddSelectedAndChat}
                  className="min-h-[40px] px-4 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white text-xs font-semibold flex items-center gap-1.5"
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>
                    {addingSelected
                      ? 'Adding...'
                      : `Add (${selectedUids.length}) & Start Chatting`}
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setTab('invite')}
                  className="min-h-[40px] px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center gap-1.5"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Or Add Member</span>
                </button>
              )}
            </div>
          </>
        ) : createdInvite ? (
          <div className="p-6 space-y-5 overflow-y-auto">
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="text-sm font-bold text-emerald-950">
                  {createdInvite.name} added to invites
                </div>
                <p className="text-xs text-emerald-800 leading-relaxed">
                  Share the workspace link below. As soon as they sign in with{' '}
                  <span className="font-semibold">{createdInvite.email}</span>, they will appear in the live participants list for chat and calls.
                </p>
              </div>
            </div>

            <div className="space-y-2.5">
              <button
                type="button"
                onClick={handleCopyInvite}
                className="w-full min-h-[44px] px-4 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copied ? 'Invite Message Copied' : 'Copy Invite Link'}</span>
              </button>

              <a
                href={mailtoHref}
                className="w-full min-h-[44px] px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
              >
                <Send className="w-4 h-4 text-sky-600" />
                <span>Send Email Invite</span>
              </a>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={resetForm}
                className="min-h-[40px] px-3 text-xs font-semibold text-sky-600 hover:text-sky-700"
              >
                + Add another member
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="min-h-[40px] px-4 rounded-xl bg-slate-900 text-white text-xs font-semibold"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmitInvite} className="p-6 space-y-4 overflow-y-auto">
            <p className="text-xs text-slate-500">
              Someone not in the Available list yet? Add them by email and send a direct invite to join and chat.
            </p>

            {error && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Full Name
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                <input
                  type="text"
                  required
                  maxLength={80}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Sarah Jenkins"
                  className="w-full min-h-[44px] bg-slate-50 border border-slate-300 rounded-xl pl-10 pr-3.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-sky-600 focus:bg-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Work Email / Gmail
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                <input
                  type="email"
                  required
                  maxLength={160}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="sarah@company.com"
                  className="w-full min-h-[44px] bg-slate-50 border border-slate-300 rounded-xl pl-10 pr-3.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-sky-600 focus:bg-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Job Title (optional)
                </label>
                <div className="relative">
                  <Briefcase className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
                  <input
                    type="text"
                    maxLength={80}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Designer"
                    className="w-full min-h-[44px] bg-slate-50 border border-slate-300 rounded-xl pl-9 pr-3 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-sky-600 focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Department (optional)
                </label>
                <div className="relative">
                  <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
                  <input
                    type="text"
                    maxLength={50}
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    placeholder="Product"
                    className="w-full min-h-[44px] bg-slate-50 border border-slate-300 rounded-xl pl-9 pr-3 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-sky-600 focus:bg-white"
                  />
                </div>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={handleClose}
                className="min-h-[42px] px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="min-h-[42px] px-5 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white text-xs font-semibold flex items-center gap-1.5"
              >
                <UserPlus className="w-4 h-4" />
                <span>{submitting ? 'Adding...' : 'Add Member'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
