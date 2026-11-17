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
  Phone,
  Video,
  Loader2,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useEmailSearchMatch } from '../../hooks/useEmailSearchMatch';
import { TeamInvite } from '../../types';
import { UserStatusBadge } from './UserStatusBadge';
import {
  STATUS_META,
  getEffectiveUserStatus,
  sortUsersByPresence,
} from '../../utils/presence';
import { matchesUserSearch } from '../../utils/userLookup';

interface AddMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'available' | 'invite';
  onStartedChat?: () => void;
}

export const AddMemberModal: React.FC<AddMemberModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'available',
  onStartedChat,
}) => {
  const {
    firebaseUser,
    currentProfile,
    teamUsers,
    addContact,
    isAddedMember,
    inviteTeamMember,
    startDirectChat,
    startVideoCall,
    openCreateGroupModal,
    presenceNow,
  } = useApp();

  const [tab, setTab] = useState<'available' | 'invite'>(initialTab);
  const [participantSearch, setParticipantSearch] = useState('');
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const { matchedEmailUser, searchingEmail, searchedEmail } = useEmailSearchMatch(participantSearch);

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
      setError(null);
    }
  }, [isOpen, initialTab]);

  if (!isOpen) return null;

  const otherUsers = sortUsersByPresence(
    teamUsers.filter((u) => u.uid !== firebaseUser?.uid),
    firebaseUser?.uid,
    presenceNow
  );

  const filteredUsers = otherUsers.filter((u) =>
    matchesUserSearch(u, participantSearch, matchedEmailUser?.uid)
  );

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

  const handleAddMember = async (uid: string) => {
    setError(null);
    setBusyUid(uid);
    try {
      await addContact(uid);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add member.');
    } finally {
      setBusyUid(null);
    }
  };

  const handleOpenChat = async (uid: string) => {
    if (!isAddedMember(uid)) {
      setError('Please add this user as a member first before sending messages.');
      return;
    }
    setError(null);
    setBusyUid(uid);
    try {
      await startDirectChat(uid);
      onStartedChat?.();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open chat.');
    } finally {
      setBusyUid(null);
    }
  };

  const handleStartCall = async (uid: string, displayName: string, mode: 'voice' | 'video') => {
    if (!firebaseUser) return;
    if (!isAddedMember(uid)) {
      setError('Please add this user as a member first before calling or video calling them.');
      return;
    }
    setError(null);
    setBusyUid(uid);
    try {
      await startVideoCall(
        mode === 'voice' ? `Voice Call with ${displayName}` : `Call with ${displayName}`,
        [firebaseUser.uid, uid],
        mode
      );
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start call.');
    } finally {
      setBusyUid(null);
    }
  };

  const handleSubmitInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Please enter the person’s name.');
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
      setError(err instanceof Error ? err.message : 'Could not send invite.');
    } finally {
      setSubmitting(false);
    }
  };

  const appUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const mobileDownloadUrl = appUrl ? `${appUrl}/download` : '/download';

  const handleCopyInvite = () => {
    const inviteText = createdInvite
      ? `Hi ${createdInvite.name}, join me on SphereCall here: ${mobileDownloadUrl} (sign in with ${createdInvite.email})`
      : mobileDownloadUrl;
    navigator.clipboard.writeText(inviteText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const mailtoHref = createdInvite
    ? `mailto:${encodeURIComponent(createdInvite.email)}?subject=${encodeURIComponent(
        `${currentProfile?.displayName || 'Someone'} invited you to SphereCall`
      )}&body=${encodeURIComponent(
        `Hi ${createdInvite.name},\n\nJoin SphereCall to chat, voice call, video call, and schedule meetings together.\n\nOpen or install the app:\n${mobileDownloadUrl}\n\nSign in with Gmail or your ${createdInvite.email} account.\n`
      )}`
    : '#';

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg max-h-[90dvh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 sm:px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-3 shrink-0">
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
                People &amp; Invites
              </h3>
              <p className="text-[11px] text-slate-500 truncate">
                See all SphereCall users. Add someone as a member to message or call them.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-400 hover:text-slate-700 shrink-0"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="px-4 sm:px-6 pt-3 pb-2 border-b border-slate-100 bg-slate-50/70 shrink-0">
          <div className="grid grid-cols-2 gap-1.5 bg-slate-200/70 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => {
                setError(null);
                setTab('available');
              }}
              className={`min-h-[38px] px-2.5 sm:px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                tab === 'available'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Users className="w-3.5 h-3.5 text-sky-600 shrink-0" />
              <span className="sm:hidden truncate">Users ({otherUsers.length})</span>
              <span className="hidden sm:inline truncate">Platform Users ({otherUsers.length})</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setTab('invite');
              }}
              className={`min-h-[38px] px-2.5 sm:px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                tab === 'invite'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5 text-sky-600 shrink-0" />
              <span className="truncate">Invite by Email</span>
            </button>
          </div>
        </div>

        {/* Body */}
        {tab === 'available' ? (
          <>
            <div className="p-4 sm:p-6 space-y-3.5 overflow-y-auto flex-1">
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
                  placeholder="Find by name, @username, or @email..."
                  className="w-full min-h-[42px] bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-9 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-sky-600 focus:bg-white"
                />
                {searchingEmail && (
                  <Loader2 className="w-4 h-4 text-sky-600 animate-spin absolute right-3 top-3" />
                )}
              </div>

              {otherUsers.length === 0 ? (
                <div className="p-6 border border-dashed border-slate-200 rounded-xl text-center space-y-3">
                  <Users className="w-8 h-8 text-slate-300 mx-auto" />
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-slate-800">
                      No other users have joined yet
                    </p>
                    <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                      Invite friends or teammates by email so they appear here automatically once they sign in.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTab('invite')}
                    className="min-h-[40px] px-4 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold inline-flex items-center gap-1.5"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>Invite by Email</span>
                  </button>
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="p-6 text-center space-y-2.5 border border-dashed border-slate-200 rounded-xl">
                  <p className="text-xs font-semibold text-slate-700">
                    {searchingEmail
                      ? `Searching for ${searchedEmail || participantSearch}...`
                      : searchedEmail
                      ? `No registered user found for ${searchedEmail}.`
                      : `No users match "${participantSearch}".`}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Try another name, @username, or @email — or invite them to join SphereCall.
                  </p>
                  {searchedEmail && !searchingEmail && (
                    <button
                      type="button"
                      onClick={() => {
                        setEmail(searchedEmail);
                        setTab('invite');
                      }}
                      className="min-h-[36px] px-3.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold inline-flex items-center gap-1.5"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>Invite {searchedEmail}</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-1.5">
                  <div className="text-[11px] font-semibold text-slate-500 px-1 flex items-center justify-between gap-2">
                    <span>
                      Showing {filteredUsers.length} {filteredUsers.length === 1 ? 'user' : 'users'}
                    </span>
                    {matchedEmailUser && (
                      <span className="text-emerald-700 font-semibold">
                        Found by email: {matchedEmailUser.displayName}
                      </span>
                    )}
                  </div>
                  <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-72 overflow-y-auto">
                    {filteredUsers.map((member) => {
                      const effectiveStatus = getEffectiveUserStatus(
                        member,
                        firebaseUser?.uid,
                        presenceNow
                      );
                      const meta = STATUS_META[effectiveStatus];
                      const isBusy = busyUid === member.uid;
                      const isMember = isAddedMember(member.uid);

                      return (
                        <div
                          key={member.uid}
                          className="px-3.5 py-2.5 flex items-center justify-between gap-2.5 hover:bg-slate-50 transition-colors"
                        >
                          <div
                            onClick={() => {
                              if (isMember && !isBusy) {
                                handleOpenChat(member.uid);
                              }
                            }}
                            className={`flex-1 min-w-0 flex items-center gap-3 text-left ${
                              isMember ? 'cursor-pointer' : ''
                            }`}
                          >
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
                                {member.username && (
                                  <span className="text-[11px] font-mono text-sky-700 shrink-0">
                                    @{member.username}
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
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {isMember ? (
                              <>
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => handleStartCall(member.uid, member.displayName, 'voice')}
                                  className="min-h-[34px] min-w-[34px] rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 flex items-center justify-center"
                                  title={`Voice call ${member.displayName}`}
                                  aria-label={`Voice call ${member.displayName}`}
                                >
                                  <Phone className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => handleStartCall(member.uid, member.displayName, 'video')}
                                  className="min-h-[34px] min-w-[34px] rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-700 flex items-center justify-center"
                                  title={`Video call ${member.displayName}`}
                                  aria-label={`Video call ${member.displayName}`}
                                >
                                  <Video className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => handleOpenChat(member.uid)}
                                  className="min-h-[34px] px-2.5 rounded-lg bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white text-xs font-semibold flex items-center gap-1"
                                >
                                  <MessageSquare className="w-3.5 h-3.5" />
                                  <span>Chat</span>
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  disabled
                                  title="Add as member first to call"
                                  aria-label="Add as member first to call"
                                  className="min-h-[34px] min-w-[34px] rounded-lg bg-slate-100 text-slate-400 hidden sm:flex items-center justify-center cursor-not-allowed"
                                >
                                  <Phone className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  disabled
                                  title="Add as member first to video call"
                                  aria-label="Add as member first to video call"
                                  className="min-h-[34px] min-w-[34px] rounded-lg bg-slate-100 text-slate-400 hidden sm:flex items-center justify-center cursor-not-allowed"
                                >
                                  <Video className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => handleAddMember(member.uid)}
                                  className="min-h-[36px] sm:min-h-[34px] px-2.5 rounded-lg bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white text-xs font-semibold flex items-center gap-1"
                                >
                                  {isBusy ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <UserPlus className="w-3.5 h-3.5" />
                                  )}
                                  <span>Add Member</span>
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="px-4 sm:px-6 py-4 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
              <button
                type="button"
                onClick={handleClose}
                className="min-h-[40px] px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold"
              >
                Close
              </button>

              <div className="flex flex-wrap items-center gap-2 ml-auto">
                <button
                  type="button"
                  onClick={() => {
                    handleClose();
                    openCreateGroupModal();
                  }}
                  className="min-h-[40px] px-3 sm:px-3.5 rounded-xl border border-sky-200 bg-sky-50 hover:bg-sky-100 text-sky-800 text-xs font-semibold flex items-center gap-1.5"
                >
                  <Users className="w-4 h-4 text-sky-600" />
                  <span>Create Group</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTab('invite')}
                  className="min-h-[40px] px-3.5 sm:px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center gap-1.5"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Invite</span>
                </button>
              </div>
            </div>
          </>
        ) : createdInvite ? (
          <div className="p-4 sm:p-6 space-y-5 overflow-y-auto">
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="text-sm font-bold text-emerald-950">
                  {createdInvite.name} added to invites
                </div>
                <p className="text-xs text-emerald-800 leading-relaxed">
                  Share the workspace link below. As soon as they sign in with{' '}
                  <span className="font-semibold">{createdInvite.email}</span>, they will appear automatically in your people list.
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
                + Invite another person
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
          <form onSubmit={handleSubmitInvite} className="p-4 sm:p-6 space-y-4 overflow-y-auto">
            <p className="text-xs text-slate-500">
              Someone not registered on SphereCall yet? Send them an invite to join.
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                <span>{submitting ? 'Sending...' : 'Send Invite'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
