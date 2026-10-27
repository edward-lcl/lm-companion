// Time helpers shared by the popup, panel and toolbar icon. Pure and unit-tested.
const H = 3600000;

// Countdown for anything due within `within` hours (default 24): { h, m } or null.
export function countdown(due, now = Date.now(), within = 24) {
  const ms = due - now;
  if (ms <= 0 || ms > within * H) return null;
  return { h: Math.floor(ms / H), m: Math.floor((ms % H) / 60000) };
}

// Data freshness. 'fresh' within ~2 refresh periods, 'stale' after that, 'old' after a day.
export function freshness(snapshotAt, refreshMinutes = 60, now = Date.now()) {
  if (!snapshotAt) return 'none';
  const age = now - snapshotAt;
  if (age > 24 * H) return 'old';
  if (age > Math.max(2 * refreshMinutes * 60000, 2 * H)) return 'stale';
  return 'fresh';
}

// Toolbar meter: how close the nearest open deadline is, as 0..1 (1 = due now or overdue),
// over a 7-day horizon. Also returns the level used for colour.
export function pressure(deadlines, now = Date.now()) {
  const open = deadlines.filter((d) => !d.submitted);
  if (open.some((d) => d.overdue)) return { fill: 1, level: 'overdue' };
  const next = open.filter((d) => d.due > now).sort((a, b) => a.due - b.due)[0];
  if (!next) return { fill: 0, level: 'clear' };
  const left = next.due - now;
  const fill = Math.max(0, Math.min(1, 1 - left / (7 * 24 * H)));
  return { fill, level: left < 24 * H ? 'today' : left < 72 * H ? 'soon' : 'calm', next };
}
