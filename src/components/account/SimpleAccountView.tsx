import React, { useState, useEffect } from 'react';
import {
  LogOut,
  MessageSquare,
  Video,
  Search,
  Copy,
  Check,
  Shield,
  KeyRound,
  Save,
  UserPlus,
  Trash2,
  Smartphone,
  QrCode,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { AddMemberModal } from '../common/AddMemberModal';
import { MobileDownloadModal } from '../common/MobileDownloadModal';
import { PWAInstallButton } from '../common/PWAInstallButton';
import { UserStatusBadge } from '../common/UserStatusBadge';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import { UserStatus } from '../../types';
import {
  STATUS_META,
  countUsersByPresence,
  getEffectiveUserStatus,
  sortUsersByPresence,
} from '../../utils/presence';

export const SimpleAccountView: React.FC = () => {
  const {
    firebaseUser,
    currentProfile,
    teamUsers,
    teamInvites,
    updateMyProfile,
    updateMemberPermissions,
    startDirectChat,
    startVideoCall,
    removeTeamInvite,
    signOut,
    presenceNow,
  } = useApp();

  const [displayName, setDisplayName] = useState(currentProfile?.displayName || '');
  const [title, setTitle] = useState(currentProfile?.title || '');
  const [department, setDepartment] = useState(currentProfile?.department || '');
  const [status, setStatus] = useState<UserStatus>(currentProfile?.status || 'online');
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | UserStatus>('all');
  const [copiedLink, setCopiedLink] = useState(false);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [downloadModalOpen, setDownloadModalOpen] = useState(false);
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null);
  const { downloadLink } = usePWAInstall();

  useEffect(() => {
    if (currentProfile) {
      setDisplayName(currentProfile.displayName || '');
      setTitle(currentProfile.title || '');
      setDepartment(currentProfile.department || '');
      setStatus(currentProfile.status || 'online');
    }
  }, [currentProfile]);

  const isAdmin =
    currentProfile?.role === 'admin' || firebaseUser?.email === 'sneloy@gmail.com';

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim() || saving) return;
    setSaving(true);
    setSavedNotice(false);
    try {
      await updateMyProfile({
        displayName: displayName.trim().slice(0, 80),
        title: title.trim().slice(0, 80),
        department: department.trim().slice(0, 50),
        status,
      });
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  const handleCopyInvite = () => {
    navigator.clipboard.writeText(downloadLink || window.location.origin);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const sortedTeam = sortUsersByPresence(teamUsers, firebaseUser?.uid, presenceNow);
  const presenceCounts = countUsersByPresence(teamUsers, firebaseUser?.uid, presenceNow);

  const filteredTeam = sortedTeam.filter((u) => {
    const q = search.toLowerCase();
    const matchesSearch =
      u.displayName.toLowerCase().includes(q) ||
      (u.title || '').toLowerCase().includes(q) ||
      (u.department || '').toLowerCase().includes(q);
    const matchesStatus =
      statusFilter === 'all' ||
      getEffectiveUserStatus(u, firebaseUser?.uid, presenceNow) === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 p-4 sm:p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Top Grid: User Account + E2EE & Invite */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Account Settings Card */}
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                {currentProfile?.avatar ? (
                  <img
                    src={currentProfile.avatar}
                    alt={currentProfile.displayName}
                    referrerPolicy="no-referrer"
                    className="w-12 h-12 rounded-full object-cover border border-slate-200 shrink-0"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-sky-600 text-white font-bold text-base flex items-center justify-center shrink-0">
                    {(currentProfile?.displayName || firebaseUser?.email || 'U')
                      .slice(0, 2)
                      .toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <h1 className="text-lg font-bold text-slate-900 truncate">
                    {currentProfile?.displayName || 'Your Account'}
                  </h1>
                  <p className="text-xs text-slate-500 truncate">{firebaseUser?.email}</p>
                </div>
              </div>

              <button
                onClick={signOut}
                className="min-h-[40px] px-3.5 rounded-xl border border-slate-200 hover:bg-rose-50 hover:border-rose-200 hover:text-rose-700 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors shrink-0"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out</span>
              </button>
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Full Name
                  </label>
                  <input
                    type="text"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full min-h-[44px] bg-slate-50 border border-slate-200 rounded-xl px-3.5 text-sm text-slate-900 focus:outline-none focus:border-sky-600 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Availability Status
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as UserStatus)}
                    className="w-full min-h-[44px] bg-slate-50 border border-slate-200 rounded-xl px-3.5 text-sm text-slate-900 focus:outline-none focus:border-sky-600 focus:bg-white"
                  >
                    <option value="online">Online</option>
                    <option value="busy">Busy</option>
                    <option value="away">Away</option>
                    <option value="offline">Appear Offline</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Job Title
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Product Designer"
                    className="w-full min-h-[44px] bg-slate-50 border border-slate-200 rounded-xl px-3.5 text-sm text-slate-900 focus:outline-none focus:border-sky-600 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Department
                  </label>
                  <input
                    type="text"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    placeholder="e.g. Engineering"
                    className="w-full min-h-[44px] bg-slate-50 border border-slate-200 rounded-xl px-3.5 text-sm text-slate-900 focus:outline-none focus:border-sky-600 focus:bg-white"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 pt-1">
                {savedNotice ? (
                  <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1">
                    <Check className="w-4 h-4" /> Profile saved
                  </span>
                ) : (
                  <span className="text-xs text-slate-400">
                    Role: {currentProfile?.role === 'admin' ? 'Admin' : 'Member'}
                  </span>
                )}

                <button
                  type="submit"
                  disabled={saving}
                  className="min-h-[42px] px-4 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-60"
                >
                  <Save className="w-4 h-4" />
                  <span>{saving ? 'Saving...' : 'Save Changes'}</span>
                </button>
              </div>
            </form>
          </div>

          {/* Security, Mobile Download Link & Invite Card */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <Smartphone className="w-4 h-4 text-sky-600" />
                <h2>Download App to Your Device</h2>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Install SphereCall on your laptop (Windows, Mac) or phone (Android, iPhone), or share this link so anyone can join and talk over the internet:
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={downloadLink}
                  onFocus={(e) => e.target.select()}
                  className="flex-1 min-h-[40px] bg-slate-50 border border-slate-200 rounded-xl px-3 text-xs font-mono text-slate-700"
                />
                <button
                  type="button"
                  onClick={handleCopyInvite}
                  className="min-h-[40px] px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center gap-1.5 shrink-0"
                >
                  {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedLink ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                <PWAInstallButton variant="card" />
                <button
                  type="button"
                  onClick={() => setDownloadModalOpen(true)}
                  className="w-full min-h-[44px] px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
                >
                  <QrCode className="w-4 h-4 text-sky-600" />
                  <span>Laptop & Phone Guide</span>
                </button>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <UserPlus className="w-4 h-4 text-sky-600" />
                <h2>Add Teammates</h2>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Add coworkers by email or invite them directly. Everyone who signs in appears in your directory automatically.
              </p>
              <button
                onClick={() => setAddMemberOpen(true)}
                className="w-full min-h-[44px] px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
              >
                <UserPlus className="w-4 h-4" />
                <span>Add Member</span>
              </button>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-2.5">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <KeyRound className="w-4 h-4 text-emerald-600" />
                <h2>Encryption Fingerprint</h2>
              </div>
              <p className="text-xs text-slate-500">
                Your personal device key fingerprint for verifying end-to-end encrypted chats:
              </p>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 font-mono text-xs text-slate-700 break-all tabular-nums">
                {currentProfile?.e2eeFingerprint || 'Generating key...'}
              </div>
            </div>
          </div>
        </div>

        {/* Team Directory Card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Team Directory ({teamUsers.length})
              </h2>
              <p className="text-xs text-slate-500">
                Start a direct message or video call with anyone on your team.
              </p>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search teammates..."
                  className="w-full min-h-[40px] bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-sky-600 focus:bg-white"
                />
              </div>
              <button
                type="button"
                onClick={() => setAddMemberOpen(true)}
                className="min-h-[40px] px-3.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold flex items-center gap-1.5 shrink-0"
              >
                <UserPlus className="w-4 h-4" />
                <span>Add Member</span>
              </button>
            </div>
          </div>

          {/* Presence Summary & Filter Bar */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                statusFilter === 'all'
                  ? 'bg-slate-900 border-slate-900 text-white'
                  : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              All ({teamUsers.length})
            </button>
            {(['online', 'busy', 'away', 'offline'] as UserStatus[]).map((st) => {
              const meta = STATUS_META[st];
              const active = statusFilter === st;
              return (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter((prev) => (prev === st ? 'all' : st))}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                    active
                      ? `${meta.badgeClass} ring-1 ring-inset ring-current/25`
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${meta.dotClass}`} />
                  <span>{meta.label}</span>
                  <span className="tabular-nums opacity-75">({presenceCounts[st]})</span>
                </button>
              );
            })}
          </div>

          <div className="divide-y divide-slate-100">
            {filteredTeam.map((member) => {
              const isMe = member.uid === firebaseUser?.uid;
              const effectiveStatus = getEffectiveUserStatus(
                member,
                firebaseUser?.uid,
                presenceNow
              );
              const meta = STATUS_META[effectiveStatus];
              return (
                <div
                  key={member.uid}
                  className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative shrink-0">
                      {member.avatar ? (
                        <img
                          src={member.avatar}
                          alt={member.displayName}
                          referrerPolicy="no-referrer"
                          className="w-10 h-10 rounded-full object-cover border border-slate-200"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-slate-200 text-slate-700 font-semibold text-xs flex items-center justify-center">
                          {member.displayName.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <span
                        className={`w-2.5 h-2.5 rounded-full border-2 border-white absolute bottom-0 right-0 ${meta.dotClass}`}
                        title={meta.label}
                      />
                    </div>

                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900 truncate flex items-center gap-2">
                        <span className="truncate">
                          {member.displayName} {isMe ? '(You)' : ''}
                        </span>
                        <UserStatusBadge status={effectiveStatus} />
                      </div>
                      <div className="text-xs text-slate-500 truncate mt-0.5">
                        {[member.title, member.department].filter(Boolean).join(' · ') || 'Team Member'}
                      </div>
                    </div>
                  </div>

                  {!isMe && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => startDirectChat(member.uid)}
                        className="min-h-[40px] px-3.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>Message</span>
                      </button>
                      <button
                        onClick={() =>
                          startVideoCall(`Call with ${member.displayName}`, [
                            firebaseUser!.uid,
                            member.uid,
                          ])
                        }
                        className="min-h-[40px] px-3.5 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-700 text-xs font-semibold flex items-center gap-1.5"
                      >
                        <Video className="w-3.5 h-3.5" />
                        <span>Call</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            {teamInvites
              .filter(
                (inv) =>
                  inv.status === 'pending' &&
                  (inv.name.toLowerCase().includes(search.toLowerCase()) ||
                    inv.email.toLowerCase().includes(search.toLowerCase()))
              )
              .map((invite) => (
                <div
                  key={invite.id}
                  className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-800 font-semibold text-xs flex items-center justify-center shrink-0">
                      {invite.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900 truncate">
                        {invite.name}{' '}
                        <span className="text-xs font-normal text-amber-700">· Pending invite</span>
                      </div>
                      <div className="text-xs text-slate-500 truncate">
                        {invite.email}
                        {[invite.title, invite.department].filter(Boolean).length > 0
                          ? ` · ${[invite.title, invite.department].filter(Boolean).join(' · ')}`
                          : ''}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(
                          `Join our SphereCall workspace at ${window.location.origin} with ${invite.email}`
                        );
                        setCopiedInviteId(invite.id);
                        setTimeout(() => setCopiedInviteId(null), 2000);
                      }}
                      className="min-h-[40px] px-3.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5"
                    >
                      {copiedInviteId === invite.id ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span>{copiedInviteId === invite.id ? 'Copied' : 'Copy Invite'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => removeTeamInvite(invite.id)}
                      className="min-h-[40px] min-w-[40px] rounded-xl border border-slate-200 hover:bg-rose-50 hover:text-rose-600 text-slate-400 flex items-center justify-center"
                      title="Remove invite"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>

        {/* Admin Permissions Section (Only visible to Admins) */}
        {isAdmin && (
          <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-sky-600" />
              <div>
                <h2 className="text-base font-bold text-slate-900">Team Permissions</h2>
                <p className="text-xs text-slate-500">
                  Manage admin access, call creation, and AI meeting recording permissions.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                    <th className="py-2.5 pr-4">Member</th>
                    <th className="py-2.5 px-3">Role</th>
                    <th className="py-2.5 px-3 text-center">Start Calls</th>
                    <th className="py-2.5 pl-3 text-center">Record & AI</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {teamUsers.map((member) => {
                    const isSelf = member.uid === firebaseUser?.uid;
                    return (
                      <tr key={member.uid}>
                        <td className="py-3 pr-4">
                          <div className="font-semibold text-slate-900">
                            {member.displayName} {isSelf ? '(You)' : ''}
                          </div>
                          <div className="text-xs text-slate-500">{member.title || 'Member'}</div>
                        </td>
                        <td className="py-3 px-3">
                          <select
                            value={member.role}
                            disabled={isSelf}
                            onChange={(e) =>
                              updateMemberPermissions(member.uid, {
                                role: e.target.value as 'admin' | 'member',
                              })
                            }
                            className="min-h-[38px] bg-slate-50 border border-slate-200 rounded-lg px-2.5 text-xs font-medium text-slate-800 disabled:opacity-50"
                          >
                            <option value="member">Member</option>
                            <option value="admin">Admin</option>
                          </select>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <input
                            type="checkbox"
                            checked={member.canCreateMeetings}
                            onChange={(e) =>
                              updateMemberPermissions(member.uid, {
                                canCreateMeetings: e.target.checked,
                              })
                            }
                            aria-label={`Allow ${member.displayName} to create calls`}
                            className="w-4 h-4 accent-sky-600 cursor-pointer"
                          />
                        </td>
                        <td className="py-3 pl-3 text-center">
                          <input
                            type="checkbox"
                            checked={member.canRecordMeetings}
                            onChange={(e) =>
                              updateMemberPermissions(member.uid, {
                                canRecordMeetings: e.target.checked,
                              })
                            }
                            aria-label={`Allow ${member.displayName} to record and transcribe meetings`}
                            className="w-4 h-4 accent-sky-600 cursor-pointer"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <AddMemberModal isOpen={addMemberOpen} onClose={() => setAddMemberOpen(false)} />
      <MobileDownloadModal isOpen={downloadModalOpen} onClose={() => setDownloadModalOpen(false)} />
    </div>
  );
};
