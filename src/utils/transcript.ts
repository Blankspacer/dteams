import { jsPDF } from 'jspdf';
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

function getSafeFileBase(title?: string): string {
  const base = (title || 'meeting-minutes')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return base || 'meeting-minutes';
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

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

export function formatMeetingMinutesAsMarkdown(m: PrintableMeeting): string {
  const lines: string[] = [
    `# ${m.title || 'Meeting Minutes (MoM)'}`,
    '',
    `- **Organizer:** ${m.organizerName || 'Team Member'}`,
    `- **Date / Time:** ${m.scheduledTime || new Date().toLocaleString()}`,
    '',
  ];

  if (m.aiSummary?.trim()) {
    lines.push('## Executive Summary', '', m.aiSummary.trim(), '');
  }

  if (m.discussionPoints && m.discussionPoints.length > 0) {
    lines.push(
      '## Important Discussion Points',
      '',
      ...m.discussionPoints.map((d) => `- ${d}`),
      ''
    );
  }

  if (m.decisions && m.decisions.length > 0) {
    lines.push(
      '## Key Decisions',
      '',
      ...m.decisions.map((d) => `- ${d}`),
      ''
    );
  }

  if (m.tasks && m.tasks.length > 0) {
    lines.push(
      '## Action Items & Responsibilities',
      '',
      '| Done | Task | Assigned To | Deadline |',
      '| :---: | --- | --- | --- |',
      ...m.tasks.map((t) => {
        const cleanTask = t.task.replace(/\|/g, '\\|');
        const cleanOwner = t.assignedTo.replace(/\|/g, '\\|');
        const cleanDeadline = t.deadline.replace(/\|/g, '\\|');
        return `| ${t.completed ? 'x' : ' '} | ${cleanTask} | ${cleanOwner} | ${cleanDeadline} |`;
      }),
      ''
    );
  } else if (m.actionItems && m.actionItems.length > 0) {
    lines.push(
      '## Action Items',
      '',
      ...m.actionItems.map((a) => `- [ ] ${a}`),
      ''
    );
  }

  if (m.momText?.trim()) {
    lines.push('## Formal Minutes of Meeting (MoM)', '', m.momText.trim(), '');
  }

  lines.push(
    '## Full Transcript',
    '',
    m.transcriptText?.trim() || '_No transcript text recorded._',
    ''
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
  triggerBlobDownload(blob, `${getSafeFileBase(m.title)}.txt`);
}

export function downloadMeetingMinutesMarkdown(m: PrintableMeeting): void {
  const mdContent = formatMeetingMinutesAsMarkdown(m);
  const blob = new Blob([mdContent], { type: 'text/markdown;charset=utf-8' });
  triggerBlobDownload(blob, `${getSafeFileBase(m.title)}-mom.md`);
}

export function downloadMeetingMinutesPdf(m: PrintableMeeting): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 44;
  const maxWidth = pageWidth - margin * 2;
  let y = margin;

  const ensureSpace = (needed = 24) => {
    if (y + needed > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
  };

  const writeWrapped = (
    text: string,
    opts?: { fontSize?: number; bold?: boolean; color?: [number, number, number]; lineHeight?: number; indent?: number }
  ) => {
    const fontSize = opts?.fontSize ?? 10.5;
    const lineHeight = opts?.lineHeight ?? fontSize * 1.45;
    const indent = opts?.indent ?? 0;
    const [r, g, b] = opts?.color ?? [30, 41, 59];

    doc.setFont('helvetica', opts?.bold ? 'bold' : 'normal');
    doc.setFontSize(fontSize);
    doc.setTextColor(r, g, b);

    const paragraphs = text.split('\n');
    for (const para of paragraphs) {
      const lines: string[] = para.trim()
        ? doc.splitTextToSize(para, maxWidth - indent)
        : [''];
      for (const line of lines) {
        ensureSpace(lineHeight);
        if (line) {
          doc.text(line, margin + indent, y);
        }
        y += lineHeight;
      }
    }
  };

  const writeSectionHeading = (heading: string) => {
    y += 8;
    ensureSpace(32);
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, y, pageWidth - margin, y);
    y += 16;
    writeWrapped(heading.toUpperCase(), {
      fontSize: 9.5,
      bold: true,
      color: [2, 132, 199],
      lineHeight: 15,
    });
    y += 2;
  };

  // Header
  writeWrapped('SPHERECALL · AI MEETING ASSISTANT', {
    fontSize: 9,
    bold: true,
    color: [2, 132, 199],
    lineHeight: 14,
  });
  writeWrapped(m.title || 'Meeting Minutes (MoM)', {
    fontSize: 18,
    bold: true,
    color: [15, 23, 42],
    lineHeight: 24,
  });
  writeWrapped(
    `Organizer: ${m.organizerName || 'Team Member'}   |   Time: ${m.scheduledTime || new Date().toLocaleString()}`,
    {
      fontSize: 9.5,
      color: [100, 116, 139],
      lineHeight: 16,
    }
  );

  if (m.aiSummary?.trim()) {
    writeSectionHeading('Executive Summary');
    writeWrapped(m.aiSummary.trim());
  }

  if (m.discussionPoints && m.discussionPoints.length > 0) {
    writeSectionHeading('Important Discussion Points');
    m.discussionPoints.forEach((point) => {
      writeWrapped(`• ${point}`, { indent: 8 });
    });
  }

  if (m.decisions && m.decisions.length > 0) {
    writeSectionHeading('Key Decisions');
    m.decisions.forEach((decision) => {
      writeWrapped(`✓ ${decision}`, { indent: 8 });
    });
  }

  if (m.tasks && m.tasks.length > 0) {
    writeSectionHeading('Action Items & Responsibilities');
    m.tasks.forEach((t, idx) => {
      const statusTag = t.completed ? '[Done]' : '[Open]';
      writeWrapped(`${idx + 1}. ${statusTag} ${t.task}`, { bold: true, indent: 6 });
      writeWrapped(
        `Assigned to: ${t.assignedTo}   |   Deadline: ${t.deadline}`,
        { fontSize: 9.5, color: [71, 85, 105], indent: 18, lineHeight: 14 }
      );
      y += 4;
    });
  } else if (m.actionItems && m.actionItems.length > 0) {
    writeSectionHeading('Action Items');
    m.actionItems.forEach((item) => {
      writeWrapped(`• ${item}`, { indent: 8 });
    });
  }

  if (m.momText?.trim()) {
    writeSectionHeading('Formal Minutes of Meeting (MoM)');
    writeWrapped(m.momText.trim(), { fontSize: 9.5, color: [51, 65, 85], lineHeight: 14 });
  }

  if (m.transcriptText?.trim()) {
    writeSectionHeading('Full Transcript');
    writeWrapped(m.transcriptText.trim(), { fontSize: 9.5, color: [71, 85, 105], lineHeight: 14 });
  }

  // Page numbers
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Generated by SphereCall AI Meeting Assistant · Page ${i} of ${totalPages}`,
      margin,
      pageHeight - 20
    );
  }

  doc.save(`${getSafeFileBase(m.title)}-mom.pdf`);
}
