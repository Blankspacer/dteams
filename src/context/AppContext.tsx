import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
  User as FirebaseUser,
  onAuthStateChanged,
  signOut as firebaseSignOut,
  reload,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  onSnapshot,
  query,
  where,
  or,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import {
  auth,
  db,
  OperationType,
  handleFirestoreError,
} from '../lib/firebase';
import {
  AppTab,
  ChatMessage,
  Conversation,
  MeetingRecord,
  MeetingTask,
  TeamInvite,
  UserContact,
  UserProfile,
  UserRole,
  UserStatus,
} from '../types';
import { encryptE2EEMessage, generateUserFingerprint } from '../utils/crypto';
import { sounds } from '../utils/audio';
import { formatMoMForChat } from '../utils/transcript';
import {
  formatScheduledValue,
  getSavedTimeZone,
  isValidTimeZone,
  parseScheduledMeeting,
  setSavedTimeZone,
} from '../utils/calendar';
import {
  consumePendingSignupUsername,
  deriveDefaultUsername,
  isValidUsername,
  normalizeUsername,
} from '../utils/username';
import {
  hashEmailForLookup,
  isEmailLookupQuery,
  normalizeSearchToken,
} from '../utils/userLookup';

interface AppContextType {
  firebaseUser: FirebaseUser | null;
  authLoading: boolean;
  currentProfile: UserProfile | null;
  teamUsers: UserProfile[];
  contacts: UserContact[];
  addedMemberIds: string[];
  teamInvites: TeamInvite[];
  conversations: Conversation[];
  activeConversationId: string;
  messages: ChatMessage[];
  meetings: MeetingRecord[];
  activeMeeting: MeetingRecord | null;
  activeCallMode: 'voice' | 'video';
  incomingCall: MeetingRecord | null;
  activeTab: AppTab;
  errorBanner: string | null;
  presenceNow: number;
  lastTranscribedMeetingId: string | null;
  selectedTimezone: string;
  meetingDraft: { title?: string; participantIds?: string[]; mode?: 'voice' | 'video' } | null;
  createGroupModalOpen: boolean;

  setActiveTab: (tab: AppTab) => void;
  setActiveCallMode: (mode: 'voice' | 'video') => void;
  setActiveConversationId: (id: string) => void;
  setErrorBanner: (msg: string | null) => void;
  setLastTranscribedMeetingId: (id: string | null) => void;
  setSelectedTimezone: (tz: string) => Promise<void>;
  openMeetingSchedulerWithDraft: (draft: {
    title?: string;
    participantIds?: string[];
    mode?: 'voice' | 'video';
  }) => void;
  clearMeetingDraft: () => void;
  openCreateGroupModal: () => void;
  closeCreateGroupModal: () => void;
  lookupUserByEmail: (rawQuery: string) => Promise<UserProfile | null>;
  isAddedMember: (uid: string) => boolean;
  refreshAuthUser: () => Promise<boolean>;
  signOut: () => Promise<void>;

  updateMyProfile: (
    updates: Partial<
      Pick<
        UserProfile,
        'displayName' | 'username' | 'timezone' | 'title' | 'department' | 'avatar' | 'status'
      >
    >
  ) => Promise<void>;
  updateMemberPermissions: (
    targetUid: string,
    updates: Partial<Pick<UserProfile, 'role' | 'canCreateMeetings' | 'canRecordMeetings'>>
  ) => Promise<void>;

  createChannel: (
    name: string,
    options?: { memberIds?: string[]; isPublic?: boolean }
  ) => Promise<string>;
  updateGroupMembers: (conversationId: string, memberIds: string[]) => Promise<void>;
  addContact: (targetUid: string) => Promise<void>;
  addContactsAndStartChat: (targetUids: string[]) => Promise<void>;
  removeContact: (targetUid: string) => Promise<void>;
  startDirectChat: (targetUid: string) => Promise<string>;
  sendMessage: (
    content: string,
    attachment?: {
      name: string;
      type: 'image' | 'file';
      size: number;
      data: string;
    }
  ) => Promise<void>;
  removeMessage: (messageId: string) => Promise<void>;
  loadSearchableMessages: (forceRefresh?: boolean) => Promise<ChatMessage[]>;

  startVideoCall: (
    title?: string,
    participantIds?: string[],
    mode?: 'voice' | 'video'
  ) => Promise<MeetingRecord | null>;
  scheduleMeeting: (params: {
    title: string;
    date: string;
    time: string;
    timeZone?: string;
    mode?: 'voice' | 'video';
    participantIds?: string[];
  }) => Promise<MeetingRecord | null>;
  rescheduleMeeting: (
    meetingId: string,
    params: {
      title: string;
      date: string;
      time: string;
      timeZone?: string;
      mode?: 'voice' | 'video';
      participantIds?: string[];
    }
  ) => Promise<void>;
  shareScheduledMeetingToChat: (
    meeting: MeetingRecord,
    conversationId?: string
  ) => Promise<boolean>;
  joinVideoCall: (meeting: MeetingRecord, mode?: 'voice' | 'video') => Promise<void>;
  answerIncomingCall: (meeting: MeetingRecord, mode?: 'voice' | 'video') => Promise<void>;
  declineIncomingCall: (meeting: MeetingRecord) => Promise<void>;
  addCallParticipants: (meetingId: string, participantIds: string[]) => Promise<void>;
  endVideoCall: (meetingId: string, transcriptText?: string) => Promise<void>;
  inviteTeamMember: (data: {
    name: string;
    email: string;
    title?: string;
    department?: string;
  }) => Promise<TeamInvite | null>;
  removeTeamInvite: (inviteId: string) => Promise<void>;
  saveMeetingTranscript: (data: {
    meetingId?: string;
    title: string;
    transcriptText: string;
    aiSummary: string;
    discussionPoints?: string[];
    decisions: string[];
    actionItems: string[];
    tasks?: MeetingTask[];
    momText?: string;
    isPublic?: boolean;
    participantIds?: string[];
  }) => Promise<string>;
  toggleMeetingTask: (meetingId: string, taskIndex: number) => Promise<void>;
  postMomToChat: (meeting: MeetingRecord, conversationId?: string) => Promise<boolean>;
  deleteMeetingRecord: (meetingId: string) => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

function toMillis(ts: unknown): number {
  if (!ts) return 0;
  if (ts instanceof Timestamp) return ts.toMillis();
  if (typeof ts === 'object' && ts !== null && 'seconds' in ts) {
    return ((ts as { seconds: number }).seconds || 0) * 1000;
  }
  return 0;
}

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [currentProfile, setCurrentProfile] = useState<UserProfile | null>(null);
  const [teamUsers, setTeamUsers] = useState<UserProfile[]>([]);
  const [contacts, setContacts] = useState<UserContact[]>([]);
  const [teamInvites, setTeamInvites] = useState<TeamInvite[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [meetings, setMeetings] = useState<MeetingRecord[]>([]);
  const [activeMeeting, setActiveMeeting] = useState<MeetingRecord | null>(null);
  const [activeCallMode, setActiveCallMode] = useState<'voice' | 'video'>('video');
  const [dismissedCallIds, setDismissedCallIds] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<AppTab>('chat');
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [authVersion, setAuthVersion] = useState(0);
  const [presenceNow, setPresenceNow] = useState(() => Date.now());
  const [lastTranscribedMeetingId, setLastTranscribedMeetingId] = useState<string | null>(null);
  const [selectedTimezone, setSelectedTimezoneState] = useState<string>(() => getSavedTimeZone());
  const [meetingDraft, setMeetingDraft] = useState<{
    title?: string;
    participantIds?: string[];
    mode?: 'voice' | 'video';
  } | null>(null);
  const [createGroupModalOpen, setCreateGroupModalOpen] = useState(false);
  const emailLookupCacheRef = useRef<Map<string, { uid: string | null; checkedAt: number }>>(new Map());
  const messageSearchCacheRef = useRef<
    Map<string, { updatedMs: number; fetchedAt: number; messages: ChatMessage[] }>
  >(new Map());
  const manualStatusRef = useRef<UserStatus | null>(null);
  const preCallStatusRef = useRef<UserStatus>('online');
  const wasInCallRef = useRef<boolean>(false);
  const manualInCallOverrideRef = useRef<boolean>(false);
  const currentStatusRef = useRef<UserStatus>('online');
  const activeMeetingRef = useRef<MeetingRecord | null>(null);

  useEffect(() => {
    currentStatusRef.current = currentProfile?.status || 'online';
  }, [currentProfile?.status]);

  useEffect(() => {
    activeMeetingRef.current = activeMeeting;
  }, [activeMeeting]);

  const addedMemberIds = React.useMemo(() => contacts.map((c) => c.uid), [contacts]);

  const isAddedMember = (uid: string): boolean => {
    if (!uid) return false;
    if (firebaseUser && uid === firebaseUser.uid) return true;
    return contacts.some((c) => c.uid === uid);
  };

  const findUnaddedTargetIds = (
    uids: string[] = [],
    allowedExistingIds: string[] = []
  ): string[] => {
    if (!firebaseUser) return [];
    const allowedSet = new Set(allowedExistingIds);
    return Array.from(new Set(uids)).filter(
      (uid) =>
        uid &&
        uid !== firebaseUser.uid &&
        !allowedSet.has(uid) &&
        !contacts.some((c) => c.uid === uid)
    );
  };

  // 1. Auth State Listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setAuthLoading(false);
      if (!user) {
        setCurrentProfile(null);
        setTeamUsers([]);
        setContacts([]);
        setTeamInvites([]);
        setConversations([]);
        setMessages([]);
        setMeetings([]);
        setActiveMeeting(null);
        setActiveCallMode('video');
        setDismissedCallIds([]);
        setActiveConversationId('');
        setMeetingDraft(null);
        setCreateGroupModalOpen(false);
        emailLookupCacheRef.current.clear();
      }
    });
    return () => unsub();
  }, []);

  // 2. Bootstrap Profile & General Channel once authenticated + emailVerified
  useEffect(() => {
    if (!firebaseUser || !firebaseUser.emailVerified) return;

    const uid = firebaseUser.uid;
    const isBootstrappedAdmin = firebaseUser.email === 'sneloy@gmail.com';

    async function ensureUserAndDefaults() {
      const userPath = `users/${uid}`;
      let resolvedDisplayName =
        firebaseUser!.displayName?.trim() ||
        firebaseUser!.email?.split('@')[0] ||
        'Team Member';
      let resolvedUsername = '';
      try {
        const userSnap = await getDoc(doc(db, 'users', uid));
        if (!userSnap.exists()) {
          const pendingHandle = consumePendingSignupUsername(firebaseUser!.email);
          const initialUsername =
            pendingHandle ||
            deriveDefaultUsername(firebaseUser!.email || resolvedDisplayName, uid);
          const initialTimezone = getSavedTimeZone();
          resolvedUsername = initialUsername;

          const profilePayload = {
            uid,
            displayName: resolvedDisplayName.slice(0, 80),
            username: initialUsername,
            timezone: initialTimezone.slice(0, 64),
            title: isBootstrappedAdmin ? 'Team Lead' : 'Team Member',
            department: 'General',
            avatar: (firebaseUser!.photoURL || '').slice(0, 65000),
            status: 'online' as UserStatus,
            role: (isBootstrappedAdmin ? 'admin' : 'member') as UserRole,
            canCreateMeetings: true,
            canRecordMeetings: true,
            e2eeFingerprint: generateUserFingerprint(uid),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };

          await setDoc(doc(db, 'users', uid), profilePayload);
        } else {
          const existingData = userSnap.data() || {};
          resolvedDisplayName = (existingData.displayName as string) || resolvedDisplayName;
          const existingStatus = (existingData.status || 'offline') as UserStatus;
          const updates: Record<string, unknown> = {
            status: existingStatus === 'offline' || existingStatus === 'away' ? 'online' : existingStatus,
            updatedAt: serverTimestamp(),
          };
          if (!existingData.username) {
            const generatedUsername =
              consumePendingSignupUsername(firebaseUser!.email) ||
              deriveDefaultUsername(
                firebaseUser!.email || existingData.displayName || 'user',
                uid
              );
            updates.username = generatedUsername;
            resolvedUsername = generatedUsername;
          } else {
            resolvedUsername = String(existingData.username);
          }
          if (typeof existingData.timezone === 'string' && isValidTimeZone(existingData.timezone)) {
            setSavedTimeZone(existingData.timezone);
            setSelectedTimezoneState(existingData.timezone);
          }
          await updateDoc(doc(db, 'users', uid), updates);
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, userPath);
      }

      const privatePath = `users/${uid}/private/info`;
      try {
        const privateRef = doc(db, 'users', uid, 'private', 'info');
        const privateSnap = await getDoc(privateRef);
        if (!privateSnap.exists() && firebaseUser!.email) {
          await setDoc(privateRef, {
            uid,
            email: firebaseUser!.email.slice(0, 160),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, privatePath);
      }

      if (firebaseUser!.email) {
        const emailHash = await hashEmailForLookup(firebaseUser!.email);
        const lookupPath = `email_lookup/${emailHash}`;
        try {
          const lookupRef = doc(db, 'email_lookup', emailHash);
          const lookupSnap = await getDoc(lookupRef);
          const validHandle = isValidUsername(resolvedUsername) ? resolvedUsername : undefined;
          if (!lookupSnap.exists()) {
            await setDoc(lookupRef, {
              uid,
              displayName: resolvedDisplayName.slice(0, 80),
              ...(validHandle ? { username: validHandle } : {}),
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          } else if (lookupSnap.data()?.uid === uid) {
            await updateDoc(lookupRef, {
              displayName: resolvedDisplayName.slice(0, 80),
              ...(validHandle ? { username: validHandle } : {}),
              updatedAt: serverTimestamp(),
            });
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, lookupPath);
        }
      }

      const generalPath = 'conversations/general';
      try {
        const generalRef = doc(db, 'conversations', 'general');
        const generalSnap = await getDoc(generalRef);
        if (!generalSnap.exists()) {
          await setDoc(generalRef, {
            name: 'general',
            type: 'channel',
            isPublic: true,
            ownerId: uid,
            participantIds: [uid],
            lastMessageText: 'Welcome to the team chat.',
            lastMessageSender: 'System',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      } catch (error) {
        // Re-check in case another teammate created #general concurrently
        try {
          const retrySnap = await getDoc(doc(db, 'conversations', 'general'));
          if (retrySnap.exists()) return;
        } catch {
          // Fall through to structured Firestore error handler
        }
        handleFirestoreError(error, OperationType.WRITE, generalPath);
      }

      // Mark any pending team_invites matching this verified email as joined
      if (firebaseUser!.email) {
        try {
          const inviteSnap = await getDocs(
            query(collection(db, 'team_invites'), where('email', '==', firebaseUser!.email))
          );
          for (const d of inviteSnap.docs) {
            const inv = d.data() as TeamInvite;
            if (inv.status === 'pending') {
              await updateDoc(d.ref, {
                status: 'joined',
                updatedAt: serverTimestamp(),
              });
            }
          }
        } catch {
          // Non-fatal if invite query is unavailable
        }
      }
    }

    ensureUserAndDefaults().catch((err) => {
      setErrorBanner(err instanceof Error ? err.message : 'Database setup error');
    });
  }, [firebaseUser, authVersion]);

  // 3. Subscribe to Team Users
  useEffect(() => {
    if (!firebaseUser || !firebaseUser.emailVerified) return;

    const unsub = onSnapshot(
      collection(db, 'users'),
      (snap) => {
        const list: UserProfile[] = [];
        snap.forEach((d) => {
          list.push(d.data() as UserProfile);
        });
        list.sort((a, b) => a.displayName.localeCompare(b.displayName));
        setTeamUsers(list);
        const me = list.find((u) => u.uid === firebaseUser.uid) || null;
        setCurrentProfile(me);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'users');
      }
    );

    return () => unsub();
  }, [firebaseUser, authVersion]);

  // 3b. Subscribe to Personal Added Contacts
  useEffect(() => {
    if (!firebaseUser || !firebaseUser.emailVerified) return;

    const uid = firebaseUser.uid;
    const contactsPath = `users/${uid}/contacts`;
    const q = query(
      collection(db, 'users', uid, 'contacts'),
      where('addedByUid', '==', uid)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: UserContact[] = [];
        snap.forEach((d) => {
          list.push(d.data() as UserContact);
        });
        list.sort((a, b) => a.displayName.localeCompare(b.displayName));
        setContacts(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, contactsPath);
      }
    );

    return () => unsub();
  }, [firebaseUser, authVersion]);

  // 4. Subscribe to Conversations
  useEffect(() => {
    if (!firebaseUser || !firebaseUser.emailVerified) return;

    const q = query(
      collection(db, 'conversations'),
      or(
        where('isPublic', '==', true),
        where('participantIds', 'array-contains', firebaseUser.uid)
      )
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: Conversation[] = [];
        snap.forEach((d) => {
          list.push({ id: d.id, ...(d.data() as Omit<Conversation, 'id'>) });
        });
        list.sort((a, b) => toMillis(b.updatedAt) - toMillis(a.updatedAt));
        setConversations(list);
        setActiveConversationId((prev) => {
          if (prev && list.some((c) => c.id === prev)) return prev;
          return list[0]?.id || '';
        });
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'conversations');
      }
    );

    return () => unsub();
  }, [firebaseUser, authVersion]);

  // 5. Subscribe to Messages in Active Conversation
  useEffect(() => {
    if (!firebaseUser || !firebaseUser.emailVerified || !activeConversationId) {
      setMessages([]);
      return;
    }

    const msgPath = `conversations/${activeConversationId}/messages`;
    const q = query(
      collection(db, 'conversations', activeConversationId, 'messages'),
      or(
        where('isPublic', '==', true),
        where('participantIds', 'array-contains', firebaseUser.uid)
      )
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: ChatMessage[] = [];
        snap.forEach((d) => {
          list.push({ id: d.id, ...(d.data() as Omit<ChatMessage, 'id'>) });
        });
        list.sort((a, b) => toMillis(a.createdAt) - toMillis(b.createdAt));
        setMessages(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, msgPath);
      }
    );

    return () => unsub();
  }, [firebaseUser, authVersion, activeConversationId]);

  useEffect(() => {
    messageSearchCacheRef.current.clear();
  }, [firebaseUser?.uid]);

  const loadSearchableMessages = async (forceRefresh = false): Promise<ChatMessage[]> => {
    if (!firebaseUser || !firebaseUser.emailVerified) return [];

    const now = Date.now();
    const convResults = await Promise.all(
      conversations.map(async (conv) => {
        if (conv.id === activeConversationId) {
          messageSearchCacheRef.current.set(conv.id, {
            updatedMs: toMillis(conv.updatedAt),
            fetchedAt: now,
            messages,
          });
          return messages;
        }

        const updatedMs = toMillis(conv.updatedAt);
        const cached = messageSearchCacheRef.current.get(conv.id);
        if (
          !forceRefresh &&
          cached &&
          cached.updatedMs === updatedMs &&
          now - cached.fetchedAt < 60_000
        ) {
          return cached.messages;
        }

        try {
          const q = query(
            collection(db, 'conversations', conv.id, 'messages'),
            or(
              where('isPublic', '==', true),
              where('participantIds', 'array-contains', firebaseUser.uid)
            )
          );
          const snap = await getDocs(q);
          const list: ChatMessage[] = [];
          snap.forEach((d) => {
            list.push({ id: d.id, ...(d.data() as Omit<ChatMessage, 'id'>) });
          });
          list.sort((a, b) => toMillis(a.createdAt) - toMillis(b.createdAt));
          messageSearchCacheRef.current.set(conv.id, {
            updatedMs,
            fetchedAt: now,
            messages: list,
          });
          return list;
        } catch (err) {
          console.warn(`Could not load search messages for ${conv.id}:`, err);
          return cached?.messages || [];
        }
      })
    );

    const combined = convResults.flat();
    combined.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
    return combined;
  };

  // 6. Subscribe to Meetings & Transcripts
  useEffect(() => {
    if (!firebaseUser || !firebaseUser.emailVerified) return;

    const q = query(
      collection(db, 'meetings'),
      or(
        where('isPublic', '==', true),
        where('participantIds', 'array-contains', firebaseUser.uid)
      )
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: MeetingRecord[] = [];
        snap.forEach((d) => {
          list.push({ id: d.id, ...(d.data() as Omit<MeetingRecord, 'id'>) });
        });
        list.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
        setMeetings(list);
        setActiveMeeting((curr) => {
          if (!curr) return null;
          const latest = list.find((m) => m.id === curr.id);
          if (!latest) return curr;
          if (latest.status === 'completed') {
            sounds.playLeaveMeeting();
            return null;
          }
          return latest;
        });
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'meetings');
      }
    );

    return () => unsub();
  }, [firebaseUser, authVersion]);

  // 7. Subscribe to Team Invites sent by user (or all for admins)
  useEffect(() => {
    if (!firebaseUser || !firebaseUser.emailVerified) return;

    const isAdminUser =
      currentProfile?.role === 'admin' || firebaseUser.email === 'sneloy@gmail.com';
    const q = isAdminUser
      ? collection(db, 'team_invites')
      : query(
          collection(db, 'team_invites'),
          where('invitedByUid', '==', firebaseUser.uid)
        );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: TeamInvite[] = [];
        snap.forEach((d) => {
          list.push({ id: d.id, ...(d.data() as Omit<TeamInvite, 'id'>) });
        });
        list.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
        setTeamInvites(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'team_invites');
      }
    );

    return () => unsub();
  }, [firebaseUser, authVersion, currentProfile?.role]);

  // 8. Live Presence Heartbeat, Idle Away Detection, and Call Busy Sync
  useEffect(() => {
    const clock = setInterval(() => setPresenceNow(Date.now()), 30000);
    return () => clearInterval(clock);
  }, []);

  useEffect(() => {
    if (!firebaseUser || !firebaseUser.emailVerified || !currentProfile) return;
    const uid = firebaseUser.uid;
    let lastActivityAt = Date.now();
    let lastPingAt = Date.now();

    const pushPresence = async (nextStatus?: UserStatus) => {
      const targetStatus = nextStatus || currentStatusRef.current;
      if (targetStatus === 'offline' && !nextStatus) return;
      try {
        lastPingAt = Date.now();
        await updateDoc(doc(db, 'users', uid), {
          status: targetStatus,
          updatedAt: serverTimestamp(),
        });
      } catch {
        // Ignore transient background presence ping errors
      }
    };

    const handleActivity = () => {
      lastActivityAt = Date.now();
      if (
        document.visibilityState === 'visible' &&
        !manualStatusRef.current &&
        !activeMeetingRef.current &&
        currentStatusRef.current === 'away'
      ) {
        pushPresence('online');
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        lastActivityAt = Date.now();
        if (!manualStatusRef.current && !activeMeetingRef.current && currentStatusRef.current === 'away') {
          pushPresence('online');
        } else if (Date.now() - lastPingAt > 20000 && currentStatusRef.current !== 'offline') {
          pushPresence();
        }
      }
    };

    const handlePageHide = () => {
      if (currentStatusRef.current !== 'offline') {
        updateDoc(doc(db, 'users', uid), {
          status: 'offline',
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      }
    };

    const heartbeat = setInterval(() => {
      const idleMs = Date.now() - lastActivityAt;
      const isHidden = document.visibilityState === 'hidden';
      if (
        (isHidden || idleMs > 3 * 60 * 1000) &&
        !manualStatusRef.current &&
        !activeMeetingRef.current &&
        currentStatusRef.current === 'online'
      ) {
        pushPresence('away');
        return;
      }
      if (!isHidden && currentStatusRef.current !== 'offline') {
        pushPresence();
      }
    }, 45000);

    window.addEventListener('pointerdown', handleActivity, { passive: true });
    window.addEventListener('keydown', handleActivity, { passive: true });
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      clearInterval(heartbeat);
      window.removeEventListener('pointerdown', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [firebaseUser?.uid, firebaseUser?.emailVerified, Boolean(currentProfile)]);

  // Auto-mark user as Busy during active calls and restore previous status when call ends
  useEffect(() => {
    if (!firebaseUser || !firebaseUser.emailVerified || !currentProfile) return;

    const uid = firebaseUser.uid;
    if (activeMeeting) {
      if (!wasInCallRef.current) {
        wasInCallRef.current = true;
        manualInCallOverrideRef.current = false;
        preCallStatusRef.current =
          currentProfile.status !== 'busy' ? currentProfile.status : manualStatusRef.current || 'online';
      }
      if (currentProfile.status !== 'busy' && !manualInCallOverrideRef.current) {
        updateDoc(doc(db, 'users', uid), {
          status: 'busy',
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      }
    } else if (wasInCallRef.current) {
      wasInCallRef.current = false;
      manualInCallOverrideRef.current = false;
      const restoreStatus =
        preCallStatusRef.current && preCallStatusRef.current !== 'busy'
          ? preCallStatusRef.current
          : 'online';
      if (currentProfile.status === 'busy') {
        updateDoc(doc(db, 'users', uid), {
          status: restoreStatus,
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      }
    }
  }, [Boolean(activeMeeting), currentProfile?.status, firebaseUser?.uid, firebaseUser?.emailVerified]);

  const refreshAuthUser = async (): Promise<boolean> => {
    if (!auth.currentUser) return false;
    await reload(auth.currentUser);
    if (auth.currentUser.emailVerified) {
      // Force refresh ID token so Firestore rules see updated email_verified claim
      await auth.currentUser.getIdToken(true);
    }
    setFirebaseUser(auth.currentUser);
    setAuthVersion((v) => v + 1);
    return auth.currentUser.emailVerified;
  };

  const signOut = async () => {
    manualStatusRef.current = null;
    setActiveMeeting(null);
    setErrorBanner(null);

    if (currentProfile && firebaseUser?.emailVerified) {
      try {
        await Promise.race([
          updateDoc(doc(db, 'users', currentProfile.uid), {
            status: 'offline',
            updatedAt: serverTimestamp(),
          }),
          new Promise((resolve) => setTimeout(resolve, 1000)),
        ]);
      } catch {
        // Ignore offline status update failures on sign out
      }
    }

    await firebaseSignOut(auth);
    setActiveTab('chat');
  };

  const setSelectedTimezone = async (tz: string) => {
    if (!isValidTimeZone(tz)) return;
    setSavedTimeZone(tz);
    setSelectedTimezoneState(tz);
    if (firebaseUser?.uid && firebaseUser.emailVerified) {
      try {
        await updateDoc(doc(db, 'users', firebaseUser.uid), {
          timezone: tz.slice(0, 64),
          updatedAt: serverTimestamp(),
        });
      } catch {
        // Non-fatal; localStorage still persists timezone
      }
    }
  };

  const updateMyProfile = async (
    updates: Partial<
      Pick<
        UserProfile,
        'displayName' | 'username' | 'timezone' | 'title' | 'department' | 'avatar' | 'status'
      >
    >
  ) => {
    if (!firebaseUser) return;
    if (updates.status) {
      manualStatusRef.current = updates.status === 'online' ? null : updates.status;
      if (activeMeetingRef.current) {
        manualInCallOverrideRef.current = true;
      }
    }

    const sanitizedUpdates: Record<string, unknown> = { ...updates };
    if (typeof updates.avatar === 'string') {
      sanitizedUpdates.avatar = updates.avatar.slice(0, 65000);
    }
    if (typeof updates.username === 'string') {
      const cleanUsername = normalizeUsername(updates.username);
      if (!isValidUsername(cleanUsername)) {
        throw new Error(
          'Username must be 3–30 characters using lowercase letters, numbers, "_", ".", or "-".'
        );
      }
      const duplicate = teamUsers.some(
        (u) =>
          u.uid !== firebaseUser.uid &&
          (u.username || '').toLowerCase() === cleanUsername
      );
      if (duplicate) {
        throw new Error(`@${cleanUsername} is already taken. Please choose another username.`);
      }
      sanitizedUpdates.username = cleanUsername;
    }
    if (typeof updates.timezone === 'string') {
      if (isValidTimeZone(updates.timezone)) {
        setSavedTimeZone(updates.timezone);
        setSelectedTimezoneState(updates.timezone);
        sanitizedUpdates.timezone = updates.timezone.slice(0, 64);
      } else {
        delete sanitizedUpdates.timezone;
      }
    }

    const path = `users/${firebaseUser.uid}`;
    try {
      await updateDoc(doc(db, 'users', firebaseUser.uid), {
        ...sanitizedUpdates,
        updatedAt: serverTimestamp(),
      });
      if (
        firebaseUser.email &&
        (typeof sanitizedUpdates.displayName === 'string' ||
          typeof sanitizedUpdates.username === 'string')
      ) {
        try {
          const emailHash = await hashEmailForLookup(firebaseUser.email);
          const lookupRef = doc(db, 'email_lookup', emailHash);
          const lookupSnap = await getDoc(lookupRef);
          const nextName = (
            (sanitizedUpdates.displayName as string) ||
            currentProfile?.displayName ||
            firebaseUser.displayName ||
            'Member'
          ).slice(0, 80);
          const nextUsername =
            (sanitizedUpdates.username as string) || currentProfile?.username;
          const validHandle =
            typeof nextUsername === 'string' && isValidUsername(nextUsername)
              ? nextUsername
              : undefined;
          if (lookupSnap.exists() && lookupSnap.data()?.uid === firebaseUser.uid) {
            await updateDoc(lookupRef, {
              displayName: nextName,
              ...(validHandle ? { username: validHandle } : {}),
              updatedAt: serverTimestamp(),
            });
          } else if (!lookupSnap.exists()) {
            await setDoc(lookupRef, {
              uid: firebaseUser.uid,
              displayName: nextName,
              ...(validHandle ? { username: validHandle } : {}),
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }
        } catch {
          // Non-fatal; directory profile is already updated
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  const updateMemberPermissions = async (
    targetUid: string,
    updates: Partial<Pick<UserProfile, 'role' | 'canCreateMeetings' | 'canRecordMeetings'>>
  ) => {
    const path = `users/${targetUid}`;
    try {
      await updateDoc(doc(db, 'users', targetUid), {
        ...updates,
        updatedAt: serverTimestamp(),
      });
      if (updates.role === 'admin') {
        const adminRef = doc(db, 'admins', targetUid);
        const adminSnap = await getDoc(adminRef);
        if (!adminSnap.exists()) {
          await setDoc(adminRef, {
            uid: targetUid,
            createdAt: serverTimestamp(),
          });
        }
      } else if (updates.role === 'member') {
        const adminRef = doc(db, 'admins', targetUid);
        const adminSnap = await getDoc(adminRef);
        if (adminSnap.exists()) {
          await deleteDoc(adminRef);
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  const createChannel = async (
    name: string,
    options?: { memberIds?: string[]; isPublic?: boolean }
  ): Promise<string> => {
    if (!firebaseUser) return '';
    const unadded = findUnaddedTargetIds(options?.memberIds || []);
    if (unadded.length > 0) {
      throw new Error('Please add users as members first before adding them to a group.');
    }

    const cleanName = name.trim().replace(/^#/, '').slice(0, 100);
    if (!cleanName) return '';
    const convId = `grp-${Date.now().toString(36)}`;
    const path = `conversations/${convId}`;
    const isPublic = options?.isPublic ?? false;
    const participantIds = Array.from(
      new Set([firebaseUser.uid, ...(options?.memberIds || [])])
    ).slice(0, 50);

    try {
      await setDoc(doc(db, 'conversations', convId), {
        name: cleanName,
        type: 'channel',
        isPublic,
        ownerId: firebaseUser.uid,
        participantIds,
        lastMessageText:
          participantIds.length > 1
            ? `Group created with ${participantIds.length} members`
            : 'Group created',
        lastMessageSender: (currentProfile?.displayName || firebaseUser.displayName || 'Member').slice(0, 80),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setActiveConversationId(convId);
      setActiveTab('chat');
      return convId;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  };

  const updateGroupMembers = async (conversationId: string, memberIds: string[]) => {
    if (!firebaseUser) return;
    const conv = conversations.find((c) => c.id === conversationId);
    if (!conv) return;

    const unadded = findUnaddedTargetIds(memberIds, conv.participantIds || []);
    if (unadded.length > 0) {
      throw new Error('Please add users as members first before adding them to a group.');
    }

    const isAdminUser =
      currentProfile?.role === 'admin' || firebaseUser.email === 'sneloy@gmail.com';

    const uniqueMembers = Array.from(
      new Set([conv.ownerId, ...(isAdminUser ? [] : [firebaseUser.uid]), ...memberIds])
    ).slice(0, 50);

    const path = `conversations/${conversationId}`;
    try {
      const messagesCol = collection(db, 'conversations', conversationId, 'messages');
      const msgQuery = isAdminUser
        ? messagesCol
        : query(
            messagesCol,
            or(
              where('isPublic', '==', true),
              where('participantIds', 'array-contains', firebaseUser.uid)
            )
          );
      const msgSnap = await getDocs(msgQuery);
      const msgDocs = msgSnap.docs;

      const chunkSize = 400;
      const firstChunk = msgDocs.slice(0, chunkSize);
      const batch = writeBatch(db);
      batch.update(doc(db, 'conversations', conversationId), {
        participantIds: uniqueMembers,
        updatedAt: serverTimestamp(),
      });
      firstChunk.forEach((d) => {
        batch.update(d.ref, { participantIds: uniqueMembers });
      });
      await batch.commit();

      for (let i = chunkSize; i < msgDocs.length; i += chunkSize) {
        const nextBatch = writeBatch(db);
        msgDocs.slice(i, i + chunkSize).forEach((d) => {
          nextBatch.update(d.ref, { participantIds: uniqueMembers });
        });
        await nextBatch.commit();
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  const openMeetingSchedulerWithDraft = (draft: {
    title?: string;
    participantIds?: string[];
    mode?: 'voice' | 'video';
  }) => {
    setMeetingDraft(draft);
    setActiveTab('calendar');
  };

  const clearMeetingDraft = () => {
    setMeetingDraft(null);
  };

  const openCreateGroupModal = () => {
    setCreateGroupModalOpen(true);
  };

  const closeCreateGroupModal = () => {
    setCreateGroupModalOpen(false);
  };

  const lookupUserByEmail = async (rawQuery: string): Promise<UserProfile | null> => {
    if (!firebaseUser || !firebaseUser.emailVerified) return null;
    const cleanEmail = normalizeSearchToken(rawQuery);
    if (!isEmailLookupQuery(cleanEmail)) return null;

    if (firebaseUser.email?.toLowerCase() === cleanEmail && currentProfile) {
      return currentProfile;
    }

    const cached = emailLookupCacheRef.current.get(cleanEmail);
    if (cached) {
      if (cached.uid) {
        const hit = teamUsers.find((u) => u.uid === cached.uid);
        if (hit) return hit;
      } else if (Date.now() - cached.checkedAt < 10_000) {
        return null;
      }
    }

    const emailHash = await hashEmailForLookup(cleanEmail);
    const lookupPath = `email_lookup/${emailHash}`;
    try {
      const snap = await getDoc(doc(db, 'email_lookup', emailHash));
      if (!snap.exists()) {
        emailLookupCacheRef.current.set(cleanEmail, { uid: null, checkedAt: Date.now() });
        return null;
      }
      const targetUid = snap.data()?.uid as string;
      if (!targetUid) return null;
      emailLookupCacheRef.current.set(cleanEmail, { uid: targetUid, checkedAt: Date.now() });

      const fromList = teamUsers.find((u) => u.uid === targetUid);
      if (fromList) return fromList;

      const userSnap = await getDoc(doc(db, 'users', targetUid));
      return userSnap.exists() ? (userSnap.data() as UserProfile) : null;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, lookupPath);
    }
  };

  const ensureContactExists = async (targetUid: string) => {
    if (!firebaseUser || targetUid === firebaseUser.uid) return;
    if (contacts.some((c) => c.uid === targetUid)) return;
    const path = `users/${firebaseUser.uid}/contacts/${targetUid}`;
    let targetName = teamUsers.find((u) => u.uid === targetUid)?.displayName;
    if (!targetName) {
      try {
        const userSnap = await getDoc(doc(db, 'users', targetUid));
        if (userSnap.exists()) {
          targetName = (userSnap.data()?.displayName as string) || undefined;
        }
      } catch {
        // Fallback below
      }
    }
    const cleanName = (targetName || 'Team Member').slice(0, 80);
    try {
      const contactRef = doc(db, 'users', firebaseUser.uid, 'contacts', targetUid);
      const existingSnap = await getDoc(contactRef);
      if (!existingSnap.exists()) {
        await setDoc(contactRef, {
          uid: targetUid,
          addedByUid: firebaseUser.uid,
          displayName: cleanName,
          createdAt: serverTimestamp(),
        });
      }
      setContacts((prev) => {
        if (prev.some((c) => c.uid === targetUid)) return prev;
        return [
          ...prev,
          {
            uid: targetUid,
            addedByUid: firebaseUser.uid,
            displayName: cleanName,
          },
        ].sort((a, b) => a.displayName.localeCompare(b.displayName));
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  };

  const addContact = async (targetUid: string) => {
    await ensureContactExists(targetUid);
  };

  const removeContact = async (targetUid: string) => {
    if (!firebaseUser) return;
    const path = `users/${firebaseUser.uid}/contacts/${targetUid}`;
    try {
      await deleteDoc(doc(db, 'users', firebaseUser.uid, 'contacts', targetUid));
      setContacts((prev) => prev.filter((c) => c.uid !== targetUid));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  const openOrCreateDirectChat = async (
    targetUid: string,
    verifiedAdded = false
  ): Promise<string> => {
    if (!firebaseUser || targetUid === firebaseUser.uid) return '';

    const pair = [firebaseUser.uid, targetUid].sort();
    const convId = `dm-${pair[0].slice(0, 20)}-${pair[1].slice(0, 20)}`;
    const existing = conversations.find((c) => c.id === convId);

    if (!verifiedAdded && !contacts.some((c) => c.uid === targetUid)) {
      if (existing) {
        setActiveConversationId(existing.id);
        setActiveTab('chat');
        return existing.id;
      }
      setErrorBanner('Please add this user as a member first before sending messages.');
      return '';
    }

    if (existing) {
      setActiveConversationId(existing.id);
      setActiveTab('chat');
      return existing.id;
    }

    const target = teamUsers.find((u) => u.uid === targetUid);
    const path = `conversations/${convId}`;
    try {
      await setDoc(doc(db, 'conversations', convId), {
        name: target?.displayName || 'Direct Message',
        type: 'direct',
        isPublic: false,
        ownerId: firebaseUser.uid,
        participantIds: pair,
        lastMessageText: 'Direct encrypted chat started',
        lastMessageSender: currentProfile?.displayName || 'Member',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setActiveConversationId(convId);
      setActiveTab('chat');
      return convId;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  };

  const startDirectChat = async (targetUid: string): Promise<string> => {
    return openOrCreateDirectChat(targetUid, false);
  };

  const addContactsAndStartChat = async (targetUids: string[]) => {
    if (!firebaseUser) return;
    const unique = Array.from(new Set(targetUids)).filter(
      (id) => id && id !== firebaseUser.uid
    );
    for (const targetUid of unique) {
      await ensureContactExists(targetUid);
    }
    if (unique.length > 0) {
      await openOrCreateDirectChat(unique[0], true);
    }
  };

  const sendMessage = async (
    content: string,
    attachment?: {
      name: string;
      type: 'image' | 'file';
      size: number;
      data: string;
    }
  ) => {
    if (!firebaseUser || !activeConversationId) return;
    const conv = conversations.find((c) => c.id === activeConversationId);
    if (!conv) return;

    if (conv.type === 'direct') {
      const partnerUid = conv.participantIds.find((id) => id !== firebaseUser.uid);
      if (partnerUid && !contacts.some((c) => c.uid === partnerUid)) {
        setErrorBanner('Please add this user as a member first before sending messages.');
        return;
      }
    }

    const trimmed = content.trim().slice(0, 5000);
    if (!trimmed && !attachment) return;

    const msgId = `msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const path = `conversations/${activeConversationId}/messages/${msgId}`;

    let ciphertext = '';
    let iv = '';
    if (trimmed) {
      try {
        const encrypted = await encryptE2EEMessage(trimmed, `conv-${activeConversationId}`);
        ciphertext = encrypted.ciphertext.slice(0, 10000);
        iv = encrypted.iv.slice(0, 128);
      } catch {
        // Fallback if WebCrypto unavailable
      }
    }

    try {
      await setDoc(doc(db, 'conversations', activeConversationId, 'messages', msgId), {
        conversationId: activeConversationId,
        senderId: firebaseUser.uid,
        senderName: (currentProfile?.displayName || firebaseUser.displayName || 'Member').slice(0, 80),
        senderAvatar: (currentProfile?.avatar || firebaseUser.photoURL || '').slice(0, 65000),
        content: trimmed || (attachment ? `Shared ${attachment.name}` : ''),
        ciphertext,
        iv,
        attachmentName: attachment ? attachment.name.slice(0, 200) : '',
        attachmentType: attachment ? attachment.type : 'none',
        attachmentSize: attachment ? attachment.size : 0,
        attachmentData: attachment ? attachment.data.slice(0, 700000) : '',
        isPublic: conv.isPublic,
        participantIds: conv.participantIds,
        createdAt: serverTimestamp(),
      });

      await updateDoc(doc(db, 'conversations', activeConversationId), {
        lastMessageText: (attachment ? `File: ${attachment.name}` : trimmed).slice(0, 500),
        lastMessageSender: (currentProfile?.displayName || 'Member').slice(0, 80),
        updatedAt: serverTimestamp(),
      });

      sounds.playMessageNotification();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  };

  const removeMessage = async (messageId: string) => {
    if (!activeConversationId) return;
    const path = `conversations/${activeConversationId}/messages/${messageId}`;
    try {
      await deleteDoc(doc(db, 'conversations', activeConversationId, 'messages', messageId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  const startVideoCall = async (
    title?: string,
    participantIds?: string[],
    mode: 'voice' | 'video' = 'video'
  ): Promise<MeetingRecord | null> => {
    if (!firebaseUser) return null;
    if (participantIds && participantIds.length > 0) {
      const unadded = findUnaddedTargetIds(participantIds);
      if (unadded.length > 0) {
        setErrorBanner('Please add users as members first before calling or video calling them.');
        return null;
      }
    }

    const meetingId = `meet-${Date.now().toString(36)}`;
    const path = `meetings/${meetingId}`;
    const participants = Array.from(
      new Set([firebaseUser.uid, ...(participantIds || [])])
    ).slice(0, 50);

    const defaultTitle =
      mode === 'voice'
        ? `${currentProfile?.displayName || 'Team'} Voice Call`
        : `${currentProfile?.displayName || 'Team'} Video Call`;

    const record: Omit<MeetingRecord, 'id'> = {
      title: (title || defaultTitle).slice(0, 150),
      organizerId: firebaseUser.uid,
      organizerName: (currentProfile?.displayName || firebaseUser.displayName || 'Member').slice(0, 80),
      status: 'live',
      scheduledTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isPublic: !participantIds || participantIds.length === 0,
      participantIds: participants,
      transcriptText: '',
      aiSummary: '',
      discussionPoints: [],
      decisions: [],
      actionItems: [],
      tasks: [],
      momText: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    try {
      if (currentProfile && currentProfile.status !== 'busy') {
        preCallStatusRef.current = currentProfile.status;
      }
      wasInCallRef.current = true;
      manualInCallOverrideRef.current = false;
      updateDoc(doc(db, 'users', firebaseUser.uid), {
        status: 'busy',
        updatedAt: serverTimestamp(),
      }).catch(() => {});

      await setDoc(doc(db, 'meetings', meetingId), record);
      const created: MeetingRecord = { id: meetingId, ...record };
      setActiveCallMode(mode);
      setActiveMeeting(created);
      setActiveTab('video');
      sounds.playJoinMeeting();
      return created;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  };

  const findConflictingScheduledMeeting = (
    dateKey: string,
    time24: string,
    tz: string,
    excludeMeetingId?: string
  ): MeetingRecord | null => {
    const candidateIso = formatScheduledValue(dateKey, time24, tz);
    const candidateParsed = parseScheduledMeeting(candidateIso, tz);
    for (const m of meetings) {
      if (m.status !== 'upcoming' && m.status !== 'live') continue;
      if (excludeMeetingId && m.id === excludeMeetingId) continue;
      const existingParsed = parseScheduledMeeting(m.scheduledTime, tz);
      if (!existingParsed) continue;
      const sameWallSlot =
        existingParsed.dateKey === dateKey && existingParsed.time24 === time24;
      const sameInstant =
        Boolean(candidateParsed) &&
        Math.abs(existingParsed.sortValue - candidateParsed!.sortValue) < 60_000;
      if (sameWallSlot || sameInstant) {
        return m;
      }
    }
    return null;
  };

  const scheduleMeeting = async (params: {
    title: string;
    date: string;
    time: string;
    timeZone?: string;
    mode?: 'voice' | 'video';
    participantIds?: string[];
  }): Promise<MeetingRecord | null> => {
    if (!firebaseUser) return null;
    if (params.participantIds && params.participantIds.length > 0) {
      const unadded = findUnaddedTargetIds(params.participantIds);
      if (unadded.length > 0) {
        throw new Error('Please add users as members first before inviting them to a meeting.');
      }
    }

    const tz = params.timeZone || selectedTimezone;
    const conflict = findConflictingScheduledMeeting(params.date, params.time, tz);
    if (conflict) {
      throw new Error(
        `You can't add 2 meetings at the same time. "${conflict.title}" is already scheduled for that time.`
      );
    }

    const mode = params.mode || 'video';
    const baseTitle = params.title.trim() || (mode === 'voice' ? 'Scheduled Voice Call' : 'Scheduled Team Meeting');
    const finalTitle =
      mode === 'voice' && !baseTitle.toLowerCase().includes('voice')
        ? `Voice Call: ${baseTitle}`
        : baseTitle;
    const participants = Array.from(
      new Set([firebaseUser.uid, ...(params.participantIds || [])])
    ).slice(0, 50);
    const meetingId = `meet-${Date.now().toString(36)}`;
    const path = `meetings/${meetingId}`;

    const record: Omit<MeetingRecord, 'id'> = {
      title: finalTitle.slice(0, 150),
      organizerId: firebaseUser.uid,
      organizerName: (currentProfile?.displayName || firebaseUser.displayName || 'Member').slice(0, 80),
      status: 'upcoming',
      scheduledTime: formatScheduledValue(params.date, params.time, tz),
      isPublic: !params.participantIds || params.participantIds.length === 0,
      participantIds: participants,
      transcriptText: '',
      aiSummary: '',
      discussionPoints: [],
      decisions: [],
      actionItems: [],
      tasks: [],
      momText: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    try {
      await setDoc(doc(db, 'meetings', meetingId), record);
      return { id: meetingId, ...record };
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  };

  const rescheduleMeeting = async (
    meetingId: string,
    params: {
      title: string;
      date: string;
      time: string;
      timeZone?: string;
      mode?: 'voice' | 'video';
      participantIds?: string[];
    }
  ) => {
    if (!firebaseUser) return;
    if (params.participantIds && params.participantIds.length > 0) {
      const existingMeeting = meetings.find((m) => m.id === meetingId);
      const unadded = findUnaddedTargetIds(
        params.participantIds,
        existingMeeting?.participantIds || []
      );
      if (unadded.length > 0) {
        throw new Error('Please add users as members first before inviting them to a meeting.');
      }
    }

    const tz = params.timeZone || selectedTimezone;
    const conflict = findConflictingScheduledMeeting(params.date, params.time, tz, meetingId);
    if (conflict) {
      throw new Error(
        `You can't add 2 meetings at the same time. "${conflict.title}" is already scheduled for that time.`
      );
    }

    const mode = params.mode || 'video';
    const rawTitle = params.title.trim() || (mode === 'voice' ? 'Scheduled Voice Call' : 'Scheduled Team Meeting');
    const cleanedTitle = rawTitle.replace(/^Voice Call:\s*/i, '');
    const finalTitle = mode === 'voice' ? `Voice Call: ${cleanedTitle}` : cleanedTitle;
    const participants = Array.from(
      new Set([firebaseUser.uid, ...(params.participantIds || [])])
    ).slice(0, 50);
    const path = `meetings/${meetingId}`;

    try {
      await updateDoc(doc(db, 'meetings', meetingId), {
        title: finalTitle.slice(0, 150),
        scheduledTime: formatScheduledValue(params.date, params.time, tz),
        isPublic: !params.participantIds || params.participantIds.length === 0,
        participantIds: participants,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  const shareScheduledMeetingToChat = async (
    meeting: MeetingRecord,
    conversationId?: string
  ): Promise<boolean> => {
    if (!firebaseUser) return false;
    const targetConv =
      (conversationId && conversations.find((c) => c.id === conversationId)) ||
      conversations.find((c) => c.id === 'general') ||
      conversations[0];
    if (!targetConv) return false;

    const parsed = parseScheduledMeeting(meeting.scheduledTime, selectedTimezone);
    const whenText = parsed ? parsed.displayFull : meeting.scheduledTime || 'Upcoming';
    const typeLabel = meeting.title.toLowerCase().includes('voice') ? 'Voice Call' : 'Video Meeting';
    const text = `Scheduled ${typeLabel}: "${meeting.title}"\nDate & Time: ${whenText}\nOrganizer: ${meeting.organizerName}\nOpen the Calendar or Calls tab to join when it starts.`.slice(0, 5000);

    const msgId = `msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const path = `conversations/${targetConv.id}/messages/${msgId}`;
    let ciphertext = '';
    let iv = '';
    try {
      const encrypted = await encryptE2EEMessage(text, `conv-${targetConv.id}`);
      ciphertext = encrypted.ciphertext.slice(0, 10000);
      iv = encrypted.iv.slice(0, 128);
    } catch {
      // Fallback
    }

    try {
      await setDoc(doc(db, 'conversations', targetConv.id, 'messages', msgId), {
        conversationId: targetConv.id,
        senderId: firebaseUser.uid,
        senderName: (currentProfile?.displayName || firebaseUser.displayName || 'Member').slice(0, 80),
        senderAvatar: (currentProfile?.avatar || firebaseUser.photoURL || '').slice(0, 65000),
        content: text,
        ciphertext,
        iv,
        attachmentName: '',
        attachmentType: 'none',
        attachmentSize: 0,
        attachmentData: '',
        isPublic: targetConv.isPublic,
        participantIds: targetConv.participantIds,
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'conversations', targetConv.id), {
        lastMessageText: `Scheduled: ${meeting.title} (${whenText})`.slice(0, 500),
        lastMessageSender: (currentProfile?.displayName || 'Member').slice(0, 80),
        updatedAt: serverTimestamp(),
      });
      setActiveConversationId(targetConv.id);
      sounds.playMessageNotification();
      return true;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  };

  const joinVideoCall = async (meeting: MeetingRecord, mode?: 'voice' | 'video') => {
    if (!firebaseUser) return;
    setDismissedCallIds((prev) => (prev.includes(meeting.id) ? prev : [...prev, meeting.id]));
    const updatedParticipants = Array.from(
      new Set([...meeting.participantIds, firebaseUser.uid])
    ).slice(0, 50);
    const inferredMode: 'voice' | 'video' =
      mode || (meeting.title.toLowerCase().includes('voice') ? 'voice' : 'video');
    const path = `meetings/${meeting.id}`;
    try {
      if (currentProfile && currentProfile.status !== 'busy') {
        preCallStatusRef.current = currentProfile.status;
      }
      wasInCallRef.current = true;
      manualInCallOverrideRef.current = false;
      updateDoc(doc(db, 'users', firebaseUser.uid), {
        status: 'busy',
        updatedAt: serverTimestamp(),
      }).catch(() => {});

      await updateDoc(doc(db, 'meetings', meeting.id), {
        status: 'live',
        participantIds: updatedParticipants,
        updatedAt: serverTimestamp(),
      });
      setActiveCallMode(inferredMode);
      setActiveMeeting({ ...meeting, status: 'live', participantIds: updatedParticipants });
      setActiveTab('video');
      sounds.playJoinMeeting();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  const answerIncomingCall = async (meeting: MeetingRecord, mode?: 'voice' | 'video') => {
    await joinVideoCall(meeting, mode);
  };

  const declineIncomingCall = async (meeting: MeetingRecord) => {
    if (!firebaseUser) return;
    setDismissedCallIds((prev) => (prev.includes(meeting.id) ? prev : [...prev, meeting.id]));
    sounds.playLeaveMeeting();
    const path = `meetings/${meeting.id}`;
    try {
      if (!meeting.isPublic && meeting.participantIds.length <= 2) {
        await updateDoc(doc(db, 'meetings', meeting.id), {
          status: 'completed',
          updatedAt: serverTimestamp(),
        });
      } else {
        const remaining = meeting.participantIds.filter((id) => id !== firebaseUser.uid);
        if (remaining.length >= 1) {
          await updateDoc(doc(db, 'meetings', meeting.id), {
            participantIds: remaining,
            updatedAt: serverTimestamp(),
          });
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  const addCallParticipants = async (meetingId: string, participantIds: string[]) => {
    if (!firebaseUser) return;
    const meeting = meetings.find((m) => m.id === meetingId) || activeMeeting;
    if (!meeting) return;

    const unadded = findUnaddedTargetIds(participantIds, meeting.participantIds || []);
    if (unadded.length > 0) {
      setErrorBanner('Please add users as members first before adding them to a call.');
      return;
    }

    const updatedParticipants = Array.from(
      new Set([...meeting.participantIds, firebaseUser.uid, ...participantIds])
    ).slice(0, 50);

    const path = `meetings/${meetingId}`;
    try {
      await updateDoc(doc(db, 'meetings', meetingId), {
        participantIds: updatedParticipants,
        updatedAt: serverTimestamp(),
      });
      if (activeMeeting?.id === meetingId) {
        setActiveMeeting({ ...activeMeeting, participantIds: updatedParticipants });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  const inviteTeamMember = async (data: {
    name: string;
    email: string;
    title?: string;
    department?: string;
  }): Promise<TeamInvite | null> => {
    if (!firebaseUser) return null;
    const cleanName = data.name.trim().slice(0, 80);
    const cleanEmail = data.email.trim().toLowerCase().slice(0, 160);
    if (!cleanName || cleanEmail.length < 3) return null;

    const inviteId = `inv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const path = `team_invites/${inviteId}`;

    const payload: Record<string, unknown> = {
      name: cleanName,
      email: cleanEmail,
      invitedByUid: firebaseUser.uid,
      invitedByName: (currentProfile?.displayName || firebaseUser.displayName || 'Member').slice(0, 80),
      status: 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (data.title?.trim()) {
      payload.title = data.title.trim().slice(0, 80);
    }
    if (data.department?.trim()) {
      payload.department = data.department.trim().slice(0, 50);
    }

    try {
      await setDoc(doc(db, 'team_invites', inviteId), payload);
      return {
        id: inviteId,
        name: cleanName,
        email: cleanEmail,
        title: data.title?.trim().slice(0, 80),
        department: data.department?.trim().slice(0, 50),
        invitedByUid: firebaseUser.uid,
        invitedByName: payload.invitedByName as string,
        status: 'pending',
      };
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  };

  const removeTeamInvite = async (inviteId: string) => {
    const path = `team_invites/${inviteId}`;
    try {
      await deleteDoc(doc(db, 'team_invites', inviteId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  const endVideoCall = async (meetingId: string, transcriptText?: string) => {
    sounds.playLeaveMeeting();
    const path = `meetings/${meetingId}`;
    try {
      await updateDoc(doc(db, 'meetings', meetingId), {
        status: 'completed',
        ...(transcriptText ? { transcriptText: transcriptText.slice(0, 60000) } : {}),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    } finally {
      setActiveMeeting(null);
      if (firebaseUser && wasInCallRef.current) {
        wasInCallRef.current = false;
        manualInCallOverrideRef.current = false;
        const restoreStatus =
          preCallStatusRef.current && preCallStatusRef.current !== 'busy'
            ? preCallStatusRef.current
            : 'online';
        updateDoc(doc(db, 'users', firebaseUser.uid), {
          status: restoreStatus,
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      }
    }
  };

  const saveMeetingTranscript = async (data: {
    meetingId?: string;
    title: string;
    transcriptText: string;
    aiSummary: string;
    discussionPoints?: string[];
    decisions: string[];
    actionItems: string[];
    tasks?: MeetingTask[];
    momText?: string;
    isPublic?: boolean;
    participantIds?: string[];
  }): Promise<string> => {
    if (!firebaseUser) return '';
    let targetMeetingId = data.meetingId || `meet-${Date.now().toString(36)}`;
    let path = `meetings/${targetMeetingId}`;
    const resolvedIsPublic = data.isPublic ?? true;
    const resolvedParticipants =
      data.participantIds && data.participantIds.length > 0
        ? Array.from(new Set([firebaseUser.uid, ...data.participantIds])).slice(0, 50)
        : [firebaseUser.uid];

    const cleanDiscussionPoints = (data.discussionPoints || [])
      .map((item) => String(item || '').trim().slice(0, 500))
      .filter(Boolean)
      .slice(0, 30);
    const cleanDecisions = (data.decisions || [])
      .map((item) => String(item || '').trim().slice(0, 500))
      .filter(Boolean)
      .slice(0, 30);
    const cleanTasks: MeetingTask[] = (data.tasks || [])
      .map((item) => ({
        task: String(item?.task || '').trim().slice(0, 500),
        assignedTo: String(item?.assignedTo || 'Team').trim().slice(0, 120) || 'Team',
        deadline: String(item?.deadline || 'TBD').trim().slice(0, 80) || 'TBD',
        completed: Boolean(item?.completed),
      }))
      .filter((t) => t.task.length > 0)
      .slice(0, 30);
    const cleanActionItems = (
      data.actionItems && data.actionItems.length > 0
        ? data.actionItems
        : cleanTasks.map((t) => `${t.task} — Assigned to: ${t.assignedTo} (Deadline: ${t.deadline})`)
    )
      .map((item) => String(item || '').trim().slice(0, 500))
      .filter(Boolean)
      .slice(0, 30);
    const cleanSummary = (data.aiSummary || '').slice(0, 5000);
    const cleanMomText = (data.momText || '').slice(0, 20000);
    const cleanTranscript = (data.transcriptText || '').slice(0, 60000);

    const createFreshTranscriptDoc = async () => {
      const freshId = `meet-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
      path = `meetings/${freshId}`;
      await setDoc(doc(db, 'meetings', freshId), {
        title: (data.title || 'Call Transcript').slice(0, 150),
        organizerId: firebaseUser.uid,
        organizerName: (currentProfile?.displayName || firebaseUser.displayName || 'Member').slice(0, 80),
        status: 'completed',
        scheduledTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isPublic: resolvedIsPublic,
        participantIds: resolvedParticipants,
        transcriptText: cleanTranscript,
        aiSummary: cleanSummary,
        discussionPoints: cleanDiscussionPoints,
        decisions: cleanDecisions,
        actionItems: cleanActionItems,
        tasks: cleanTasks,
        momText: cleanMomText,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return freshId;
    };

    try {
      if (data.meetingId) {
        const snap = await getDoc(doc(db, 'meetings', data.meetingId));
        if (snap.exists() && snap.data()?.status === 'completed') {
          if (snap.data()?.aiSummary && snap.data()?.momText) {
            setLastTranscribedMeetingId(data.meetingId);
            return data.meetingId;
          }
          if (snap.data()?.transcriptText && !snap.data()?.aiSummary) {
            await updateDoc(doc(db, 'meetings', data.meetingId), {
              aiSummary: cleanSummary,
              discussionPoints: cleanDiscussionPoints,
              decisions: cleanDecisions,
              actionItems: cleanActionItems,
              tasks: cleanTasks,
              momText: cleanMomText,
              updatedAt: serverTimestamp(),
            });
            setLastTranscribedMeetingId(data.meetingId);
            return data.meetingId;
          }
          targetMeetingId = await createFreshTranscriptDoc();
          setLastTranscribedMeetingId(targetMeetingId);
          return targetMeetingId;
        }

        await updateDoc(doc(db, 'meetings', targetMeetingId), {
          status: 'completed',
          transcriptText: cleanTranscript,
          aiSummary: cleanSummary,
          discussionPoints: cleanDiscussionPoints,
          decisions: cleanDecisions,
          actionItems: cleanActionItems,
          tasks: cleanTasks,
          momText: cleanMomText,
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(doc(db, 'meetings', targetMeetingId), {
          title: (data.title || 'Meeting Transcript').slice(0, 150),
          organizerId: firebaseUser.uid,
          organizerName: (currentProfile?.displayName || firebaseUser.displayName || 'Member').slice(0, 80),
          status: 'completed',
          scheduledTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          isPublic: resolvedIsPublic,
          participantIds: resolvedParticipants,
          transcriptText: cleanTranscript,
          aiSummary: cleanSummary,
          discussionPoints: cleanDiscussionPoints,
          decisions: cleanDecisions,
          actionItems: cleanActionItems,
          tasks: cleanTasks,
          momText: cleanMomText,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      setLastTranscribedMeetingId(targetMeetingId);
      return targetMeetingId;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  };

  const toggleMeetingTask = async (meetingId: string, taskIndex: number) => {
    if (!firebaseUser) return;
    const meeting = meetings.find((m) => m.id === meetingId);
    if (!meeting || !meeting.tasks || !meeting.tasks[taskIndex]) return;

    const updatedTasks = meeting.tasks.map((t, idx) =>
      idx === taskIndex
        ? {
            task: String(t.task || '').slice(0, 500),
            assignedTo: String(t.assignedTo || 'Team').slice(0, 120),
            deadline: String(t.deadline || 'TBD').slice(0, 80),
            completed: !t.completed,
          }
        : {
            task: String(t.task || '').slice(0, 500),
            assignedTo: String(t.assignedTo || 'Team').slice(0, 120),
            deadline: String(t.deadline || 'TBD').slice(0, 80),
            completed: Boolean(t.completed),
          }
    );

    const path = `meetings/${meetingId}`;
    try {
      await updateDoc(doc(db, 'meetings', meetingId), {
        tasks: updatedTasks,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  const postMomToChat = async (
    meeting: MeetingRecord,
    conversationId?: string
  ): Promise<boolean> => {
    if (!firebaseUser) return false;
    const targetConv =
      (conversationId && conversations.find((c) => c.id === conversationId)) ||
      conversations.find((c) => c.id === 'general') ||
      conversations[0];
    if (!targetConv) return false;

    const text = formatMoMForChat(meeting).trim().slice(0, 5000);
    if (!text) return false;

    const msgId = `msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const path = `conversations/${targetConv.id}/messages/${msgId}`;

    let ciphertext = '';
    let iv = '';
    try {
      const encrypted = await encryptE2EEMessage(text, `conv-${targetConv.id}`);
      ciphertext = encrypted.ciphertext.slice(0, 10000);
      iv = encrypted.iv.slice(0, 128);
    } catch {
      // Fallback if WebCrypto unavailable
    }

    try {
      await setDoc(doc(db, 'conversations', targetConv.id, 'messages', msgId), {
        conversationId: targetConv.id,
        senderId: firebaseUser.uid,
        senderName: (currentProfile?.displayName || firebaseUser.displayName || 'Member').slice(0, 80),
        senderAvatar: (currentProfile?.avatar || firebaseUser.photoURL || '').slice(0, 65000),
        content: text,
        ciphertext,
        iv,
        attachmentName: '',
        attachmentType: 'none',
        attachmentSize: 0,
        attachmentData: '',
        isPublic: targetConv.isPublic,
        participantIds: targetConv.participantIds,
        createdAt: serverTimestamp(),
      });

      await updateDoc(doc(db, 'conversations', targetConv.id), {
        lastMessageText: `MoM: ${meeting.title}`.slice(0, 500),
        lastMessageSender: (currentProfile?.displayName || 'AI Meeting Assistant').slice(0, 80),
        updatedAt: serverTimestamp(),
      });

      setActiveConversationId(targetConv.id);
      sounds.playMessageNotification();
      return true;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  };

  const deleteMeetingRecord = async (meetingId: string) => {
    const path = `meetings/${meetingId}`;
    try {
      await deleteDoc(doc(db, 'meetings', meetingId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  const incomingCall =
    firebaseUser && firebaseUser.emailVerified
      ? meetings.find((m) => {
          if (m.status !== 'live') return false;
          if (m.organizerId === firebaseUser.uid) return false;
          if (!m.participantIds.includes(firebaseUser.uid)) return false;
          if (activeMeeting?.id === m.id) return false;
          if (dismissedCallIds.includes(m.id)) return false;
          const updatedMs = toMillis(m.updatedAt) || toMillis(m.createdAt);
          if (updatedMs > 0 && Date.now() - updatedMs > 3 * 60 * 1000) return false;
          return true;
        }) || null
      : null;

  return (
    <AppContext.Provider
      value={{
        firebaseUser,
        authLoading,
        currentProfile,
        teamUsers,
        contacts,
        addedMemberIds,
        teamInvites,
        conversations,
        activeConversationId,
        messages,
        meetings,
        activeMeeting,
        activeCallMode,
        incomingCall,
        activeTab,
        errorBanner,
        presenceNow,
        lastTranscribedMeetingId,
        selectedTimezone,
        meetingDraft,
        createGroupModalOpen,

        setActiveTab,
        setActiveCallMode,
        setActiveConversationId,
        setErrorBanner,
        setLastTranscribedMeetingId,
        setSelectedTimezone,
        openMeetingSchedulerWithDraft,
        clearMeetingDraft,
        openCreateGroupModal,
        closeCreateGroupModal,
        lookupUserByEmail,
        isAddedMember,
        refreshAuthUser,
        signOut,
        updateMyProfile,
        updateMemberPermissions,
        createChannel,
        updateGroupMembers,
        addContact,
        addContactsAndStartChat,
        removeContact,
        startDirectChat,
        sendMessage,
        removeMessage,
        loadSearchableMessages,
        startVideoCall,
        scheduleMeeting,
        rescheduleMeeting,
        shareScheduledMeetingToChat,
        joinVideoCall,
        answerIncomingCall,
        declineIncomingCall,
        addCallParticipants,
        endVideoCall,
        saveMeetingTranscript,
        toggleMeetingTask,
        postMomToChat,
        deleteMeetingRecord,
        inviteTeamMember,
        removeTeamInvite,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
};
