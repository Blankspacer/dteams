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
  TeamInvite,
  UserContact,
  UserProfile,
  UserRole,
  UserStatus,
} from '../types';
import { encryptE2EEMessage, generateUserFingerprint } from '../utils/crypto';
import { sounds } from '../utils/audio';

interface AppContextType {
  firebaseUser: FirebaseUser | null;
  authLoading: boolean;
  currentProfile: UserProfile | null;
  teamUsers: UserProfile[];
  contacts: UserContact[];
  isFirstLogin: boolean;
  teamInvites: TeamInvite[];
  conversations: Conversation[];
  activeConversationId: string;
  messages: ChatMessage[];
  meetings: MeetingRecord[];
  activeMeeting: MeetingRecord | null;
  incomingCall: MeetingRecord | null;
  activeTab: AppTab;
  errorBanner: string | null;
  presenceNow: number;

  setActiveTab: (tab: AppTab) => void;
  setActiveConversationId: (id: string) => void;
  setErrorBanner: (msg: string | null) => void;
  dismissFirstLoginPrompt: () => void;
  refreshAuthUser: () => Promise<void>;
  signOut: () => Promise<void>;

  updateMyProfile: (
    updates: Partial<Pick<UserProfile, 'displayName' | 'title' | 'department' | 'avatar' | 'status'>>
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

  startVideoCall: (title?: string, participantIds?: string[]) => Promise<MeetingRecord | null>;
  joinVideoCall: (meeting: MeetingRecord) => Promise<void>;
  answerIncomingCall: (meeting: MeetingRecord) => Promise<void>;
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
    decisions: string[];
    actionItems: string[];
  }) => Promise<string>;
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
  const [isFirstLogin, setIsFirstLogin] = useState(false);
  const [teamInvites, setTeamInvites] = useState<TeamInvite[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [meetings, setMeetings] = useState<MeetingRecord[]>([]);
  const [activeMeeting, setActiveMeeting] = useState<MeetingRecord | null>(null);
  const [dismissedCallIds, setDismissedCallIds] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<AppTab>('chat');
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [authVersion, setAuthVersion] = useState(0);
  const [presenceNow, setPresenceNow] = useState(() => Date.now());
  const manualStatusRef = useRef<UserStatus | null>(null);
  const currentStatusRef = useRef<UserStatus>('online');
  const activeMeetingRef = useRef<MeetingRecord | null>(null);

  useEffect(() => {
    currentStatusRef.current = currentProfile?.status || 'online';
  }, [currentProfile?.status]);

  useEffect(() => {
    activeMeetingRef.current = activeMeeting;
  }, [activeMeeting]);

  // 1. Auth State Listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setAuthLoading(false);
      if (!user) {
        setCurrentProfile(null);
        setTeamUsers([]);
        setContacts([]);
        setIsFirstLogin(false);
        setTeamInvites([]);
        setConversations([]);
        setMessages([]);
        setMeetings([]);
        setActiveMeeting(null);
        setDismissedCallIds([]);
        setActiveConversationId('');
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
      try {
        const userSnap = await getDoc(doc(db, 'users', uid));
        if (!userSnap.exists()) {
          const displayName =
            firebaseUser!.displayName?.trim() ||
            firebaseUser!.email?.split('@')[0] ||
            'Team Member';

          const profilePayload = {
            uid,
            displayName: displayName.slice(0, 80),
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
          setIsFirstLogin(true);
        } else {
          const existingStatus = (userSnap.data()?.status || 'offline') as UserStatus;
          await updateDoc(doc(db, 'users', uid), {
            status: existingStatus === 'offline' || existingStatus === 'away' ? 'online' : existingStatus,
            updatedAt: serverTimestamp(),
          });
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

  // Auto-mark user as Busy during active calls (unless manually overridden)
  useEffect(() => {
    if (!firebaseUser || !firebaseUser.emailVerified || !currentProfile) return;
    if (manualStatusRef.current) return;

    const uid = firebaseUser.uid;
    if (activeMeeting && currentProfile.status === 'online') {
      updateDoc(doc(db, 'users', uid), {
        status: 'busy',
        updatedAt: serverTimestamp(),
      }).catch(() => {});
    } else if (!activeMeeting && currentProfile.status === 'busy') {
      updateDoc(doc(db, 'users', uid), {
        status: 'online',
        updatedAt: serverTimestamp(),
      }).catch(() => {});
    }
  }, [Boolean(activeMeeting), firebaseUser?.uid, firebaseUser?.emailVerified]);

  const refreshAuthUser = async () => {
    if (auth.currentUser) {
      await reload(auth.currentUser);
      setFirebaseUser(auth.currentUser);
      setAuthVersion((v) => v + 1);
    }
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

  const updateMyProfile = async (
    updates: Partial<Pick<UserProfile, 'displayName' | 'title' | 'department' | 'avatar' | 'status'>>
  ) => {
    if (!firebaseUser) return;
    if (updates.status) {
      manualStatusRef.current = updates.status === 'online' ? null : updates.status;
    }
    const sanitizedUpdates = {
      ...updates,
      ...(typeof updates.avatar === 'string'
        ? { avatar: updates.avatar.slice(0, 65000) }
        : {}),
    };
    const path = `users/${firebaseUser.uid}`;
    try {
      await updateDoc(doc(db, 'users', firebaseUser.uid), {
        ...sanitizedUpdates,
        updatedAt: serverTimestamp(),
      });
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

  const dismissFirstLoginPrompt = () => {
    setIsFirstLogin(false);
  };

  const ensureContactExists = async (targetUid: string) => {
    if (!firebaseUser || targetUid === firebaseUser.uid) return;
    if (contacts.some((c) => c.uid === targetUid)) return;
    const path = `users/${firebaseUser.uid}/contacts/${targetUid}`;
    const target = teamUsers.find((u) => u.uid === targetUid);
    try {
      const contactRef = doc(db, 'users', firebaseUser.uid, 'contacts', targetUid);
      const existingSnap = await getDoc(contactRef);
      if (!existingSnap.exists()) {
        await setDoc(contactRef, {
          uid: targetUid,
          addedByUid: firebaseUser.uid,
          displayName: (target?.displayName || 'Team Member').slice(0, 80),
          createdAt: serverTimestamp(),
        });
      }
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
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  const startDirectChat = async (targetUid: string): Promise<string> => {
    if (!firebaseUser || targetUid === firebaseUser.uid) return '';
    await ensureContactExists(targetUid);

    const pair = [firebaseUser.uid, targetUid].sort();
    const convId = `dm-${pair[0].slice(0, 20)}-${pair[1].slice(0, 20)}`;
    const existing = conversations.find((c) => c.id === convId);
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

  const addContactsAndStartChat = async (targetUids: string[]) => {
    if (!firebaseUser) return;
    const unique = Array.from(new Set(targetUids)).filter(
      (id) => id && id !== firebaseUser.uid
    );
    for (const targetUid of unique) {
      await ensureContactExists(targetUid);
    }
    if (unique.length > 0) {
      await startDirectChat(unique[0]);
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
    participantIds?: string[]
  ): Promise<MeetingRecord | null> => {
    if (!firebaseUser) return null;
    const meetingId = `meet-${Date.now().toString(36)}`;
    const path = `meetings/${meetingId}`;
    const participants = Array.from(
      new Set([firebaseUser.uid, ...(participantIds || [])])
    ).slice(0, 50);

    const record: Omit<MeetingRecord, 'id'> = {
      title: (title || `${currentProfile?.displayName || 'Team'} Video Call`).slice(0, 150),
      organizerId: firebaseUser.uid,
      organizerName: (currentProfile?.displayName || firebaseUser.displayName || 'Member').slice(0, 80),
      status: 'live',
      scheduledTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isPublic: !participantIds || participantIds.length === 0,
      participantIds: participants,
      transcriptText: '',
      aiSummary: '',
      decisions: [],
      actionItems: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    try {
      await setDoc(doc(db, 'meetings', meetingId), record);
      const created: MeetingRecord = { id: meetingId, ...record };
      setActiveMeeting(created);
      setActiveTab('video');
      sounds.playJoinMeeting();
      return created;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  };

  const joinVideoCall = async (meeting: MeetingRecord) => {
    if (!firebaseUser) return;
    setDismissedCallIds((prev) => (prev.includes(meeting.id) ? prev : [...prev, meeting.id]));
    const updatedParticipants = Array.from(
      new Set([...meeting.participantIds, firebaseUser.uid])
    ).slice(0, 50);
    const path = `meetings/${meeting.id}`;
    try {
      await updateDoc(doc(db, 'meetings', meeting.id), {
        status: 'live',
        participantIds: updatedParticipants,
        updatedAt: serverTimestamp(),
      });
      setActiveMeeting({ ...meeting, status: 'live', participantIds: updatedParticipants });
      setActiveTab('video');
      sounds.playJoinMeeting();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  const answerIncomingCall = async (meeting: MeetingRecord) => {
    await joinVideoCall(meeting);
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
    }
  };

  const saveMeetingTranscript = async (data: {
    meetingId?: string;
    title: string;
    transcriptText: string;
    aiSummary: string;
    decisions: string[];
    actionItems: string[];
  }): Promise<string> => {
    if (!firebaseUser) return '';
    const meetingId = data.meetingId || `meet-${Date.now().toString(36)}`;
    const path = `meetings/${meetingId}`;

    try {
      if (data.meetingId) {
        await updateDoc(doc(db, 'meetings', meetingId), {
          status: 'completed',
          transcriptText: data.transcriptText.slice(0, 60000),
          aiSummary: data.aiSummary.slice(0, 5000),
          decisions: data.decisions.slice(0, 30),
          actionItems: data.actionItems.slice(0, 30),
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(doc(db, 'meetings', meetingId), {
          title: data.title.slice(0, 150),
          organizerId: firebaseUser.uid,
          organizerName: (currentProfile?.displayName || firebaseUser.displayName || 'Member').slice(0, 80),
          status: 'completed',
          scheduledTime: new Date().toLocaleDateString(),
          isPublic: true,
          participantIds: [firebaseUser.uid],
          transcriptText: data.transcriptText.slice(0, 60000),
          aiSummary: data.aiSummary.slice(0, 5000),
          decisions: data.decisions.slice(0, 30),
          actionItems: data.actionItems.slice(0, 30),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      return meetingId;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
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
        isFirstLogin,
        teamInvites,
        conversations,
        activeConversationId,
        messages,
        meetings,
        activeMeeting,
        incomingCall,
        activeTab,
        errorBanner,
        presenceNow,

        setActiveTab,
        setActiveConversationId,
        setErrorBanner,
        dismissFirstLoginPrompt,
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
        startVideoCall,
        joinVideoCall,
        answerIncomingCall,
        declineIncomingCall,
        addCallParticipants,
        endVideoCall,
        saveMeetingTranscript,
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
