// Calendar helpers: classify deadline types for colour, build the 7-day week, export .ics.

// Exams and mock tests are usually Moodle quizzes or assignments with telling names.
const EXAM = /\b(exam|mock|midterm|mid-term|final|test|in-class test|class test|quiz test)\b|考试|模拟/i;
export function eventKind(d) {
  if (EXAM.test(d.name || '')) return 'exam';
  if (d.type === 'quiz') return 'quiz';
  if (d.type === 'assign' || d.type === 'turnitintooltwo') return 'assign';
  return 'other';
}

// Local-calendar days starting today; each day gets the deadlines due on it.
export function week(deadlines, now = Date.now(), days = 7) {
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const out = [];
  for (let i = 0; i < days; i++) {
    const from = start.getTime() + i * 86400000;
    const to = from + 86400000;
    out.push({ date: from, items: deadlines.filter((d) => d.due >= from && d.due < to).sort((a, b) => a.due - b.due) });
  }
  return out;
}

const pad = (n) => String(n).padStart(2, '0');
const icsDate = (ms) => { const d = new Date(ms); return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`; };
const esc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
// RFC 5545 line folding at 75 octets.
const fold = (line) => { const out = []; let s = line; while (Buffer_len(s) > 75) { let i = 74; while (Buffer_len(s.slice(0, i)) > 74) i--; out.push(s.slice(0, i)); s = ' ' + s.slice(i); } out.push(s); return out.join('\r\n'); };
const Buffer_len = (s) => new TextEncoder().encode(s).length;

// Deadlines -> iCalendar text. Each item becomes a 30-minute event ending at the due time, with a
// reminder the evening before. UIDs are stable so re-importing updates instead of duplicating.
export function toICS(deadlines, now = Date.now()) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//LM Companion//XJTLU Learning Mall//EN', 'CALSCALE:GREGORIAN',
    'X-WR-CALNAME:Learning Mall deadlines'];
  for (const d of deadlines) {
    const kind = eventKind(d);
    lines.push('BEGIN:VEVENT',
      `UID:lmc-${String(d.id).replace(/[^\w:-]/g, '')}@core.xjtlu.edu.cn`,
      `DTSTAMP:${icsDate(now)}`,
      `DTSTART:${icsDate(d.due - 30 * 60000)}`,
      `DTEND:${icsDate(d.due)}`,
      `SUMMARY:${esc(`${d.code ? d.code + ' ' : ''}${d.name}`)}`,
      `CATEGORIES:${kind.toUpperCase()}`,
      d.url ? `URL:${esc(d.url)}` : null,
      `DESCRIPTION:${esc(`Due ${new Date(d.due).toISOString()} · ${d.course || ''}${d.url ? '\n' + d.url : ''}`)}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(d.name)}`, 'TRIGGER:-PT12H', 'END:VALARM',
      'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.filter(Boolean).map(fold).join('\r\n') + '\r\n';
}
