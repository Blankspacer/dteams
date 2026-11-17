export type UserRole = 'admin' | 'member';
export type UserStatus = 'online' | 'busy' | 'away' | 'offline';
export type AppTab = 'chat' | 'video' | 'calendar' | 'transcripts' | 'account';

export interface UserProfile {
  uid: string;
  displayName: string;
  username?: string;
  timezone?: string;
  title?: string;
  department?: string;
  avatar?: string;
  status: UserStatus;
  role: UserRole;
  canCreateMeetings: boolean;
  canRecordMeetings: boolean;
  e2eeFingerprint?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Conversation {
  id: string;
  name: string;
  type: 'channel' | 'direct';
  isPublic: boolean;
  ownerId: string;
  participantIds: string[];
  lastMessageText?: string;
  lastMessageSender?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  content: string;
  ciphertext?: string;
  iv?: string;
  attachmentName?: string;
  attachmentType?: 'none' | 'image' | 'file';
  attachmentSize?: number;
  attachmentData?: string;
  isPublic: boolean;
  participantIds: string[];
  createdAt?: unknown;
}

export interface MeetingTask {
  task: string;
  assignedTo: string;
  deadline: string;
  completed: boolean;
}

export interface MeetingRecord {
  id: string;
  title: string;
  organizerId: string;
  organizerName: string;
  status: 'upcoming' | 'live' | 'completed';
  scheduledTime?: string;
  isPublic: boolean;
  participantIds: string[];
  transcriptText?: string;
  aiSummary?: string;
  discussionPoints?: string[];
  decisions?: string[];
  actionItems?: string[];
  tasks?: MeetingTask[];
  momText?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface TeamInvite {
  id: string;
  name: string;
  email: string;
  title?: string;
  department?: string;
  invitedByUid: string;
  invitedByName: string;
  status: 'pending' | 'joined';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface UserContact {
  uid: string;
  addedByUid: string;
  displayName: string;
  createdAt?: unknown;
}
