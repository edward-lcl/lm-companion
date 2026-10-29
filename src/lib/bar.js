// Menu bar bridge: builds the payload the LM Bar Mac app shows, and syncs ticks both ways.
// Pure (unit-tested); background.js sends it through native messaging to `edu.xjtlu.lmbar`.
import { classify } from './sync.js';
import { eventKind } from './calendar.js';

export const HOST = 'edu.xjtlu.lmbar';

// Display preference only: never changes ticks, layout, panel preference or notification ownership.
export function companionMode(settings = {}, barStatus, hasPermission = false) {
  if (settings.displayMode === 'standalone') return false;
  if (settings.displayMode === 'companion') return true;
  return hasPermission && barStatus?.ok === true;
}

export function renderCompanion(root, { zh = false, barStatus, status, snapshot, hasPermission = true }, actions = {}) {
  root.textContent = '';
  const doc = root.ownerDocument;
  const add = (tag, text) => { const node = doc.createElement(tag); node.textContent = text; root.append(node); return node; };
  add('h2', zh ? 'LM Bar 配套模式' : 'LM Bar companion mode');
  add('p', zh ? '任务、目标和显示设置在 Mac 菜单栏的 LM Bar 中。' : 'Tasks, targets and display settings are in LM Bar in your Mac menu bar.');
  add('p', hasPermission && barStatus?.ok ? (zh ? '桥接：上次连接成功' : 'Bridge: last connection succeeded') : (zh ? '桥接：未连接，请在浏览器设置中连接。' : 'Bridge: not connected. Connect in browser settings.'));
  const stamp = (at) => at ? new Date(at).toLocaleString(zh ? 'zh-CN' : 'en-US') : (zh ? '尚无' : 'Not yet');
  add('p', (zh ? '上次桥接尝试：' : 'Last bridge attempt: ') + stamp(barStatus?.at));
  add('p', (zh ? '上次 LM 读取：' : 'Last LM read: ') + stamp(snapshot?.at));
  add('p', status?.state === 'signed_out' ? (zh ? 'LM：请在浏览器中登录。' : 'LM: Sign in in your browser.') : status?.state === 'ok' ? (zh ? 'LM：上次读取成功。' : 'LM: last read succeeded.') : (zh ? 'LM：状态未知或读取不完整；可重试同步。' : 'LM: unknown or incomplete read; retry sync.'));
  const signIn = add('a', zh ? '打开 LM / 登录' : 'Open LM / Sign in');
  signIn.href = 'https://core.xjtlu.edu.cn/my/'; signIn.target = '_blank'; signIn.rel = 'noopener';
  add('p', zh ? '浏览器仍负责提醒、通知权限和学习记录的历史权限；此模式不会关闭或复制提醒。' : 'Reminders, notification permission and study-log history permission remain browser-owned. This mode neither disables nor duplicates reminders.');
  const settings = add('button', zh ? '连接与浏览器设置' : 'Connection & browser settings');
  settings.type = 'button'; settings.onclick = actions.settings;
  const standalone = add('button', zh ? '切换为独立模式' : 'Use standalone mode');
  standalone.type = 'button'; standalone.onclick = actions.standalone;
}

export function buildPayload({ snapshot, status, settings, changes = [], lastSeenAt = 0, lang = 'en', now = Date.now() }) {
  const visible = changes.filter(c => settings.changes?.[c.kind] !== false);
  const changeAt = c => c.at || c.seenAt || 0;
  const s = { ...settings, doneItems: [], hiddenItems: settings.hiddenItems || [] };   // the app decides done/not-done itself
  const { missing, upcoming } = classify(snapshot?.deadlines || [], now, 30, s);
  const done = new Set(settings.doneItems || []);
  const items = [...missing, ...upcoming].map((d) => ({
    id: d.id, name: d.name, code: d.code || null, course: d.course || null, due: d.due, url: d.url || null,
    kind: eventKind(d), overdue: !!d.overdue, closedNote: d.overdue && d.actionable === false ? true : null,
    action: d.action && d.actionable !== false ? d.action : null,
  }));
  const history = (snapshot?.assignmentHistory || []).filter((d) =>
    !(settings.hiddenItems || []).includes(d.id) && !(settings.hiddenCourses || []).includes(d.courseId) &&
    !(settings.onlyModules && !d.code))
    .map((d) => ({ id: d.id, name: d.name, code: d.code || null, course: d.course || null,
      due: d.due, url: d.url || null, kind: 'assign', overdue: !!d.overdue,
      sourceStatus: d.sourceStatus || 'unknown', feedState: d.feedState,
      firstObservedSubmittedAt: d.firstObservedSubmittedAt || null, submittedAt: d.submittedAt || null,
      statusCheckedAt: d.statusCheckedAt || null }));
  // Ticked in the browser without a timestamp (older "mark done"): treat as ticked at sync time.
  const doneAt = {};
  for (const id of done) doneAt[id] = settings.doneAt?.[id] ?? (snapshot?.at || now);
  const catchup = (snapshot?.engagement || [])
    .filter((m) => m.unopened?.length && !(settings.hiddenCourses || []).includes(m.courseId))
    .map((m) => ({ code: m.code, n: m.unopened.length, url: `https://core.xjtlu.edu.cn/course/view.php?id=${m.courseId}` }))
    .sort((a, b) => b.n - a.n);
  const completion = (snapshot?.courses || []).filter((c) => c.code)
    .map((c) => ({ code: c.code, pct: c.progress ?? null, url: c.url || null }));
  return {
    v: 1, at: snapshot?.at || 0, sentAt: now, status: status?.state || 'ok', lang,
    windowDays: settings.windowDays || 14, items, history, catchup, completion, doneAt,
    changes: visible.slice().sort((a, b) => changeAt(b) - changeAt(a)).slice(0, 20).map((c) => ({
      kind: c.kind || 'other', title: c.title || '', course: c.course || null, url: c.url || null, at: changeAt(c),
    })),
    unseenChanges: visible.filter((c) => (c.seenAt || c.at || 0) > lastSeenAt).length,
  };
}

// Menu-bar marks -> extension settings, last write wins against the browser's own ticks.
export function mergeMarks(settings, marks = {}) {
  const doneAt = { ...(settings.doneAt || {}) };
  let doneItems = new Set(settings.doneItems || []);
  let changed = false;
  for (const [id, m] of Object.entries(marks)) {
    const browserAt = doneAt[id] ?? (doneItems.has(id) ? 0 : -1);
    if (m.at <= browserAt) continue;
    if (m.done && !doneItems.has(id)) { doneItems.add(id); doneAt[id] = m.at; changed = true; }
    if (!m.done && doneItems.has(id)) { doneItems.delete(id); delete doneAt[id]; changed = true; }
  }
  return { changed, settings: { ...settings, doneItems: [...doneItems], doneAt } };
}
