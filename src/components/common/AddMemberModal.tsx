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
  AlertTriangle,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { TeamInvite } from '../../types';
import { UserStatusBadge } from './UserStatusBadge';
import {
  STATUS_META,
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
    teamInvites,
    inviteTeamMember,
    addContact,
    addContactsAndStartChat,
    startDirectChat,
    presenceNow,
  } = useApp();

  const [tab, setTab] = useState<'available' | 'invite'>(initialTab);
  const [participantSearch, setParticipantSearch] = useState('');
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
      setSelectedUids([]);
      setError(null);
    }
  }, [isOpen, initialTab]);

  if (!isOpen) return null;

  // Strictly track ONLY contacts the user explicitly added to their app
  const addedUidSet = new Set<string>(contacts.map((c) => c.uid));

  const otherUsers = sortUsersByPresence(
    teamUsers.filter((u) => u.uid !== firebaseUser?.uid),
    firebaseUser?.uid,
    presenceNow
  );

  const hasAddedOrInvited =
    contacts.length > 0 ||
    teamInvites.some((inv) => inv.invitedByUid === firebaseUser?.uid);
  const mustAddBeforeEntering =
    welcomeMode && !hasAddedOrInvited && otherUsers.length > 0;

  const cleanSearch = participantSearch.trim().toLowerCase().replace(/^@+/, '');
  const hasActiveSearch = cleanSearch.length >= 2;

  const addedUsersList = otherUsers.filter((u) => addedUidSet.has(u.uid));

  const searchMatches = hasActiveSearch
    ? otherUsers.filter((u) => {
        const uname = (u.username || '').toLowerCase();
        const dname = u.displayName.toLowerCase();
        const ttl = (u.title || '').toLowerCase();
        const dept = (u.department || '').toLowerCase();
        return (
          uname.includes(cleanSearch) ||
          dname.includes(cleanSearch) ||
          ttl.includes(cleanSearch) ||
          dept.includes(cleanSearch)
        );
      })
    : addedUsersList;

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
    if (mustAddBeforeEntering) {
      setError('Please add at least 1 user or invite a team member before entering your workspace.');
      return;
    }
    resetForm();
    onClose();
  };

  const toggleSelectUid = (uid: string) => {
    setSelectedUids((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    );
  };

  const handleAddOnly = async (uid: string) => {
    setError(null);
    setAddingSelected(true);
    try {
      await addContact(uid);
      setSelectedUids((prev) => prev.filter((id) => id !== uid));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add user.');
    } finally {
      setAddingSelected(false);
    }
  };

  const handleAddSingleAndChat = async (uid: string) => {
    setError(null);
    setAddingSelected(true);
    try {
      await addContactsAndStartChat([uid]);
      onStartedChat?.();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add user.');
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
      setError(err instanceof Error ? err.message : 'Could not add users.');
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
                  ? 'First-Login Setup: Add Team Members'
                  : 'Find & Add Users'}
              </h3>
              <p className="text-[11px] text-slate-500 truncate">
                {welcomeMode
                  ? 'Manually search and add users or invite a teammate to get started.'
                  : 'Search by @username or full name to add users and see their live status.'}
              </p>
            </div>
          </div>
          {!mustAddBeforeEntering && (
            <button
              type="button"
              onClick={handleClose}
              className="min-h-[36px] min-w-[36px] flex items-center justify-center text-slate-400 hover:text-slate-700 shrink-0"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          )}
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
              <Search className="w-3.5 h-3.5 text-sky-600" />
              <span>Find by @username ({addedUsersList.length} added)</span>
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
              <span>Invite New Member</span>
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

              {welcomeMode && !hasAddedOrInvited && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>
                    {otherUsers.length > 0
                      ? 'First-time login requires adding at least 1 user or sending a team invite manually. Type a @username or name below to add teammates.'
                      : 'No other users have signed up yet. Send an invite by email or continue to set up your workspace.'}
                  </span>
                </div>
              )}

              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  value={participantSearch}
                  onChange={(e) => setParticipantSearch(e.target.value)}
                  placeholder="Enter @username or full name (min 2 chars)..."
                  className="w-full min-h-[42px] bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-sky-600 focus:bg-white"
                />
              </div>

              {!hasActiveSearch && addedUsersList.length === 0 ? (
                <div className="p-6 border border-dashed border-slate-200 rounded-xl text-center space-y-3">
                  <Users className="w-8 h-8 text-slate-300 mx-auto" />
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-slate-800">
                      Search to add users to your app
                    </p>
                    <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                      Other users stay hidden until you add them. Type at least 2 characters of a user&apos;s <span className="font-semibold text-slate-700">@username</span> or name above, or invite someone new by email.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTab('invite')}
                    className="min-h-[40px] px-4 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold inline-flex items-center gap-1.5"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>Invite Member by Email</span>
                  </button>
                </div>
              ) : searchMatches.length === 0 ? (
                <div className="p-6 text-center space-y-2 border border-dashed border-slate-200 rounded-xl">
                  <p className="text-xs font-semibold text-slate-700">
                    No users match &ldquo;{participantSearch}&rdquo;.
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Check their @username spelling or invite them by email so they can join SphereCall.
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <div className="text-[11px] font-semibold text-slate-500 px-1">
                    {hasActiveSearch
                      ? `Search Results (${searchMatches.length})`
                      : `Your Added Users (${addedUsersList.length})`}
                  </div>
                  <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-72 overflow-y-auto">
                    {searchMatches.map((member) => {
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
                              {isAdded && (
                                <span
                                  className={`w-2.5 h-2.5 rounded-full border-2 border-white absolute bottom-0 right-0 ${meta.dotClass}`}
                                  title={meta.label}
                                />
                              )}
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-semibold text-slate-900 truncate flex items-center gap-1.5">
                                <span className="truncate">{member.displayName}</span>
                                {member.username && (
                                  <span className="text-[11px] font-mono text-sky-700 shrink-0">
                                    @{member.username}
                                  </span>
                                )}
                                {isAdded && (
                                  <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded shrink-0">
                                    Added
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-500 truncate flex items-center gap-1.5 mt-0.5">
                                {isAdded ? (
                                  <UserStatusBadge status={effectiveStatus} compact />
                                ) : (
                                  <span>Click Add to save to your contacts</span>
                                )}
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
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                disabled={addingSelected}
                                onClick={() => handleAddOnly(member.uid)}
                                className="min-h-[34px] px-2.5 rounded-lg border border-sky-200 bg-sky-50 hover:bg-sky-100 disabled:opacity-60 text-sky-700 text-xs font-semibold flex items-center gap-1 shrink-0"
                              >
                                <UserPlus className="w-3.5 h-3.5" />
                                <span>Add</span>
                              </button>
                              <button
                                type="button"
                                disabled={addingSelected}
                                onClick={() => handleAddSingleAndChat(member.uid)}
                                className="min-h-[34px] px-2.5 rounded-lg bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white text-xs font-semibold flex items-center gap-1 shrink-0"
                              >
                                <MessageSquare className="w-3.5 h-3.5" />
                                <span>Chat</span>
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-2.5 shrink-0">
              {mustAddBeforeEntering ? (
                <span className="text-[11px] font-semibold text-amber-700">
                  Add 1+ user or invite a member to continue
                </span>
              ) : (
                <button
                  type="button"
                  onClick={handleClose}
                  className={`min-h-[40px] px-4 rounded-xl text-xs font-semibold ${
                    welcomeMode && hasAddedOrInvited
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      : 'border border-slate-200 bg-white hover:bg-slate-100 text-slate-700'
                  }`}
                >
                  {welcomeMode
                    ? addedUsersList.length > 0
                      ? `Continue to Workspace (${addedUsersList.length} added)`
                      : 'Continue to Workspace'
                    : 'Close'}
                </button>
              )}

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
                      : `Add (${selectedUids.length}) & Chat`}
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setTab('invite')}
                  className="min-h-[40px] px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center gap-1.5"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Invite by Email</span>
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
                  Share the workspace link below. Once they register with{' '}
                  <span className="font-semibold">{createdInvite.email}</span>, search their name or @username in Find &amp; Add User to add them to your contacts.
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
                + Invite another member
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
                <span>{submitting ? 'Adding...' : 'Send Invite'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
