# Security Specification (`firestore.rules` TDD)

## 1. Data Invariants
1. **Identity Integrity**: Every user document `/users/{userId}` can only be created by the matching verified authenticated user (`userId == request.auth.uid`), with `role` locked to `'member'` on self-registration (unless the user is the bootstrapped admin `sneloy@gmail.com` or an existing admin).
2. **PII Isolation**: User email addresses reside strictly in `/users/{userId}/private/info` and are readable only by the owner (`request.auth.uid == userId`) or verified admins (`isAdmin()`). Public `/users/{userId}` documents contain zero PII.
3. **Conversation Membership**: A user can only read, list, or send messages inside a conversation if `isPublic == true` or `request.auth.uid in participantIds`. Every message inside `/conversations/{conversationId}/messages/{messageId}` must verify parent existence (`exists(...)`) and membership via `get()` on create, and must set `senderId == request.auth.uid`. When a group owner or admin adds or removes members on a conversation, only `participantIds` may be updated on existing messages and must match `getAfter(...)` on the parent conversation.
4. **Immutable Ownership & Timestamps**: `createdAt` must equal `request.time` on creation and remain immutable on update. `updatedAt` must equal `request.time` on both create and update. `uid`, `ownerId`, `senderId`, and `organizerId` cannot be reassigned after creation.
5. **Strict Key & Size Bounds**: Every document enforces `keys().hasAll(...)` and `keys().hasOnly(...)` on create, `affectedKeys().hasOnly(...)` on update, and `.size()` limits on all strings and bounded arrays (`<= 50` participants).
6. **Terminal State Protection**: Completed meetings (`status == 'completed'`) cannot be modified by non-admins once finished, except via admin override or updating AI summary/transcript only by organizer while live/completing.
7. **Team Invites PII Protection**: Documents in `/team_invites/{inviteId}` contain invitee email PII and are readable/listable only by the inviting member (`invitedByUid == request.auth.uid`), the verified invitee (`email == request.auth.token.email`), or verified admins (`isAdmin()`).
8. **WebRTC Call Signaling Integrity**: Signals in `/meetings/{meetingId}/signals/{signalId}` require parent meeting existence (`exists(...)`) and caller membership (`isPublic == true || request.auth.uid in participantIds`), lock `fromUid == request.auth.uid`, enforce `createdAt == request.time`, and restrict `get`/`list` strictly to the sender (`fromUid`), recipient (`toUid`), or verified admins.
9. **User Contacts Isolation**: Contacts in `/users/{userId}/contacts/{contactId}` can only be created, listed, or deleted by the owning verified user (`addedByUid == request.auth.uid` and `userId == request.auth.uid`) or verified admins, and must reference an existing user document (`/users/{contactId}`).

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Privilege Escalation (Self-Admin)**: User registers `/users/attacker` with `{ role: 'admin' }`. -> **DENIED** (non-admin cannot create with `role == 'admin'`).
2. **Shadow Field Injection**: User creates `/users/uid1` with extra field `{ isSuperUser: true }`. -> **DENIED** (`hasOnly` rejects ghost fields).
3. **Unverified Email Spoof**: User with `email_verified: false` attempts write or admin read. -> **DENIED** (`isVerifiedUser()` checks `email_verified == true`).
4. **PII Leak Attempt**: User B attempts `get /users/userA/private/info`. -> **DENIED** (owner or admin only).
5. **Blanket List Scraping**: User attempts `list /conversations` without filtering private rooms. -> **DENIED** (`allow list` requires `resource.data.isPublic == true || request.auth.uid in resource.data.participantIds || isAdmin()`).
6. **Message Sender Spoofing**: User A creates message inside conversation with `senderId: 'userB'`. -> **DENIED** (`senderId == request.auth.uid`).
7. **Orphaned Message Write**: User writes to `/conversations/nonexistent/messages/m1`. -> **DENIED** (parent `get()` check fails).
8. **ID Poisoning**: User writes `/meetings/long_2000_char_id...`. -> **DENIED** (`isValidId()` rejects IDs > 128 chars or invalid chars).
9. **Timestamp Backdating**: User creates message with `createdAt` set to yesterday's timestamp. -> **DENIED** (`createdAt == request.time`).
10. **Value Poisoning on Update**: User updates `status` on `/users/uid1` to `{ status: 12345 }` or 1MB string. -> **DENIED** (`isValidUserProfile()` enforces enum & size).
11. **Terminal State Tampering**: Non-admin tries to alter `title` or `organizerId` on a `completed` meeting. -> **DENIED** (terminal state lock).
12. **Unbounded Array Attack**: User tries to create conversation with 500 `participantIds`. -> **DENIED** (`participantIds.size() <= 50`).
