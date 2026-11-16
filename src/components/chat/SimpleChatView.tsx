import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Paperclip,
  Video,
  Lock,
  Plus,
  Search,
  Hash,
  ArrowLeft,
  FileText,
  Download,
  Trash2,
  X,
  ShieldCheck,
  AlertCircle,
  Users,
  UserPlus,
  Check,
  Globe,
  Copy,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { AddMemberModal } from '../common/AddMemberModal';
import { UserStatusBadge } from '../common/UserStatusBadge';
import { generateSafetyNumber } from '../../utils/crypto';
import {
  STATUS_META,
  countUsersByPresence,
  getEffectiveUserStatus,
  sortUsersByPresence,
} from '../../utils/presence';
import { UserStatus } from '../../types';
import { Timestamp } from 'firebase/firestore';

function formatMessageTime(ts: unknown): string {
  if (!ts) return '';
  if (ts instanceof Timestamp) {
    return ts.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (typeof ts === 'object' && ts !== null && 'seconds' in ts) {
    const ms = ((ts as { seconds: number }).seconds || 0) * 1000;
    return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return '';
}

async function compressImageToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image'));
      img.onload = () => {
        const maxDim = 1024;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const ratio = Math.min(maxDim / width, maxDim / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(reader.result as string);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.78));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(file);
  });
}

export const SimpleChatView: React.FC = () => {
  const {
    firebaseUser,
    currentProfile,
    teamUsers,
    contacts,
    teamInvites,
    conversations,
    activeConversationId,
    setActiveConversationId,
    messages,
    sendMessage,
    removeMessage,
    createChannel,
    updateGroupMembers,
    addContactsAndStartChat,
    startDirectChat,
    startVideoCall,
    removeTeamInvite,
    presenceNow,
  } = useApp();

  const [mobileShowThread, setMobileShowThread] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | UserStatus>('all');
  const [textInput, setTextInput] = useState('');
  const [sending, setSending] = useState(false);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [addMemberInitialTab, setAddMemberInitialTab] = useState<'available' | 'invite'>('available');
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null);

  // Add Group Modal State
  const [addGroupOpen, setAddGroupOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupIsPublic, setNewGroupIsPublic] = useState(false);
  const [selectedGroupMemberIds, setSelectedGroupMemberIds] = useState<string[]>([]);
  const [groupMemberSearch, setGroupMemberSearch] = useState('');
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [groupFormError, setGroupFormError] = useState<string | null>(null);

  // Manage Existing Group Members Modal State
  const [membersModalOpen, setMembersModalOpen] = useState(false);
  const [editingMemberIds, setEditingMemberIds] = useState<string[]>([]);
  const [manageMemberSearch, setManageMemberSearch] = useState('');
  const [savingMembers, setSavingMembers] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);

  const [safetyModalOpen, setSafetyModalOpen] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pendingAttachment, setPendingAttachment] = useState<{
    name: string;
    type: 'image' | 'file';
    size: number;
    data: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const activeConv = conversations.find((c) => c.id === activeConversationId) || conversations[0];

  const getConversationTitle = (conv: typeof activeConv) => {
    if (!conv) return 'Team Chat';
    if (conv.type === 'direct' && firebaseUser) {
      const otherUid = conv.participantIds.find((id) => id !== firebaseUser.uid);
      const otherUser = teamUsers.find((u) => u.uid === otherUid);
      return otherUser?.displayName || conv.name;
    }
    return conv.isPublic ? `# ${conv.name}` : conv.name;
  };

  const getDirectPartner = (conv: typeof activeConv) => {
    if (!conv || conv.type !== 'direct' || !firebaseUser) return null;
    const otherUid = conv.participantIds.find((id) => id !== firebaseUser.uid);
    return teamUsers.find((u) => u.uid === otherUid) || null;
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, activeConversationId]);

  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError(null);
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      const isImage = file.type.startsWith('image/');
      let dataUrl = '';
      if (isImage) {
        dataUrl = await compressImageToDataUrl(file);
      } else {
        if (file.size > 480 * 1024) {
          setUploadError('Document size limit is 480 KB for instant sync. Images are auto-compressed.');
          return;
        }
        dataUrl = await readFileAsDataUrl(file);
      }

      if (dataUrl.length > 680000) {
        setUploadError('Compressed file is still too large (max ~500 KB).');
        return;
      }

      setPendingAttachment({
        name: file.name,
        type: isImage ? 'image' : 'file',
        size: file.size,
        data: dataUrl,
      });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Could not attach file.');
    }
  };

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if ((!textInput.trim() && !pendingAttachment) || sending) return;
    setSending(true);
    try {
      const content = textInput;
      const attachment = pendingAttachment || undefined;
      setTextInput('');
      setPendingAttachment(null);
      await sendMessage(content, attachment);
    } finally {
      setSending(false);
    }
  };

  const openAddGroupModal = () => {
    setNewGroupName('');
    setNewGroupIsPublic(false);
    setSelectedGroupMemberIds([]);
    setGroupMemberSearch('');
    setGroupFormError(null);
    setAddGroupOpen(true);
  };

  const toggleNewGroupMember = (uid: string) => {
    setSelectedGroupMemberIds((prev) => {
      if (prev.includes(uid)) {
        return prev.filter((id) => id !== uid);
      }
      if (prev.length >= 49) {
        setGroupFormError('Groups support up to 50 total members.');
        return prev;
      }
      setGroupFormError(null);
      return [...prev, uid];
    });
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim() || creatingGroup) return;
    setGroupFormError(null);
    setCreatingGroup(true);
    try {
      await createChannel(newGroupName.trim(), {
        memberIds: selectedGroupMemberIds,
        isPublic: newGroupIsPublic,
      });
      setAddGroupOpen(false);
      setNewGroupName('');
      setSelectedGroupMemberIds([]);
      setMobileShowThread(true);
    } catch (err) {
      setGroupFormError(err instanceof Error ? err.message : 'Could not create group.');
    } finally {
      setCreatingGroup(false);
    }
  };

  const openManageMembersModal = () => {
    if (!activeConv) return;
    setEditingMemberIds(activeConv.participantIds || []);
    setManageMemberSearch('');
    setMembersError(null);
    setMembersModalOpen(true);
  };

  const toggleExistingGroupMember = (uid: string) => {
    if (!activeConv || uid === activeConv.ownerId) return;
    setEditingMemberIds((prev) => {
      if (prev.includes(uid)) {
        return prev.filter((id) => id !== uid);
      }
      if (prev.length >= 50) {
        setMembersError('Groups support up to 50 members.');
        return prev;
      }
      setMembersError(null);
      return [...prev, uid];
    });
  };

  const handleSaveGroupMembers = async () => {
    if (!activeConv || savingMembers) return;
    setSavingMembers(true);
    setMembersError(null);
    try {
      await updateGroupMembers(activeConv.id, editingMemberIds);
      setMembersModalOpen(false);
    } catch (err) {
      setMembersError(err instanceof Error ? err.message : 'Could not update group members.');
    } finally {
      setSavingMembers(false);
    }
  };

  const channels = conversations.filter((c) => c.type === 'channel');
  const dms = conversations.filter((c) => c.type === 'direct');
  const otherMembers = sortUsersByPresence(
    teamUsers.filter((u) => u.uid !== firebaseUser?.uid),
    firebaseUser?.uid,
    presenceNow
  );
  const presenceCounts = countUsersByPresence(otherMembers, firebaseUser?.uid, presenceNow);
  const addedUidSet = new Set<string>([
    ...contacts.map((c) => c.uid),
    ...dms.flatMap((d) => d.participantIds),
  ]);

  const matchesPresenceFilter = (uid: string, status: UserStatus) =>
    statusFilter === 'all' ||
    getEffectiveUserStatus({ uid, status, updatedAt: teamUsers.find((u) => u.uid === uid)?.updatedAt }, firebaseUser?.uid, presenceNow) ===
      statusFilter;

  const filteredChannels = channels.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );
  const filteredAddedMembers = otherMembers.filter(
    (u) =>
      addedUidSet.has(u.uid) &&
      u.displayName.toLowerCase().includes(search.toLowerCase()) &&
      matchesPresenceFilter(u.uid, u.status)
  );
  const filteredAvailableParticipants = otherMembers.filter(
    (u) =>
      !addedUidSet.has(u.uid) &&
      u.displayName.toLowerCase().includes(search.toLowerCase()) &&
      matchesPresenceFilter(u.uid, u.status)
  );

  const modalFilteredTeammates = otherMembers.filter(
    (u) =>
      u.displayName.toLowerCase().includes(groupMemberSearch.toLowerCase()) ||
      (u.department || '').toLowerCase().includes(groupMemberSearch.toLowerCase()) ||
      (u.title || '').toLowerCase().includes(groupMemberSearch.toLowerCase())
  );

  const manageFilteredUsers = teamUsers.filter(
    (u) =>
      u.displayName.toLowerCase().includes(manageMemberSearch.toLowerCase()) ||
      (u.department || '').toLowerCase().includes(manageMemberSearch.toLowerCase()) ||
      (u.title || '').toLowerCase().includes(manageMemberSearch.toLowerCase())
  );

  const canManageActiveGroup =
    Boolean(activeConv && activeConv.type === 'channel') &&
    Boolean(
      activeConv?.isPublic ||
        activeConv?.ownerId === firebaseUser?.uid ||
        currentProfile?.role === 'admin' ||
        firebaseUser?.email === 'sneloy@gmail.com'
    );

  const pendingInvites = teamInvites.filter(
    (inv) =>
      inv.status === 'pending' &&
      (inv.name.toLowerCase().includes(search.toLowerCase()) ||
        inv.email.toLowerCase().includes(search.toLowerCase()))
  );

  const partner = getDirectPartner(activeConv);
  const safetyCode =
    firebaseUser && partner
      ? generateSafetyNumber(firebaseUser.uid, partner.uid)
      : firebaseUser
      ? generateSafetyNumber(firebaseUser.uid, activeConv?.id || 'general')
      : '';

  return (
    <div className="flex-1 flex overflow-hidden bg-slate-50">
      {/* Left Sidebar: Groups & Team Members */}
      <aside
        className={`w-full md:w-80 bg-white border-r border-slate-200 flex-col shrink-0 ${
          mobileShowThread ? 'hidden md:flex' : 'flex'
        }`}
      >
        <div className="p-4 border-b border-slate-200 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-bold text-slate-900">Messages</h2>
            <button
              onClick={openAddGroupModal}
              className="min-h-[40px] px-3 rounded-xl bg-sky-50 hover:bg-sky-100 text-xs font-semibold text-sky-700 flex items-center gap-1.5 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Add Group</span>
            </button>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search groups or team..."
              className="w-full min-h-[40px] bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-sky-600"
            />
          </div>

          {/* Live Presence Filter & Counts */}
          {otherMembers.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {(['online', 'busy', 'away', 'offline'] as UserStatus[]).map((st) => {
                const meta = STATUS_META[st];
                const active = statusFilter === st;
                return (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusFilter((prev) => (prev === st ? 'all' : st))}
                    className={`px-2 py-1 rounded-lg border text-[11px] font-semibold flex items-center gap-1 transition-colors ${
                      active
                        ? `${meta.badgeClass} ring-1 ring-inset ring-current/25`
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                    title={`Filter by ${meta.label} users`}
                  >
                    <span className={`w-2 h-2 rounded-full ${meta.dotClass}`} />
                    <span>{meta.label}</span>
                    <span className="tabular-nums opacity-75">{presenceCounts[st]}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-5">
          {/* Groups / Channels */}
          <div>
            <div className="px-2 pb-1.5 text-xs font-semibold text-slate-500">
              Team Groups ({filteredChannels.length})
            </div>
            <div className="space-y-1">
              {filteredChannels.map((conv) => {
                const isActive = conv.id === activeConv?.id;
                const memberCount = conv.participantIds?.length || 1;
                return (
                  <button
                    key={conv.id}
                    onClick={() => {
                      setActiveConversationId(conv.id);
                      setMobileShowThread(true);
                    }}
                    className={`w-full min-h-[52px] px-3 py-2 rounded-xl flex items-center gap-3 text-left transition-colors ${
                      isActive
                        ? 'bg-sky-50 text-sky-900 border border-sky-200'
                        : 'hover:bg-slate-100 text-slate-700'
                    }`}
                  >
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                        isActive ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {conv.isPublic ? (
                        <Hash className="w-4 h-4" />
                      ) : (
                        <Lock className="w-4 h-4" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold truncate">{conv.name}</span>
                        {!conv.isPublic && (
                          <span className="text-[11px] text-slate-400 tabular-nums shrink-0">
                            {memberCount}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 truncate">
                        {conv.lastMessageText || 'No messages yet'}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* My Chat Contacts (Added Participants & Active DMs) */}
          <div>
            <div className="px-2 pb-1.5 flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-500">
                My Contacts ({filteredAddedMembers.length})
              </span>
              <button
                type="button"
                onClick={() => {
                  setAddMemberInitialTab('invite');
                  setAddMemberOpen(true);
                }}
                className="min-h-[32px] px-2.5 rounded-lg bg-slate-100 hover:bg-sky-50 text-sky-700 text-xs font-semibold flex items-center gap-1 transition-colors"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Add Member</span>
              </button>
            </div>
            {filteredAddedMembers.length === 0 && pendingInvites.length === 0 ? (
              <div className="px-3 py-3.5 rounded-xl bg-slate-50 border border-dashed border-slate-200 text-xs text-slate-500 space-y-2">
                <p>
                  No contacts added yet. Add an available participant below or invite a new member to start chatting.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setAddMemberInitialTab('available');
                    setAddMemberOpen(true);
                  }}
                  className="text-sky-600 hover:text-sky-700 font-semibold inline-flex items-center gap-1"
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Browse Available Participants</span>
                </button>
              </div>
            ) : (
              <div className="space-y-1">
                {filteredAddedMembers.map((member) => {
                  const matchingDm = dms.find((d) => d.participantIds.includes(member.uid));
                  const isActive = matchingDm?.id === activeConv?.id;
                  const initials = member.displayName.slice(0, 2).toUpperCase();
                  const effectiveStatus = getEffectiveUserStatus(
                    member,
                    firebaseUser?.uid,
                    presenceNow
                  );
                  const meta = STATUS_META[effectiveStatus];

                  return (
                    <div
                      key={member.uid}
                      className={`w-full min-h-[56px] px-3 py-2 rounded-xl flex items-center gap-2 transition-colors ${
                        isActive
                          ? 'bg-sky-50 text-sky-900 border border-sky-200'
                          : 'hover:bg-slate-100 text-slate-700'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={async () => {
                          await startDirectChat(member.uid);
                          setMobileShowThread(true);
                        }}
                        className="flex-1 min-w-0 flex items-center gap-3 text-left"
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
                            <div className="w-9 h-9 rounded-full bg-slate-200 text-slate-700 font-semibold text-xs flex items-center justify-center">
                              {initials}
                            </div>
                          )}
                          <span
                            className={`w-2.5 h-2.5 rounded-full border-2 border-white absolute bottom-0 right-0 ${meta.dotClass}`}
                            title={meta.label}
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1.5">
                            <span className="text-sm font-semibold text-slate-900 truncate">
                              {member.displayName}
                            </span>
                            <span className={`text-[10px] font-semibold shrink-0 ${meta.textClass}`}>
                              {meta.label}
                            </span>
                          </div>
                          <div className="text-xs text-slate-500 truncate">
                            {matchingDm?.lastMessageText || member.title || meta.label}
                          </div>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          startVideoCall(`Call with ${member.displayName}`, [
                            firebaseUser!.uid,
                            member.uid,
                          ])
                        }
                        className="min-h-[36px] min-w-[36px] rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-700 flex items-center justify-center shrink-0"
                        title={`Call ${member.displayName}`}
                        aria-label={`Call ${member.displayName}`}
                      >
                        <Video className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}

                {pendingInvites.map((invite) => (
                  <div
                    key={invite.id}
                    className="w-full min-h-[54px] px-3 py-2 rounded-xl flex items-center justify-between gap-2 bg-slate-50 border border-slate-200/70"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-800 font-semibold text-xs flex items-center justify-center shrink-0">
                        {invite.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-900 truncate">
                          {invite.name}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate">
                          Pending · {invite.email}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(
                            `Join our SphereCall workspace at ${window.location.origin} with ${invite.email}`
                          );
                          setCopiedInviteId(invite.id);
                          setTimeout(() => setCopiedInviteId(null), 2000);
                        }}
                        className="min-h-[32px] min-w-[32px] rounded-lg hover:bg-white text-slate-500 hover:text-sky-600 flex items-center justify-center"
                        title="Copy invite link"
                      >
                        {copiedInviteId === invite.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeTeamInvite(invite.id)}
                        className="min-h-[32px] min-w-[32px] rounded-lg hover:bg-white text-slate-400 hover:text-rose-600 flex items-center justify-center"
                        title="Remove invite"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Available Participants Currently Using SphereCall */}
          {filteredAvailableParticipants.length > 0 && (
            <div>
              <div className="px-2 pb-1.5 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-500">
                  Available Participants ({filteredAvailableParticipants.length})
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setAddMemberInitialTab('available');
                    setAddMemberOpen(true);
                  }}
                  className="text-[11px] font-semibold text-sky-600 hover:text-sky-700"
                >
                  View all
                </button>
              </div>
              <div className="space-y-1">
                {filteredAvailableParticipants.map((member) => {
                  const initials = member.displayName.slice(0, 2).toUpperCase();
                  const effectiveStatus = getEffectiveUserStatus(
                    member,
                    firebaseUser?.uid,
                    presenceNow
                  );
                  const meta = STATUS_META[effectiveStatus];
                  return (
                    <div
                      key={member.uid}
                      className="w-full min-h-[52px] px-3 py-2 rounded-xl flex items-center justify-between gap-2 bg-slate-50/80 border border-slate-200/70"
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
                            <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-700 font-semibold text-xs flex items-center justify-center">
                              {initials}
                            </div>
                          )}
                          <span
                            className={`w-2.5 h-2.5 rounded-full border-2 border-white absolute bottom-0 right-0 ${meta.dotClass}`}
                            title={meta.label}
                          />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-slate-900 truncate">
                            {member.displayName}
                          </div>
                          <div className="text-[11px] text-slate-500 truncate flex items-center gap-1.5">
                            <span className={`font-semibold ${meta.textClass}`}>{meta.label}</span>
                            {(member.title || member.department) && (
                              <span className="truncate">
                                · {[member.title, member.department].filter(Boolean).join(' · ')}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={async () => {
                          await addContactsAndStartChat([member.uid]);
                          setMobileShowThread(true);
                        }}
                        className="min-h-[32px] px-2.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold flex items-center gap-1 shrink-0 transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Main Message Thread */}
      <main
        className={`flex-1 flex-col overflow-hidden bg-slate-50 ${
          mobileShowThread ? 'flex' : 'hidden md:flex'
        }`}
      >
        {activeConv ? (
          <>
            {/* Conversation Header */}
            <div className="h-14 bg-white border-b border-slate-200 px-3 sm:px-6 flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <button
                  onClick={() => setMobileShowThread(false)}
                  className="md:hidden min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-600 hover:text-slate-900 -ml-2"
                  aria-label="Back to conversations"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                {activeConv.type === 'direct' && partner && (
                  <div className="relative shrink-0">
                    {partner.avatar ? (
                      <img
                        src={partner.avatar}
                        alt={partner.displayName}
                        referrerPolicy="no-referrer"
                        className="w-9 h-9 rounded-full object-cover border border-slate-200"
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-slate-200 text-slate-700 text-xs font-semibold flex items-center justify-center">
                        {partner.displayName.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <span
                      className={`w-2.5 h-2.5 rounded-full border-2 border-white absolute bottom-0 right-0 ${
                        STATUS_META[getEffectiveUserStatus(partner, firebaseUser?.uid, presenceNow)].dotClass
                      }`}
                    />
                  </div>
                )}
                <div className="min-w-0">
                  <h3 className="text-sm sm:text-base font-bold text-slate-900 truncate">
                    {getConversationTitle(activeConv)}
                  </h3>
                  <div className="text-xs text-slate-500 flex items-center gap-1.5">
                    {activeConv.type === 'direct' && partner ? (
                      <UserStatusBadge
                        status={getEffectiveUserStatus(partner, firebaseUser?.uid, presenceNow)}
                        compact
                      />
                    ) : (
                      <span>
                        {activeConv.type === 'direct'
                          ? 'Direct message'
                          : activeConv.isPublic
                          ? 'Open team group'
                          : 'Private group'}
                      </span>
                    )}
                    <span aria-hidden="true">·</span>
                    <button
                      onClick={() => setSafetyModalOpen(true)}
                      className="inline-flex items-center gap-1 text-emerald-700 hover:underline font-medium"
                    >
                      <Lock className="w-3 h-3" />
                      <span>Encrypted</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {activeConv.type === 'channel' && (
                  <button
                    onClick={openManageMembersModal}
                    className="min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors shrink-0"
                    title="Add or manage group members"
                  >
                    <UserPlus className="w-4 h-4 text-sky-600" />
                    <span className="hidden sm:inline">Add Member</span>
                    <span className="tabular-nums text-slate-500">
                      ({activeConv.isPublic ? Math.max(teamUsers.length, activeConv.participantIds?.length || 1) : activeConv.participantIds?.length || 1})
                    </span>
                  </button>
                )}

                <button
                  onClick={() =>
                    startVideoCall(
                      `Call: ${getConversationTitle(activeConv)}`,
                      activeConv.isPublic
                        ? teamUsers.slice(0, 50).map((u) => u.uid)
                        : activeConv.participantIds
                    )
                  }
                  className="min-h-[40px] px-3.5 py-2 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-700 text-xs font-semibold flex items-center gap-1.5 transition-colors shrink-0"
                >
                  <Video className="w-4 h-4" />
                  <span>Call</span>
                </button>
              </div>
            </div>

            {/* Messages Feed */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500 space-y-2">
                  <p className="text-sm font-semibold text-slate-700">No messages here yet</p>
                  <p className="text-xs max-w-xs">
                    Send a message or attach an image or document to start collaborating.
                  </p>
                </div>
              ) : (
                messages.map((msg) => {
                  const isMe = msg.senderId === firebaseUser?.uid;
                  const canDelete = isMe || currentProfile?.role === 'admin';
                  const liveSender = teamUsers.find((u) => u.uid === msg.senderId);
                  const avatarUrl = liveSender?.avatar || msg.senderAvatar;

                  return (
                    <div
                      key={msg.id}
                      className={`flex gap-2.5 group ${isMe ? 'flex-row-reverse' : 'flex-row'}`}
                    >
                      {avatarUrl ? (
                        <img
                          src={avatarUrl}
                          alt={msg.senderName}
                          referrerPolicy="no-referrer"
                          className="w-8 h-8 rounded-full object-cover border border-slate-200 shrink-0 mt-5"
                        />
                      ) : (
                        <div
                          className={`w-8 h-8 rounded-full text-[11px] font-semibold flex items-center justify-center shrink-0 mt-5 ${
                            isMe ? 'bg-sky-100 text-sky-700' : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          {(msg.senderName || 'U').slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div
                        className={`max-w-[78%] sm:max-w-[65%] flex flex-col ${
                          isMe ? 'items-end' : 'items-start'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1 px-1 text-xs text-slate-500">
                          {!isMe && (
                            <span className="font-semibold text-slate-700">{msg.senderName}</span>
                          )}
                          <span className="tabular-nums">{formatMessageTime(msg.createdAt)}</span>
                        </div>

                        <div
                          className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                            isMe
                              ? 'bg-sky-600 text-white rounded-tr-sm'
                              : 'bg-white text-slate-900 border border-slate-200 rounded-tl-sm'
                          }`}
                        >
                          {msg.attachmentType === 'image' && msg.attachmentData && (
                            <div className="mb-2 rounded-xl overflow-hidden border border-black/10">
                              <img
                                src={msg.attachmentData}
                                alt={msg.attachmentName || 'Shared image'}
                                className="max-h-64 w-auto object-cover"
                              />
                            </div>
                          )}

                          {msg.attachmentType === 'file' && msg.attachmentData && (
                            <div
                              className={`mb-2 flex items-center gap-2.5 p-2.5 rounded-xl border ${
                                isMe
                                  ? 'bg-sky-700/60 border-sky-500/40 text-white'
                                  : 'bg-slate-50 border-slate-200 text-slate-800'
                              }`}
                            >
                              <FileText className="w-5 h-5 shrink-0" />
                              <div className="min-w-0 flex-1">
                                <div className="text-xs font-semibold truncate">
                                  {msg.attachmentName}
                                </div>
                                <div className="text-[11px] opacity-80 tabular-nums">
                                  {((msg.attachmentSize || 0) / 1024).toFixed(1)} KB
                                </div>
                              </div>
                              <a
                                href={msg.attachmentData}
                                download={msg.attachmentName || 'file'}
                                className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg hover:bg-black/10"
                                title="Download file"
                              >
                                <Download className="w-4 h-4" />
                              </a>
                            </div>
                          )}

                          {msg.content && (
                            <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                          )}
                        </div>

                        {canDelete && (
                          <button
                            onClick={() => removeMessage(msg.id)}
                            className="opacity-0 group-hover:opacity-100 focus:opacity-100 mt-1 px-1.5 py-0.5 text-[11px] text-slate-400 hover:text-rose-600 flex items-center gap-1 transition-opacity"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Delete</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={bottomRef} />
            </div>

            {/* Composer */}
            <div className="bg-white border-t border-slate-200 p-3 sm:p-4 shrink-0 space-y-2">
              {uploadError && (
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{uploadError}</span>
                  </div>
                  <button onClick={() => setUploadError(null)} className="p-1">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {pendingAttachment && (
                <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {pendingAttachment.type === 'image' ? (
                      <img
                        src={pendingAttachment.data}
                        alt="Preview"
                        className="w-9 h-9 rounded-lg object-cover border border-slate-200"
                      />
                    ) : (
                      <FileText className="w-5 h-5 text-sky-600 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-800 truncate">
                        {pendingAttachment.name}
                      </div>
                      <div className="text-slate-500 tabular-nums">
                        {(pendingAttachment.size / 1024).toFixed(1)} KB
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setPendingAttachment(null)}
                    className="min-h-[36px] min-w-[36px] flex items-center justify-center text-slate-400 hover:text-rose-600"
                    aria-label="Remove attachment"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              <form onSubmit={handleSend} className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={handleFilePick}
                  accept="image/*,.pdf,.doc,.docx,.txt,.csv,.zip"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="min-h-[44px] min-w-[44px] rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 flex items-center justify-center shrink-0 transition-colors"
                  title="Share image or file"
                  aria-label="Share image or file"
                >
                  <Paperclip className="w-5 h-5" />
                </button>

                <input
                  type="text"
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  placeholder="Write a message..."
                  className="flex-1 min-h-[44px] bg-slate-50 border border-slate-200 rounded-xl px-4 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-sky-600 focus:bg-white"
                />

                <button
                  type="submit"
                  disabled={sending || (!textInput.trim() && !pendingAttachment)}
                  className="min-h-[44px] min-w-[44px] px-4 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold text-sm flex items-center justify-center gap-1.5 shrink-0 transition-colors"
                  aria-label="Send message"
                >
                  <Send className="w-4 h-4" />
                  <span className="hidden sm:inline">Send</span>
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-slate-500">
            Select a group or teammate to start chatting.
          </div>
        )}
      </main>

      {/* Add Group Modal (with Add Team Members) */}
      {addGroupOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateGroup}
            className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden"
          >
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center">
                  <Users className="w-4 h-4" />
                </div>
                <h3 className="text-base font-bold text-slate-900">Add New Group</h3>
              </div>
              <button
                type="button"
                onClick={() => setAddGroupOpen(false)}
                className="min-h-[36px] min-w-[36px] flex items-center justify-center text-slate-400 hover:text-slate-700"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5 overflow-y-auto flex-1">
              {groupFormError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{groupFormError}</span>
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
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="e.g. Marketing Team, Project Alpha"
                  className="w-full min-h-[44px] bg-slate-50 border border-slate-300 rounded-xl px-3.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-sky-600 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Group Privacy
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setNewGroupIsPublic(false)}
                    className={`min-h-[56px] p-3 rounded-xl border text-left transition-colors ${
                      !newGroupIsPublic
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
                    onClick={() => setNewGroupIsPublic(true)}
                    className={`min-h-[56px] p-3 rounded-xl border text-left transition-colors ${
                      newGroupIsPublic
                        ? 'border-sky-600 bg-sky-50 text-sky-950'
                        : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-bold">
                      <Globe className="w-3.5 h-3.5 text-sky-600" />
                      <span>Open Team Group</span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      Visible to all teammates
                    </div>
                  </button>
                </div>
              </div>

              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-semibold text-slate-700">
                    Add Team Members ({selectedGroupMemberIds.length + 1} selected)
                  </label>
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setAddMemberOpen(true)}
                      className="text-sky-600 hover:text-sky-700 font-semibold flex items-center gap-1"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>Invite New</span>
                    </button>
                    {otherMembers.length > 0 && (
                      <>
                        <span className="text-slate-300">|</span>
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedGroupMemberIds(
                              otherMembers.slice(0, 49).map((m) => m.uid)
                            )
                          }
                          className="text-sky-600 hover:text-sky-700 font-semibold"
                        >
                          Select all
                        </button>
                        <span className="text-slate-300">|</span>
                        <button
                          type="button"
                          onClick={() => setSelectedGroupMemberIds([])}
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
                    value={groupMemberSearch}
                    onChange={(e) => setGroupMemberSearch(e.target.value)}
                    placeholder="Search teammates to add..."
                    className="w-full min-h-[40px] bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-sky-600 focus:bg-white"
                  />
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

                  {otherMembers.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-500">
                      No other teammates have signed up yet. You can create the group now and add members anytime once they join.
                    </div>
                  ) : modalFilteredTeammates.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-500">
                      No teammates match "{groupMemberSearch}".
                    </div>
                  ) : (
                    modalFilteredTeammates.map((member) => {
                      const isSelected = selectedGroupMemberIds.includes(member.uid);
                      const effectiveStatus = getEffectiveUserStatus(
                        member,
                        firebaseUser?.uid,
                        presenceNow
                      );
                      const meta = STATUS_META[effectiveStatus];
                      return (
                        <button
                          key={member.uid}
                          type="button"
                          onClick={() => toggleNewGroupMember(member.uid)}
                          className={`w-full min-h-[48px] px-3 py-2 flex items-center justify-between gap-3 text-left transition-colors ${
                            isSelected ? 'bg-sky-50/70' : 'hover:bg-slate-50'
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
                              <div className="text-xs font-semibold text-slate-900 truncate">
                                {member.displayName}
                              </div>
                              <div className="text-[11px] text-slate-500 truncate flex items-center gap-1.5">
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

                          <div
                            className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                              isSelected
                                ? 'bg-sky-600 border-sky-600 text-white'
                                : 'border-slate-300 bg-white'
                            }`}
                          >
                            {isSelected && <Check className="w-3.5 h-3.5" />}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => setAddGroupOpen(false)}
                className="min-h-[42px] px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creatingGroup || !newGroupName.trim()}
                className="min-h-[42px] px-5 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:bg-slate-300 text-white text-xs font-semibold flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>{creatingGroup ? 'Creating...' : 'Create Group'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Manage / View Existing Group Members Modal */}
      {membersModalOpen && activeConv && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md max-h-[88vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
              <div className="min-w-0">
                <h3 className="text-base font-bold text-slate-900 truncate">
                  {activeConv.name} Members
                </h3>
                <p className="text-xs text-slate-500">
                  {activeConv.isPublic
                    ? 'Open team group — everyone on the team can access'
                    : `${editingMemberIds.length} member${editingMemberIds.length === 1 ? '' : 's'} with access`}
                </p>
              </div>
              <button
                onClick={() => setMembersModalOpen(false)}
                className="min-h-[36px] min-w-[36px] flex items-center justify-center text-slate-400 hover:text-slate-700 shrink-0"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-3 overflow-y-auto flex-1">
              {membersError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{membersError}</span>
                </div>
              )}

              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  value={manageMemberSearch}
                  onChange={(e) => setManageMemberSearch(e.target.value)}
                  placeholder="Search team members..."
                  className="w-full min-h-[40px] bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-sky-600 focus:bg-white"
                />
              </div>

              <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-64 overflow-y-auto">
                {manageFilteredUsers.map((member) => {
                  const isOwner = member.uid === activeConv.ownerId;
                  const isIncluded = editingMemberIds.includes(member.uid);
                  const effectiveStatus = getEffectiveUserStatus(
                    member,
                    firebaseUser?.uid,
                    presenceNow
                  );
                  const meta = STATUS_META[effectiveStatus];

                  return (
                    <button
                      key={member.uid}
                      type="button"
                      disabled={!canManageActiveGroup || isOwner}
                      onClick={() => toggleExistingGroupMember(member.uid)}
                      className={`w-full min-h-[48px] px-3 py-2 flex items-center justify-between gap-3 text-left transition-colors ${
                        canManageActiveGroup && !isOwner
                          ? 'hover:bg-slate-50 cursor-pointer'
                          : 'cursor-default'
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
                          <div className="text-xs font-semibold text-slate-900 truncate">
                            {member.displayName}{' '}
                            {member.uid === firebaseUser?.uid ? '(You)' : ''}
                          </div>
                          <div className="text-[11px] text-slate-500 truncate flex items-center gap-1.5">
                            <span className={`font-semibold ${meta.textClass}`}>{meta.label}</span>
                            <span>
                              ·{' '}
                              {isOwner
                                ? 'Group Owner'
                                : [member.title, member.department].filter(Boolean).join(' · ') ||
                                  'Member'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {isOwner ? (
                        <span className="text-[11px] font-semibold text-sky-700 shrink-0">
                          Owner
                        </span>
                      ) : canManageActiveGroup ? (
                        <div
                          className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                            isIncluded
                              ? 'bg-sky-600 border-sky-600 text-white'
                              : 'border-slate-300 bg-white'
                          }`}
                        >
                          {isIncluded && <Check className="w-3.5 h-3.5" />}
                        </div>
                      ) : (
                        <span className="text-[11px] font-medium text-slate-500 shrink-0">
                          {isIncluded ? 'Member' : ''}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => setAddMemberOpen(true)}
                className="min-h-[40px] px-3 rounded-xl text-sky-700 hover:bg-sky-50 text-xs font-semibold flex items-center gap-1.5"
              >
                <UserPlus className="w-4 h-4" />
                <span>Invite New Member</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMembersModalOpen(false)}
                  className="min-h-[40px] px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold"
                >
                  Close
                </button>
                {canManageActiveGroup && (
                  <button
                    type="button"
                    onClick={handleSaveGroupMembers}
                    disabled={savingMembers}
                    className="min-h-[40px] px-4 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:bg-slate-300 text-white text-xs font-semibold"
                  >
                    {savingMembers ? 'Saving...' : 'Save Members'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Simple E2EE Verification Modal */}
      {safetyModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
                <h3 className="text-base font-bold text-slate-900">Encryption Key Verification</h3>
              </div>
              <button
                onClick={() => setSafetyModalOpen(false)}
                className="min-h-[36px] min-w-[36px] flex items-center justify-center text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Messages sent here include client-side AES-256-GCM encryption payloads. Compare this safety number with your teammate to verify your session:
            </p>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 font-mono text-xs text-slate-800 grid grid-cols-3 gap-2 text-center tabular-nums">
              {safetyCode.split(' ').map((block, idx) => (
                <div key={idx} className="py-1 bg-white rounded-lg border border-slate-200">
                  {block}
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setSafetyModalOpen(false)}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      <AddMemberModal
        isOpen={addMemberOpen}
        onClose={() => setAddMemberOpen(false)}
        initialTab={addMemberInitialTab}
        onStartedChat={() => setMobileShowThread(true)}
      />
    </div>
  );
};
