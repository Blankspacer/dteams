import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Check,
  Globe,
  Loader2,
  Lock,
  Plus,
  Search,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useEmailSearchMatch } from '../../hooks/useEmailSearchMatch';
import {
  STATUS_META,
  getEffectiveUserStatus,
  sortUsersByPresence,
} from '../../utils/presence';
import { matchesUserSearch } from '../../utils/userLookup';
import { AddMemberModal } from './AddMemberModal';

export const CreateGroupModal: React.FC = () => {
  const {
    firebaseUser,
    currentProfile,
    teamUsers,
    addContact,
    isAddedMember,
    createChannel,
    createGroupModalOpen,
    closeCreateGroupModal,
    presenceNow,
  } = useApp();

  const [groupName, setGroupName] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [memberSearch, setMemberSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [addingUid, setAddingUid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  const { matchedEmailUser, searchingEmail, searchedEmail } = useEmailSearchMatch(memberSearch);

  useEffect(() => {
    if (createGroupModalOpen) {
      setGroupName('');
      setIsPublic(false);
      setSelectedMemberIds([]);
      setMemberSearch('');
      setError(null);
    }
  }, [createGroupModalOpen]);

  if (!createGroupModalOpen) {
    return (
      <AddMemberModal
        isOpen={inviteOpen}
        onClose={() => setInviteOpen(false)}
        initialTab="invite"
      />
    );
  }

  const platformUsers = sortUsersByPresence(
    teamUsers.filter((u) => u.uid !== firebaseUser?.uid),
    firebaseUser?.uid,
    presenceNow
  );

  const filteredUsers = platformUsers.filter((u) =>
    matchesUserSearch(u, memberSearch, matchedEmailUser?.uid)
  );

  const addedUsers = platformUsers.filter((u) => isAddedMember(u.uid));

  const toggleMember = (uid: string) => {
    if (!isAddedMember(uid)) {
      setError('Please add this user as a member first before selecting them for a group.');
      return;
    }
    setSelectedMemberIds((prev) => {
      if (prev.includes(uid)) {
        return prev.filter((id) => id !== uid);
      }
      if (prev.length >= 49) {
        setError('Groups support up to 50 total members.');
        return prev;
      }
      setError(null);
      return [...prev, uid];
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim() || creating) return;
    setError(null);
    setCreating(true);
    try {
      await createChannel(groupName.trim(), {
        memberIds: selectedMemberIds,
        isPublic,
      });
      closeCreateGroupModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create group.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
        <form
          onSubmit={handleSubmit}
          className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg max-h-[90dvh] flex flex-col overflow-hidden"
        >
          <div className="px-4 sm:px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center shrink-0">
                <Users className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-bold text-slate-900 truncate">Create Group</h3>
                <p className="text-[11px] text-slate-500 truncate">
                  Add people by name, @username, or @email to chat, call, and meet.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={closeCreateGroupModal}
              className="min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-400 hover:text-slate-700 shrink-0"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-4 sm:p-6 space-y-5 overflow-y-auto flex-1">
            {error && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Group Name
              </label>
              <input
                type="text"
                required
                maxLength={100}
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="e.g. Marketing Team, Project Alpha"
                className="w-full min-h-[44px] bg-slate-50 border border-slate-300 rounded-xl px-3.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-sky-600 focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Group Privacy
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsPublic(false)}
                  className={`min-h-[56px] p-3 rounded-xl border text-left transition-colors ${
                    !isPublic
                      ? 'border-sky-600 bg-sky-50 text-sky-950'
                      : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-xs font-bold">
                    <Lock className="w-3.5 h-3.5 text-sky-600" />
                    <span>Private Group</span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Only selected members
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setIsPublic(true)}
                  className={`min-h-[56px] p-3 rounded-xl border text-left transition-colors ${
                    isPublic
                      ? 'border-sky-600 bg-sky-50 text-sky-950'
                      : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-xs font-bold">
                    <Globe className="w-3.5 h-3.5 text-sky-600" />
                    <span>Open Team Group</span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Visible to all users
                  </div>
                </button>
              </div>
            </div>

            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-xs font-semibold text-slate-700">
                  Add Members ({selectedMemberIds.length + 1} selected)
                </label>
                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setInviteOpen(true)}
                    className="text-sky-600 hover:text-sky-700 font-semibold flex items-center gap-1"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>Invite New</span>
                  </button>
                  {addedUsers.length > 0 && (
                    <>
                      <span className="text-slate-300">|</span>
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedMemberIds(addedUsers.slice(0, 49).map((m) => m.uid))
                        }
                        className="text-sky-600 hover:text-sky-700 font-semibold"
                      >
                        Select all
                      </button>
                      <span className="text-slate-300">|</span>
                      <button
                        type="button"
                        onClick={() => setSelectedMemberIds([])}
                        className="text-slate-500 hover:text-slate-700 font-medium"
                      >
                        Clear
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  placeholder="Find by name, @username, or @email..."
                  className="w-full min-h-[40px] bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-9 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-sky-600 focus:bg-white"
                />
                {searchingEmail && (
                  <Loader2 className="w-3.5 h-3.5 text-sky-600 animate-spin absolute right-3 top-3" />
                )}
              </div>

              <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-52 overflow-y-auto">
                {/* Creator (always included) */}
                <div className="px-3 py-2.5 flex items-center justify-between bg-slate-50/70">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-sky-600 text-white text-xs font-bold flex items-center justify-center shrink-0">
                      {(currentProfile?.displayName || 'Y').slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-900 truncate">
                        {currentProfile?.displayName || 'You'} (You)
                      </div>
                      <div className="text-[11px] text-slate-500">Group Creator</div>
                    </div>
                  </div>
                  <span className="text-[11px] font-semibold text-sky-700 shrink-0">
                    Included
                  </span>
                </div>

                {platformUsers.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-500">
                    No other users have signed up yet. Create the group now and add members as they join.
                  </div>
                ) : filteredUsers.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-500 space-y-1.5">
                    <p>
                      {searchingEmail
                        ? 'Searching by email...'
                        : searchedEmail
                        ? `No registered user found for ${searchedEmail}.`
                        : `No users match "${memberSearch}".`}
                    </p>
                    {searchedEmail && !searchingEmail && (
                      <button
                        type="button"
                        onClick={() => setInviteOpen(true)}
                        className="text-sky-600 hover:text-sky-700 font-semibold inline-flex items-center gap-1"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        <span>Invite {searchedEmail} by email</span>
                      </button>
                    )}
                  </div>
                ) : (
                  filteredUsers.map((member) => {
                    const isSelected = selectedMemberIds.includes(member.uid);
                    const memberAdded = isAddedMember(member.uid);
                    const isAdding = addingUid === member.uid;
                    const isEmailMatch = matchedEmailUser?.uid === member.uid;
                    const effectiveStatus = getEffectiveUserStatus(
                      member,
                      firebaseUser?.uid,
                      presenceNow
                    );
                    const meta = STATUS_META[effectiveStatus];
                    return (
                      <div
                        key={member.uid}
                        onClick={() => {
                          if (memberAdded) {
                            toggleMember(member.uid);
                          }
                        }}
                        className={`w-full min-h-[48px] px-3 py-2 flex items-center justify-between gap-3 text-left transition-colors ${
                          isSelected
                            ? 'bg-sky-50/70 cursor-pointer'
                            : memberAdded
                            ? 'hover:bg-slate-50 cursor-pointer'
                            : 'bg-white'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="relative shrink-0">
                            {member.avatar ? (
                              <img
                                src={member.avatar}
                                alt={member.displayName}
                                referrerPolicy="no-referrer"
                                className="w-8 h-8 rounded-full object-cover border border-slate-200"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-700 text-xs font-semibold flex items-center justify-center">
                                {member.displayName.slice(0, 2).toUpperCase()}
                              </div>
                            )}
                            <span
                              className={`w-2.5 h-2.5 rounded-full border-2 border-white absolute bottom-0 right-0 ${meta.dotClass}`}
                              title={meta.label}
                            />
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-slate-900 truncate flex items-center gap-1.5">
                              <span className="truncate">{member.displayName}</span>
                              {isEmailMatch && (
                                <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded shrink-0">
                                  Matched by email
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 truncate flex items-center gap-1.5">
                              {member.username && (
                                <span className="font-medium text-slate-600">@{member.username}</span>
                              )}
                              <span className={`font-semibold ${meta.textClass}`}>
                                {meta.label}
                              </span>
                              {(member.title || member.department) && (
                                <span className="truncate">
                                  · {[member.title, member.department].filter(Boolean).join(' · ')}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {memberAdded ? (
                          <div
                            className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                              isSelected
                                ? 'bg-sky-600 border-sky-600 text-white'
                                : 'border-slate-300 bg-white'
                            }`}
                          >
                            {isSelected && <Check className="w-3.5 h-3.5" />}
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={isAdding}
                            onClick={async (e) => {
                              e.stopPropagation();
                              setAddingUid(member.uid);
                              try {
                                await addContact(member.uid);
                              } finally {
                                setAddingUid(null);
                              }
                            }}
                            className="min-h-[30px] px-2.5 rounded-lg bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white text-[11px] font-semibold flex items-center gap-1 shrink-0"
                          >
                            {isAdding ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <UserPlus className="w-3 h-3" />
                            )}
                            <span>Add Member</span>
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          <div className="px-4 sm:px-6 py-4 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-end gap-2.5 shrink-0">
            <button
              type="button"
              onClick={closeCreateGroupModal}
              className="min-h-[42px] px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating || !groupName.trim()}
              className="min-h-[42px] px-5 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:bg-slate-300 text-white text-xs font-semibold flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>{creating ? 'Creating...' : 'Create Group'}</span>
            </button>
          </div>
        </form>
      </div>

      <AddMemberModal
        isOpen={inviteOpen}
        onClose={() => setInviteOpen(false)}
        initialTab="invite"
      />
    </>
  );
};
