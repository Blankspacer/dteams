import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Paperclip,
  Phone,
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
  Copy,
  CalendarPlus,
  Loader2,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useEmailSearchMatch } from '../../hooks/useEmailSearchMatch';
import { matchesUserSearch } from '../../utils/userLookup';
import { AddMemberModal } from '../common/AddMemberModal';
import { UserStatusBadge } from '../common/UserStatusBadge';
import { generateSafetyNumber } from '../../utils/crypto';
import {
  STATUS_META,
  countUsersByPresence,
  getEffectiveUserStatus,
  sortUsersByPresence,
} from '../../utils/presence';
import {
  UserStatus,
  ChatMessage,
} from '../../types';
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

function formatSearchTimestamp(ts: unknown): string {
  if (!ts) return '';
  const date =
    ts instanceof Timestamp
      ? ts.toDate()
      : typeof ts === 'object' && ts !== null && 'seconds' in ts
        ? new Date(((ts as { seconds: number }).seconds || 0) * 1000)
        : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
    ' · ' +
    date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function renderHighlightedSnippet(text: string, tokens: string[]): React.ReactNode {
  if (!text) return null;
  const cleanTokens = tokens.filter((t) => t.length > 0);
  if (cleanTokens.length === 0) return text;

  const lower = text.toLowerCase();
  let firstIdx = -1;
  for (const tok of cleanTokens) {
    const idx = lower.indexOf(tok);
    if (idx !== -1 && (firstIdx === -1 || idx < firstIdx)) {
      firstIdx = idx;
    }
  }

  let snippet = text;
  if (text.length > 140) {
    const start = firstIdx > 40 ? firstIdx - 36 : 0;
    const end = Math.min(text.length, start + 140);
    snippet = (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
  }

  const escaped = cleanTokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const regex = new RegExp(`(${escaped.join('|')})`, 'ig');
  const parts = snippet.split(regex);

  return parts.map((part, idx) => {
    const isMatch = cleanTokens.some((tok) => part.toLowerCase() === tok);
    return isMatch ? (
      <mark key={idx} className="bg-amber-200/90 text-slate-900 rounded px-0.5 font-semibold">
        {part}
      </mark>
    ) : (
      <React.Fragment key={idx}>{part}</React.Fragment>
    );
  });
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
    teamInvites,
    conversations,
    activeConversationId,
    setActiveConversationId,
    messages,
    sendMessage,
    removeMessage,
    loadSearchableMessages,
    openCreateGroupModal,
    updateGroupMembers,
    addContact,
    isAddedMember,
    startDirectChat,
    startVideoCall,
    openMeetingSchedulerWithDraft,
    removeTeamInvite,
    presenceNow,
  } = useApp();

  const [mobileShowThread, setMobileShowThread] = useState(false);
  const [search, setSearch] = useState('');
  const [globalQuery, setGlobalQuery] = useState('');
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [globalScope, setGlobalScope] = useState<'all' | 'people' | 'groups' | 'messages'>('all');
  const [searchableMessages, setSearchableMessages] = useState<ChatMessage[]>([]);
  const [searchingHistory, setSearchingHistory] = useState(false);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | UserStatus>('all');
  const [textInput, setTextInput] = useState('');
  const [sending, setSending] = useState(false);
  const [addingMemberUid, setAddingMemberUid] = useState<string | null>(null);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [addMemberInitialTab, setAddMemberInitialTab] = useState<'available' | 'invite'>('available');
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null);

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
  const globalSearchContainerRef = useRef<HTMLDivElement>(null);
  const globalSearchInputRef = useRef<HTMLInputElement>(null);

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
    if (highlightedMessageId) {
      const targetEl = document.getElementById(`chat-msg-${highlightedMessageId}`);
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const timer = setTimeout(() => {
          setHighlightedMessageId((cur) => (cur === highlightedMessageId ? null : cur));
        }, 3200);
        return () => clearTimeout(timer);
      }
      return;
    }
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, activeConversationId, highlightedMessageId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        globalSearchInputRef.current?.focus();
        setGlobalSearchOpen(true);
      } else if (e.key === 'Escape' && globalSearchOpen) {
        setGlobalSearchOpen(false);
        globalSearchInputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [globalSearchOpen]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        globalSearchContainerRef.current &&
        !globalSearchContainerRef.current.contains(e.target as Node)
      ) {
        setGlobalSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const trimmed = globalQuery.trim();
    if (!trimmed) {
      setSearchingHistory(false);
      return;
    }

    let cancelled = false;
    setSearchingHistory(true);
    const timer = setTimeout(() => {
      loadSearchableMessages()
        .then((all) => {
          if (!cancelled) {
            setSearchableMessages(all);
          }
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) {
            setSearchingHistory(false);
          }
        });
    }, 180);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [globalQuery, conversations.length, messages.length]);

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

  const {
    matchedEmailUser,
    searchingEmail,
    searchedEmail,
  } = useEmailSearchMatch(search);
  const {
    matchedEmailUser: globalEmailMatch,
    searchingEmail: searchingGlobalEmail,
  } = useEmailSearchMatch(globalQuery);
  const {
    matchedEmailUser: manageEmailMatch,
    searchingEmail: searchingManageEmail,
  } = useEmailSearchMatch(manageMemberSearch);

  const openManageMembersModal = () => {
    if (!activeConv) return;
    setEditingMemberIds(activeConv.participantIds || []);
    setManageMemberSearch('');
    setMembersError(null);
    setMembersModalOpen(true);
  };

  const handleAddMember = async (uid: string) => {
    setAddingMemberUid(uid);
    try {
      await addContact(uid);
    } finally {
      setAddingMemberUid(null);
    }
  };

  const toggleExistingGroupMember = (uid: string) => {
    if (!activeConv || uid === activeConv.ownerId) return;
    if (!editingMemberIds.includes(uid) && !isAddedMember(uid)) {
      setMembersError('Please add this user as a member first before adding them to the group.');
      return;
    }
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
  const platformUsers = sortUsersByPresence(
    teamUsers.filter((u) => u.uid !== firebaseUser?.uid),
    firebaseUser?.uid,
    presenceNow
  );
  const presenceCounts = countUsersByPresence(platformUsers, firebaseUser?.uid, presenceNow);

  const matchesPresenceFilter = (uid: string, status: UserStatus) =>
    statusFilter === 'all' ||
    getEffectiveUserStatus(
      { uid, status, updatedAt: teamUsers.find((u) => u.uid === uid)?.updatedAt },
      firebaseUser?.uid,
      presenceNow
    ) === statusFilter;

  const cleanQuery = search.trim().toLowerCase().replace(/^@+/, '');
  const filteredChannels = channels.filter((c) =>
    c.name.toLowerCase().includes(cleanQuery)
  );
  const filteredPlatformUsers = platformUsers.filter((u) => {
    return (
      matchesUserSearch(u, search, matchedEmailUser?.uid) &&
      matchesPresenceFilter(u.uid, u.status)
    );
  });

  const manageFilteredUsers = teamUsers.filter((u) =>
    matchesUserSearch(u, manageMemberSearch, manageEmailMatch?.uid)
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

  const addedPlatformUsers = filteredPlatformUsers.filter((u) => isAddedMember(u.uid));
  const availableNonMemberUsers = filteredPlatformUsers.filter((u) => !isAddedMember(u.uid));

  const trimmedGlobal = globalQuery.trim();
  const cleanGlobal = trimmedGlobal.toLowerCase().replace(/^@+/, '');
  const globalTokens = trimmedGlobal
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  const globalMatchedPeople = trimmedGlobal
    ? platformUsers.filter((u) => matchesUserSearch(u, globalQuery, globalEmailMatch?.uid))
    : [];

  const globalMatchedGroups = trimmedGlobal
    ? channels.filter(
        (c) =>
          c.name.toLowerCase().includes(cleanGlobal) ||
          (c.lastMessageText || '').toLowerCase().includes(cleanGlobal)
      )
    : [];

  const globalMatchedMessages = React.useMemo(() => {
    if (globalTokens.length === 0) return [];
    const seenIds = new Set<string>();
    const combined: ChatMessage[] = [];
    for (const msg of [...messages, ...searchableMessages]) {
      if (seenIds.has(msg.id)) continue;
      seenIds.add(msg.id);
      combined.push(msg);
    }

    return combined
      .filter((msg) => {
        const haystack = [
          msg.content || '',
          msg.attachmentName || '',
          msg.senderName || '',
        ]
          .join(' ')
          .toLowerCase();
        return globalTokens.every((tok) => haystack.includes(tok));
      })
      .slice(0, 40);
  }, [globalTokens.join('|'), messages, searchableMessages]);

  const totalGlobalMatches =
    globalMatchedPeople.length +
    globalMatchedGroups.length +
    globalMatchedMessages.length;

  const partner = getDirectPartner(activeConv);
  const partnerIsMember =
    activeConv?.type === 'direct' && partner ? isAddedMember(partner.uid) : true;
  const safetyCode =
    firebaseUser && partner
      ? generateSafetyNumber(firebaseUser.uid, partner.uid)
      : firebaseUser
      ? generateSafetyNumber(firebaseUser.uid, activeConv?.id || 'general')
      : '';

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
      {/* Global Search Bar (Team Members, Groups & Historical Messages) */}
      <div
        ref={globalSearchContainerRef}
        className="relative z-30 bg-white border-b border-slate-200 px-3 sm:px-6 py-2.5 shrink-0"
      >
        <div className="max-w-4xl mx-auto flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-sky-600 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              ref={globalSearchInputRef}
              type="text"
              value={globalQuery}
              onFocus={() => setGlobalSearchOpen(true)}
              onChange={(e) => {
                setGlobalQuery(e.target.value);
                setGlobalSearchOpen(true);
              }}
              placeholder="Global search: find team members, groups, or message keywords..."
              aria-label="Global search for team members, groups, or historical messages"
              className="w-full min-h-[40px] bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-20 text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-sky-600 focus:bg-white transition-colors"
            />
            <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
              {(searchingHistory || searchingGlobalEmail) && trimmedGlobal && (
                <Loader2 className="w-3.5 h-3.5 text-sky-600 animate-spin" />
              )}
              {trimmedGlobal ? (
                <button
                  type="button"
                  onClick={() => {
                    setGlobalQuery('');
                    setGlobalSearchOpen(false);
                  }}
                  className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 transition-colors"
                  aria-label="Clear global search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              ) : (
                <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded border border-slate-200 bg-white text-[10px] font-mono text-slate-400">
                  Ctrl+K
                </kbd>
              )}
            </div>
          </div>
        </div>

        {/* Global Search Results Popover */}
        {globalSearchOpen && trimmedGlobal.length > 0 && (
          <div className="absolute left-3 right-3 sm:left-6 sm:right-6 top-full mt-1.5 max-w-4xl mx-auto bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[72dvh]">
            {/* Category Filter Tabs */}
            <div className="px-3 sm:px-4 py-2 border-b border-slate-100 bg-slate-50/80 flex flex-wrap items-center justify-between gap-2 shrink-0">
              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    { id: 'all', label: 'All', count: totalGlobalMatches },
                    { id: 'messages', label: 'Messages', count: globalMatchedMessages.length },
                    { id: 'people', label: 'People', count: globalMatchedPeople.length },
                    { id: 'groups', label: 'Groups', count: globalMatchedGroups.length },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setGlobalScope(tab.id)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 transition-colors ${
                      globalScope === tab.id
                        ? 'bg-sky-600 text-white'
                        : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span
                      className={`tabular-nums text-[10px] ${
                        globalScope === tab.id ? 'text-sky-100' : 'text-slate-400'
                      }`}
                    >
                      {tab.count}
                    </span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setGlobalSearchOpen(false)}
                className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 px-1.5 py-0.5"
              >
                Close (Esc)
              </button>
            </div>

            {/* Results Body */}
            <div className="overflow-y-auto p-3 sm:p-4 space-y-4">
              {totalGlobalMatches === 0 && !searchingHistory && !searchingGlobalEmail ? (
                <div className="py-8 text-center space-y-1">
                  <p className="text-sm font-semibold text-slate-700">
                    No results for &ldquo;{trimmedGlobal}&rdquo;
                  </p>
                  <p className="text-xs text-slate-500">
                    Try searching by display name, @username, @email, group name, file name, or message keywords.
                  </p>
                </div>
              ) : (
                <>
                  {/* Groups Matches */}
                  {(globalScope === 'all' || globalScope === 'groups') &&
                    globalMatchedGroups.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="px-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                          Groups ({globalMatchedGroups.length})
                        </div>
                        <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                          {globalMatchedGroups.slice(0, 8).map((conv) => (
                            <button
                              key={conv.id}
                              type="button"
                              onClick={() => {
                                setActiveConversationId(conv.id);
                                setMobileShowThread(true);
                                setGlobalSearchOpen(false);
                              }}
                              className="w-full px-3 py-2.5 bg-white hover:bg-sky-50/70 flex items-center justify-between gap-3 text-left transition-colors"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                                  {conv.isPublic ? (
                                    <Hash className="w-4 h-4" />
                                  ) : (
                                    <Lock className="w-4 h-4" />
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <div className="text-xs sm:text-sm font-semibold text-slate-900 truncate">
                                    {renderHighlightedSnippet(conv.name, globalTokens)}
                                  </div>
                                  <div className="text-[11px] text-slate-500 truncate">
                                    {conv.lastMessageText
                                      ? renderHighlightedSnippet(conv.lastMessageText, globalTokens)
                                      : conv.isPublic
                                        ? 'Open team group'
                                        : `${conv.participantIds?.length || 1} members`}
                                  </div>
                                </div>
                              </div>
                              <span className="text-[11px] font-semibold text-sky-600 shrink-0">
                                Open
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                  {/* Team Members Matches */}
                  {(globalScope === 'all' || globalScope === 'people') &&
                    globalMatchedPeople.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="px-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                          Team Members ({globalMatchedPeople.length})
                        </div>
                        <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                          {globalMatchedPeople.slice(0, 10).map((member) => {
                            const effectiveStatus = getEffectiveUserStatus(
                              member,
                              firebaseUser?.uid,
                              presenceNow
                            );
                            const meta = STATUS_META[effectiveStatus];
                            const memberAdded = isAddedMember(member.uid);
                            const isAdding = addingMemberUid === member.uid;

                            return (
                              <div
                                key={member.uid}
                                className="px-3 py-2 bg-white hover:bg-slate-50 flex items-center justify-between gap-2.5"
                              >
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await startDirectChat(member.uid);
                                    setMobileShowThread(true);
                                    setGlobalSearchOpen(false);
                                  }}
                                  className="flex-1 min-w-0 flex items-center gap-2.5 text-left"
                                >
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
                                    />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-xs sm:text-sm font-semibold text-slate-900 truncate">
                                        {renderHighlightedSnippet(member.displayName, globalTokens)}
                                      </span>
                                      <UserStatusBadge status={effectiveStatus} compact />
                                    </div>
                                    <div className="text-[11px] text-slate-500 truncate">
                                      {member.username ? `@${member.username}` : ''}
                                      {member.username && (member.title || member.department) ? ' · ' : ''}
                                      {[member.title, member.department].filter(Boolean).join(' · ')}
                                    </div>
                                  </div>
                                </button>

                                {memberAdded ? (
                                  <div className="flex items-center gap-1 shrink-0">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setGlobalSearchOpen(false);
                                        startVideoCall(
                                          `Voice Call with ${member.displayName}`,
                                          [firebaseUser!.uid, member.uid],
                                          'voice'
                                        );
                                      }}
                                      className="min-h-[32px] min-w-[32px] rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 flex items-center justify-center"
                                      title={`Voice call ${member.displayName}`}
                                    >
                                      <Phone className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setGlobalSearchOpen(false);
                                        startVideoCall(
                                          `Call with ${member.displayName}`,
                                          [firebaseUser!.uid, member.uid],
                                          'video'
                                        );
                                      }}
                                      className="min-h-[32px] min-w-[32px] rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-700 flex items-center justify-center"
                                      title={`Video call ${member.displayName}`}
                                    >
                                      <Video className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    disabled={isAdding}
                                    onClick={() => handleAddMember(member.uid)}
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
                          })}
                        </div>
                      </div>
                    )}

                  {/* Historical Messages Matches */}
                  {(globalScope === 'all' || globalScope === 'messages') && (
                    <div className="space-y-1.5">
                      <div className="px-1 flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        <span>Historical Messages ({globalMatchedMessages.length})</span>
                        {searchingHistory && (
                          <span className="font-normal normal-case text-sky-600 flex items-center gap-1">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Searching all chats...
                          </span>
                        )}
                      </div>

                      {globalMatchedMessages.length === 0 ? (
                        !searchingHistory && globalScope === 'messages' && (
                          <p className="text-xs text-slate-500 px-1 py-2">
                            No messages match &ldquo;{trimmedGlobal}&rdquo;.
                          </p>
                        )
                      ) : (
                        <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                          {globalMatchedMessages.map((msg) => {
                            const conv = conversations.find((c) => c.id === msg.conversationId);
                            const convLabel = conv ? getConversationTitle(conv) : 'Conversation';
                            return (
                              <button
                                key={msg.id}
                                type="button"
                                onClick={() => {
                                  setHighlightedMessageId(msg.id);
                                  setActiveConversationId(msg.conversationId);
                                  setMobileShowThread(true);
                                  setGlobalSearchOpen(false);
                                }}
                                className="w-full px-3 py-2.5 bg-white hover:bg-sky-50/70 text-left space-y-1 transition-colors"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <span className="font-bold text-slate-900 truncate">
                                      {renderHighlightedSnippet(msg.senderName || 'Member', globalTokens)}
                                    </span>
                                    <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-semibold truncate max-w-[160px]">
                                      {convLabel}
                                    </span>
                                  </div>
                                  <span className="text-slate-400 tabular-nums shrink-0">
                                    {formatSearchTimestamp(msg.createdAt)}
                                  </span>
                                </div>
                                {msg.content && (
                                  <p className="text-xs text-slate-700 line-clamp-2 break-words">
                                    {renderHighlightedSnippet(msg.content, globalTokens)}
                                  </p>
                                )}
                                {msg.attachmentName && (
                                  <div className="inline-flex items-center gap-1 text-[11px] text-sky-700 bg-sky-50 border border-sky-100 px-2 py-0.5 rounded-md">
                                    <FileText className="w-3 h-3 shrink-0" />
                                    <span className="truncate max-w-[240px]">
                                      {renderHighlightedSnippet(msg.attachmentName, globalTokens)}
                                    </span>
                                  </div>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Main Split Chat Container */}
      <div className="flex-1 flex overflow-hidden">
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
              onClick={openCreateGroupModal}
              className="min-h-[40px] px-3 rounded-xl bg-sky-600 hover:bg-sky-700 text-xs font-semibold text-white flex items-center gap-1.5 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Create Group</span>
            </button>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search groups, @username, or @email..."
              className="w-full min-h-[40px] bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-8 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-sky-600"
            />
            {searchingEmail && (
              <Loader2 className="w-3.5 h-3.5 text-sky-600 animate-spin absolute right-3 top-3" />
            )}
          </div>

          {/* Live Presence Filter & Counts */}
          {platformUsers.length > 0 && (
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
            <div className="px-2 pb-1.5 flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-500">
                Groups ({filteredChannels.length})
              </span>
              <button
                type="button"
                onClick={openCreateGroupModal}
                className="text-[11px] font-semibold text-sky-600 hover:text-sky-700 flex items-center gap-0.5"
              >
                <Plus className="w-3 h-3" />
                <span>Create Group</span>
              </button>
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

          {/* All People on SphereCall (Telegram-style immediate directory) */}
          <div>
            <div className="px-2 pb-1.5 flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-500">
                People ({filteredPlatformUsers.length})
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
                <span>Invite</span>
              </button>
            </div>
            {filteredPlatformUsers.length === 0 && pendingInvites.length === 0 ? (
              <div className="px-3 py-3.5 rounded-xl bg-slate-50 border border-dashed border-slate-200 text-xs text-slate-500 space-y-2">
                <p>
                  {searchingEmail
                    ? 'Searching users by email...'
                    : platformUsers.length === 0
                    ? 'No other users have signed up yet. Invite someone by email to start chatting and calling.'
                    : searchedEmail
                    ? `No registered user found for ${searchedEmail}.`
                    : 'No users match your current search or status filter.'}
                </p>
                {(platformUsers.length === 0 || (searchedEmail && !searchingEmail)) && (
                  <button
                    type="button"
                    onClick={() => {
                      setAddMemberInitialTab('invite');
                      setAddMemberOpen(true);
                    }}
                    className="text-sky-600 hover:text-sky-700 font-semibold inline-flex items-center gap-1"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>
                      {searchedEmail ? `Invite ${searchedEmail}` : 'Invite Member by Email'}
                    </span>
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {addedPlatformUsers.length > 0 && (
                  <div className="space-y-1">
                    <div className="px-2 text-[11px] font-semibold text-emerald-700">
                      Added Members ({addedPlatformUsers.length})
                    </div>
                    {addedPlatformUsers.map((member) => {
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
                                {matchingDm?.lastMessageText ||
                                  (member.username ? `@${member.username}` : '') ||
                                  member.title ||
                                  meta.label}
                              </div>
                            </div>
                          </button>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() =>
                                startVideoCall(
                                  `Voice Call with ${member.displayName}`,
                                  [firebaseUser!.uid, member.uid],
                                  'voice'
                                )
                              }
                              className="min-h-[40px] min-w-[40px] sm:min-h-[34px] sm:min-w-[34px] rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0"
                              title={`Voice call ${member.displayName}`}
                              aria-label={`Voice call ${member.displayName}`}
                            >
                              <Phone className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                startVideoCall(
                                  `Call with ${member.displayName}`,
                                  [firebaseUser!.uid, member.uid],
                                  'video'
                                )
                              }
                              className="min-h-[40px] min-w-[40px] sm:min-h-[34px] sm:min-w-[34px] rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-700 flex items-center justify-center shrink-0"
                              title={`Video call ${member.displayName}`}
                              aria-label={`Video call ${member.displayName}`}
                            >
                              <Video className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {availableNonMemberUsers.length > 0 && (
                  <div className="space-y-1">
                    <div className="px-2 flex items-center justify-between text-[11px] font-semibold text-slate-500">
                      <span>Available Users ({availableNonMemberUsers.length})</span>
                      <span className="font-normal text-[10px] text-slate-400">
                        Add to chat/call
                      </span>
                    </div>
                    {availableNonMemberUsers.map((member) => {
                      const matchingDm = dms.find((d) => d.participantIds.includes(member.uid));
                      const isActive = matchingDm?.id === activeConv?.id;
                      const initials = member.displayName.slice(0, 2).toUpperCase();
                      const effectiveStatus = getEffectiveUserStatus(
                        member,
                        firebaseUser?.uid,
                        presenceNow
                      );
                      const meta = STATUS_META[effectiveStatus];
                      const isAdding = addingMemberUid === member.uid;

                      return (
                        <div
                          key={member.uid}
                          className={`w-full min-h-[56px] px-3 py-2 rounded-xl flex items-center gap-2 transition-colors border ${
                            isActive
                              ? 'bg-sky-50 text-sky-900 border-sky-200'
                              : 'bg-slate-50/70 border-slate-200/70 text-slate-700'
                          }`}
                        >
                          <div className="flex-1 min-w-0 flex items-center gap-3 text-left">
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
                              <div className="text-[11px] text-slate-500 truncate">
                                {member.username ? `@${member.username}` : member.title || meta.label}
                              </div>
                            </div>
                          </div>

                          <button
                            type="button"
                            disabled={isAdding}
                            onClick={() => handleAddMember(member.uid)}
                            className="min-h-[32px] px-2.5 rounded-lg bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white text-[11px] font-semibold flex items-center gap-1 shrink-0 transition-colors"
                            title={`Add ${member.displayName} as a member to message and call`}
                          >
                            {isAdding ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <UserPlus className="w-3 h-3" />
                            )}
                            <span>Add Member</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

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
            <div className="min-h-[3.5rem] py-1.5 bg-white border-b border-slate-200 px-2.5 sm:px-6 flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <button
                  onClick={() => setMobileShowThread(false)}
                  className="md:hidden min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-600 hover:text-slate-900 -ml-1.5 shrink-0"
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
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm sm:text-base font-bold text-slate-900 truncate">
                    {getConversationTitle(activeConv)}
                  </h3>
                  <div className="text-xs text-slate-500 flex items-center gap-1.5 min-w-0">
                    {activeConv.type === 'direct' && partner ? (
                      <>
                        {partner.username && (
                          <span className="font-medium text-slate-600 truncate max-w-[100px] sm:max-w-none">
                            @{partner.username}
                          </span>
                        )}
                        <UserStatusBadge
                          status={getEffectiveUserStatus(partner, firebaseUser?.uid, presenceNow)}
                          compact
                        />
                      </>
                    ) : (
                      <span className="truncate">
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
                      className="inline-flex items-center gap-1 text-emerald-700 hover:underline font-medium shrink-0"
                      title="View encryption verification key"
                      aria-label="Encrypted session verification"
                    >
                      <Lock className="w-3 h-3" />
                      <span className="hidden sm:inline">Encrypted</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                {activeConv.type === 'direct' && partner && !partnerIsMember && (
                  <button
                    type="button"
                    disabled={addingMemberUid === partner.uid}
                    onClick={() => handleAddMember(partner.uid)}
                    className="min-h-[40px] px-2.5 sm:px-3 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shrink-0"
                    title="Add as member to unlock messaging and calling"
                  >
                    {addingMemberUid === partner.uid ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <UserPlus className="w-4 h-4" />
                    )}
                    <span>Add Member</span>
                  </button>
                )}

                {activeConv.type === 'channel' && (
                  <button
                    onClick={openManageMembersModal}
                    className="min-h-[40px] px-2 sm:px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1 sm:gap-1.5 transition-colors shrink-0"
                    title="Add or manage group members"
                  >
                    <UserPlus className="w-4 h-4 text-sky-600" />
                    <span className="hidden sm:inline">Members</span>
                    <span className="tabular-nums text-slate-500">
                      ({activeConv.isPublic ? platformUsers.length + 1 : activeConv.participantIds?.length || 1})
                    </span>
                  </button>
                )}

                <button
                  type="button"
                  disabled={!partnerIsMember}
                  onClick={() =>
                    openMeetingSchedulerWithDraft({
                      title: `${getConversationTitle(activeConv).replace(/^#\s*/, '')} Sync`,
                      participantIds: activeConv.isPublic
                        ? []
                        : (activeConv.participantIds || []).filter((id) => id !== firebaseUser?.uid),
                      mode: 'video',
                    })
                  }
                  className={`min-h-[40px] min-w-[40px] px-2 sm:px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-45 disabled:cursor-not-allowed text-slate-700 text-xs font-semibold items-center justify-center gap-1.5 transition-colors shrink-0 ${
                    partnerIsMember ? 'flex' : 'hidden sm:flex'
                  }`}
                  title={
                    partnerIsMember
                      ? 'Schedule a meeting with these members'
                      : 'Add as member first to schedule a meeting'
                  }
                  aria-label="Schedule meeting"
                >
                  <CalendarPlus className="w-4 h-4 text-sky-600" />
                  <span className="hidden lg:inline">Meeting</span>
                </button>

                <button
                  type="button"
                  disabled={!partnerIsMember}
                  onClick={() =>
                    startVideoCall(
                      `Voice Call: ${getConversationTitle(activeConv)}`,
                      activeConv.isPublic ? undefined : activeConv.participantIds,
                      'voice'
                    )
                  }
                  className={`min-h-[40px] min-w-[40px] px-2.5 sm:px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 disabled:opacity-45 disabled:cursor-not-allowed text-emerald-700 text-xs font-semibold items-center justify-center gap-1.5 transition-colors shrink-0 ${
                    partnerIsMember ? 'flex' : 'hidden sm:flex'
                  }`}
                  title={partnerIsMember ? 'Start Voice Call' : 'Add as member first to voice call'}
                  aria-label="Start Voice Call"
                >
                  <Phone className="w-4 h-4" />
                  <span className="hidden sm:inline">Voice</span>
                </button>

                <button
                  type="button"
                  disabled={!partnerIsMember}
                  onClick={() =>
                    startVideoCall(
                      `Call: ${getConversationTitle(activeConv)}`,
                      activeConv.isPublic ? undefined : activeConv.participantIds,
                      'video'
                    )
                  }
                  className={`min-h-[40px] min-w-[40px] px-2.5 sm:px-3.5 py-2 rounded-xl bg-sky-50 hover:bg-sky-100 disabled:opacity-45 disabled:cursor-not-allowed text-sky-700 text-xs font-semibold items-center justify-center gap-1.5 transition-colors shrink-0 ${
                    partnerIsMember ? 'flex' : 'hidden sm:flex'
                  }`}
                  title={partnerIsMember ? 'Start Video Call' : 'Add as member first to video call'}
                  aria-label="Start Video Call"
                >
                  <Video className="w-4 h-4" />
                  <span className="hidden sm:inline">Video</span>
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
                  const isHighlighted = highlightedMessageId === msg.id;

                  return (
                    <div
                      key={msg.id}
                      id={`chat-msg-${msg.id}`}
                      className={`flex gap-2.5 group transition-all ${
                        isMe ? 'flex-row-reverse' : 'flex-row'
                      } ${
                        isHighlighted
                          ? 'ring-2 ring-amber-400 bg-amber-50/70 rounded-2xl p-2 -m-2'
                          : ''
                      }`}
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
              {activeConv.type === 'direct' && partner && !partnerIsMember ? (
                <div className="p-3 sm:p-3.5 rounded-xl bg-amber-50 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="text-xs text-amber-950 space-y-0.5">
                    <div className="font-bold">Add {partner.displayName} as a member first</div>
                    <p className="text-amber-800">
                      You can view available users on SphereCall, but you must add them as a member before sending messages or starting a voice or video call.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={addingMemberUid === partner.uid}
                    onClick={() => handleAddMember(partner.uid)}
                    className="min-h-[40px] px-4 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white text-xs font-semibold flex items-center justify-center gap-1.5 shrink-0 transition-colors"
                  >
                    {addingMemberUid === partner.uid ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <UserPlus className="w-4 h-4" />
                    )}
                    <span>Add Member</span>
                  </button>
                </div>
              ) : (
                <>
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
                </>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-slate-500">
            Select a group or teammate to start chatting.
          </div>
        )}
      </main>
      </div>

      {/* Manage / View Existing Group Members Modal */}
      {membersModalOpen && activeConv && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md max-h-[90dvh] flex flex-col overflow-hidden">
            <div className="px-4 sm:px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-2 shrink-0">
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
                className="min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-400 hover:text-slate-700 shrink-0"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-5 space-y-3 overflow-y-auto flex-1">
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
                  placeholder="Find by name, @username, or @email..."
                  className="w-full min-h-[40px] bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-9 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-sky-600 focus:bg-white"
                />
                {searchingManageEmail && (
                  <Loader2 className="w-3.5 h-3.5 text-sky-600 animate-spin absolute right-3 top-3" />
                )}
              </div>

              <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-64 overflow-y-auto">
                {manageFilteredUsers.map((member) => {
                  const isOwner = member.uid === activeConv.ownerId;
                  const isIncluded = editingMemberIds.includes(member.uid);
                  const memberAdded = isAddedMember(member.uid);
                  const isAdding = addingMemberUid === member.uid;
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
                        if (canManageActiveGroup && !isOwner && (isIncluded || memberAdded)) {
                          toggleExistingGroupMember(member.uid);
                        }
                      }}
                      className={`w-full min-h-[48px] px-3 py-2 flex items-center justify-between gap-3 text-left transition-colors ${
                        canManageActiveGroup && !isOwner && (isIncluded || memberAdded)
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
                            {member.username && (
                              <span className="font-medium text-slate-600">@{member.username}</span>
                            )}
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
                        isIncluded || memberAdded ? (
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
                          <button
                            type="button"
                            disabled={isAdding}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAddMember(member.uid);
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
                        )
                      ) : (
                        <span className="text-[11px] font-medium text-slate-500 shrink-0">
                          {isIncluded ? 'Member' : ''}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="px-4 sm:px-6 py-4 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => setAddMemberOpen(true)}
                className="min-h-[40px] px-3 rounded-xl text-sky-700 hover:bg-sky-50 text-xs font-semibold flex items-center gap-1.5"
              >
                <UserPlus className="w-4 h-4" />
                <span>Invite New Member</span>
              </button>

              <div className="flex items-center gap-2 ml-auto">
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
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-5 sm:p-6 space-y-4">
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
