import { MeetingRecord } from '../types';

export function pickSupportedAudioMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported?.(type)) return type;
  }
  return '';
}

type PrintableMeeting = Pick<
  MeetingRecord,
  | 'title'
  | 'organizerName'
  | 'scheduledTime'
  | 'aiSummary'
  | 'discussionPoints'
  | 'decisions'
  | 'actionItems'
  | 'tasks'
  | 'momText'
  | 'transcriptText'
>;

export function formatTranscriptAsText(m: PrintableMeeting): string {
  const lines: string[] = [
    `MINUTES OF MEETING (MoM) & TRANSCRIPT`,
    `=====================================`,
    `Title: ${m.title || 'Call Transcript'}`,
    `Organizer: ${m.organizerName || 'Team Member'}`,
    `Time: ${m.scheduledTime || new Date().toLocaleString()}`,
    '',
  ];

  if (m.aiSummary?.trim()) {
    lines.push('=== EXECUTIVE SUMMARY ===', m.aiSummary.trim(), '');
  }

  if (m.discussionPoints && m.discussionPoints.length > 0) {
    lines.push(
      '=== IMPORTANT DISCUSSION POINTS ===',
      ...m.discussionPoints.map((d) => `- Discussion: ${d}`),
      ''
    );
  }

  if (m.decisions && m.decisions.length > 0) {
    lines.push(
      '=== KEY DECISIONS ===',
      ...m.decisions.map((d) => `- Decision: ${d}`),
      ''
    );
  }

  if (m.tasks && m.tasks.length > 0) {
    lines.push(
      '=== ACTION ITEMS & RESPONSIBILITIES ===',
      ...m.tasks.map(
        (t) =>
          `- [${t.completed ? 'x' : ' '}] Task: ${t.task} | Assigned to: ${t.assignedTo} | Deadline: ${t.deadline}`
      ),
      ''
    );
  } else if (m.actionItems && m.actionItems.length > 0) {
    lines.push('=== ACTION ITEMS ===', ...m.actionItems.map((a) => `- [ ] ${a}`), '');
  }

  if (m.momText?.trim()) {
    lines.push('=== FORMAL MEETING MINUTES (MoM) ===', m.momText.trim(), '');
  }

  lines.push(
    '=== FULL TRANSCRIPT ===',
    m.transcriptText?.trim() || 'No transcript text recorded.'
  );

  return lines.join('\n');
}

export function formatMoMForChat(m: PrintableMeeting): string {
  const lines: string[] = [
    `AI Meeting Assistant — Minutes of Meeting (MoM)`,
    `Meeting: ${m.title || 'Team Call'} (${m.scheduledTime || 'Completed'})`,
  ];

  if (m.aiSummary?.trim()) {
    lines.push('', `Summary: ${m.aiSummary.trim()}`);
  }

  if (m.discussionPoints && m.discussionPoints.length > 0) {
    lines.push('', ...m.discussionPoints.slice(0, 5).map((d) => `• Discussion: ${d}`));
  }

  if (m.decisions && m.decisions.length > 0) {
    lines.push('', ...m.decisions.slice(0, 5).map((d) => `• Decision: ${d}`));
  }

  if (m.tasks && m.tasks.length > 0) {
    lines.push(
      '',
      ...m.tasks
        .slice(0, 8)
        .map(
          (t) =>
            `• Task: ${t.task} | Assigned to: ${t.assignedTo} | Deadline: ${t.deadline}${t.completed ? ' (Done)' : ''}`
        )
    );
  } else if (m.actionItems && m.actionItems.length > 0) {
    lines.push('', ...m.actionItems.slice(0, 8).map((a) => `• Action: ${a}`));
  }

  return lines.join('\n').slice(0, 4800);
}

export function downloadTranscriptText(m: PrintableMeeting): void {
  const textContent = formatTranscriptAsText(m);
  const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const safeBase = (m.title || 'call-transcript')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeBase || 'call-transcript'}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
