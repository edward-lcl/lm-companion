// Interface language: English and Simplified Chinese. 'auto' follows the browser.
const DICT = {
  en: {
    app: 'LM Companion',
    // sections
    sec_missing: 'Missing', sec_missing_hint: 'Past due and not handled',
    sec_due: 'Due soon', sec_due_hint: 'Everything with a due date in your look-ahead window',
    sec_week: 'Next 7 days', sec_week_hint: 'The coming week at a glance, coloured by type',
    sec_changes: 'What changed', sec_changes_hint: 'New materials, grades and feedback (kinds in Settings)',
    sec_catchup: 'Catch up', sec_catchup_hint: "Released material you haven't done or opened",
    sec_completion: 'Course completion', sec_completion_hint: 'Moodle activity completion per module',
    due_title: 'Due in the next {n} days',
    // items
    overdue_days: '{n}d overdue', today: 'Today', tomorrow: 'Tomorrow',
    note_closed: 'Drop-box closed or group-leader-only. Check with your group.',
    from_source: 'from {s}', src_course: 'course page',
    btn_done: "I've handled this", btn_hide: 'Hide this item',
    // states
    loading: 'Loading Learning Mall… open it once if this stays here.',
    signed_out: 'Signed out of Learning Mall.', sign_in: 'Sign in', refresh_after: ' and this will refresh.',
    site_changed: 'Learning Mall changed and some data could not be read.', partial: 'Some parts could not be read: ',
    empty_due: 'Nothing with a Learning Mall due date. Check module handbooks for others.',
    more_popup: '+{n} more in the popup', all_off: 'All sections are turned off or empty. Change what shows in Settings.',
    updated_now: 'Updated just now', updated_min: 'Updated {n} min ago', updated_at: 'Updated {t}',
    // catch up
    not_done: 'not done', not_opened: 'not opened', last_opened: 'last opened {ago}',
    more_course: '+{n} more on the course page',
    catchup_hint: "From Learning Mall's own Done marks. Turn on the study log in Settings to also count what you've opened.",
    ago_today: 'today', ago_yesterday: 'yesterday', ago_days: '{n} days ago',
    // changes
    k_materials: 'New material', k_grades: 'Grade', k_feedback: 'Feedback', k_deadlines: 'Reminder',
    k_forum: 'Forum', k_announcements: 'Announcement', k_other: 'Update', grade_now: 'Course total now {g}',
    // week
    t_assign: 'Assignment', not_open_yet: 'not open yet', t_quiz: 'Quiz', t_exam: 'Exam / mock', t_other: 'Other', week_empty: 'Nothing due this day',
    ics: 'Add to calendar', ics_hint: 'Downloads an .ics file with these deadlines, including ones only listed on course pages. For a calendar that keeps itself updated, use Learning Mall’s Export calendar.',
    ics_lm: 'Learning Mall calendar export',
    // header / editor
    h_edit: 'Customize sections', h_refresh: 'Refresh', h_settings: 'Settings',
    ed_title: 'Show, hide and reorder sections', ed_reset: 'Reset', ed_reset_q: 'Reset?', ed_done: 'Done',
    ed_more: 'Dashboard panel layout and other options are in ', ed_settings: 'Settings',
    move_up: 'Move up', move_down: 'Move down', show_x: 'Show {x}',
    // panel / badge
    panel_title: 'Due & missing', panel_hide: 'Hide', panel_show: 'Show',
    badge_title: 'LM Companion: {m} missing, {n} new', badge_out: 'LM Companion: signed out of Learning Mall',
    // settings
    o_saved: 'Saved',
    o_intro: 'Reads Learning Mall with your own login, in this browser only. Nothing is sent anywhere else. It never submits, posts or opens quizzes.',
    o_lang: 'Language', o_lang_row: 'Interface language', o_lang_auto: 'Follow browser',
    o_where: 'Where it shows', o_popup: 'Toolbar popup', o_popup_hint: 'Always on.',
    o_panel: 'Panel on the Learning Mall dashboard', o_panel_hint: 'Adds a "Due & missing" block to your Dashboard page only.',
    o_sections: 'Sections', o_sections_hint: 'Turn sections on or off and drag (or use ↑ ↓) to reorder. The popup and the dashboard panel each have their own layout.',
    o_tab_popup: 'Popup', o_tab_panel: 'Dashboard panel', o_reset_layout: 'Reset to default',
    o_due: 'Due list', o_window: 'Look ahead', o_days: '{n} days', o_refresh: 'Refresh every',
    o_30m: '30 min', o_1h: '1 hour', o_3h: '3 hours',
    o_only: 'Only my modules', o_only_hint: 'Hide deadlines from non-module sites (scholarship pages, school elections).',
    o_hidden: 'Hidden or done items', o_hidden_n: '{n} item(s) hidden or marked done.', o_show_again: 'Show again',
    o_log: 'Study log (optional)', o_log_label: 'Use my Learning Mall browsing history',
    o_log_hint: 'Counts which materials you’ve actually opened, so "Catch up" is accurate. Reads only Learning Mall pages in this browser’s history and keeps the result on this device. Asks for permission when switched on.',
    o_changes: 'Show in What changed', o_c_materials: 'New materials', o_c_grades: 'Grades', o_c_feedback: 'Feedback',
    o_c_deadlines: 'Deadline reminders', o_c_forum: 'Forum posts', o_c_announcements: 'Announcements',
    o_modules: 'Modules', o_modules_empty: 'Modules appear after the first sync.',
  },
  zh: {
    app: 'LM 学习助手',
    sec_missing: '逾期未交', sec_missing_hint: '已过截止时间且尚未处理。',
    sec_due: '即将截止', sec_due_hint: '查看范围内所有有截止日期的任务。',
    sec_week: '未来一周', sec_week_hint: '一眼看清接下来 7 天，按类型着色。',
    sec_changes: '最新动态', sec_changes_hint: '新资料、成绩和评语（显示哪些类型可在设置中选择）。',
    sec_catchup: '待学内容', sec_catchup_hint: '已发布但你还没完成或打开的资料。',
    sec_completion: '课程进度', sec_completion_hint: '各课程在 Learning Mall 中的完成度。',
    due_title: '{n} 天内截止',
    overdue_days: '逾期 {n} 天', today: '今天', tomorrow: '明天',
    note_closed: '提交通道已关闭或仅限组长提交，请和组员确认',
    from_source: '来自{s}', src_course: '课程页',
    btn_done: '标记为已处理', btn_hide: '隐藏此项',
    loading: '正在读取 Learning Mall… 如果一直停在这里，请先打开一次 Learning Mall。',
    signed_out: '你已退出 Learning Mall。', sign_in: '去登录', refresh_after: '，登录后会自动刷新。',
    site_changed: 'Learning Mall 页面有变化，部分数据未能读取。', partial: '部分内容未能读取：',
    empty_due: 'Learning Mall 上暂无截止任务。有些截止日期只写在课程手册里。',
    more_popup: '还有 {n} 项，在弹窗中查看', all_off: '所有板块都已关闭或为空，可以在设置中调整。',
    updated_now: '刚刚更新', updated_min: '{n} 分钟前更新', updated_at: '更新于 {t}',
    not_done: '项未完成', not_opened: '项未打开', last_opened: '上次打开：{ago}',
    more_course: '还有 {n} 项，前往课程页查看',
    catchup_hint: '数据来自 Learning Mall 的完成状态。在设置中开启学习记录，还能统计你实际打开过的资料。',
    ago_today: '今天', ago_yesterday: '昨天', ago_days: '{n} 天前',
    k_materials: '新资料', k_grades: '成绩', k_feedback: '评语', k_deadlines: '提醒',
    k_forum: '论坛', k_announcements: '公告', k_other: '更新', grade_now: '课程总分更新为 {g}',
    t_assign: '作业', not_open_yet: '未开放', t_quiz: '测验', t_exam: '考试/模拟考', t_other: '其他', week_empty: '当天没有截止任务',
    ics: '添加到日历', ics_hint: '下载包含这些截止日期的 .ics 文件（包括只写在课程页上的）。如需自动同步的日历，请使用 Learning Mall 的日历导出。',
    ics_lm: 'Learning Mall 日历导出',
    h_edit: '自定义板块', h_refresh: '刷新', h_settings: '设置',
    ed_title: '显示、隐藏或调整板块顺序', ed_reset: '重置', ed_reset_q: '确认重置？', ed_done: '完成',
    ed_more: '仪表盘面板的布局和更多选项在', ed_settings: '设置',
    move_up: '上移', move_down: '下移', show_x: '显示{x}',
    panel_title: '截止与逾期', panel_hide: '收起', panel_show: '展开',
    badge_title: 'LM 学习助手：{m} 项逾期，{n} 条新动态', badge_out: 'LM 学习助手：已退出 Learning Mall',
    o_saved: '已保存',
    o_intro: '使用你自己的登录状态读取 Learning Mall，只在这个浏览器里运行，不会把数据发送到任何地方。不会提交作业、发帖或打开测验。',
    o_lang: '语言', o_lang_row: '界面语言', o_lang_auto: '跟随浏览器',
    o_where: '显示位置', o_popup: '工具栏弹窗', o_popup_hint: '始终开启。',
    o_panel: 'Learning Mall 仪表盘面板', o_panel_hint: '只在你的仪表盘页面添加一个「截止与逾期」卡片。',
    o_sections: '板块', o_sections_hint: '打开或关闭板块，拖动（或用 ↑ ↓）调整顺序。弹窗和仪表盘面板的布局分别设置。',
    o_tab_popup: '弹窗', o_tab_panel: '仪表盘面板', o_reset_layout: '恢复默认',
    o_due: '截止列表', o_window: '查看范围', o_days: '{n} 天', o_refresh: '刷新间隔',
    o_30m: '30 分钟', o_1h: '1 小时', o_3h: '3 小时',
    o_only: '只看我的课程', o_only_hint: '隐藏非课程站点的截止日期（如奖学金申请、学院选举）。',
    o_hidden: '已隐藏或已处理', o_hidden_n: '共 {n} 项已隐藏或标记为已处理。', o_show_again: '重新显示',
    o_log: '学习记录（可选）', o_log_label: '使用我在 Learning Mall 的浏览记录',
    o_log_hint: '统计你实际打开过哪些资料，让「待学内容」更准确。只读取本浏览器中 Learning Mall 页面的记录，结果只保存在本机。开启时会请求权限。',
    o_changes: '最新动态中显示', o_c_materials: '新资料', o_c_grades: '成绩', o_c_feedback: '评语',
    o_c_deadlines: '截止提醒', o_c_forum: '论坛帖子', o_c_announcements: '公告',
    o_modules: '课程', o_modules_empty: '首次同步后会显示你的课程。',
  },
};

// Moodle action labels we know, in Chinese. Unknown labels pass through unchanged.
const ACTIONS_ZH = { 'Add submission': '去提交', 'View choices': '查看选项', 'Add files': '上传文件',
  'Attempt quiz now': '开始测验', 'Attempt quiz': '开始测验', 'View': '查看', 'Submit': '提交' };

let LANG = 'en';
export function setLang(pref) {
  const auto = (globalThis.navigator?.language || '').toLowerCase().startsWith('zh') ? 'zh' : 'en';
  LANG = pref === 'zh' || pref === 'en' ? pref : auto;
  if (globalThis.document?.documentElement) document.documentElement.lang = LANG === 'zh' ? 'zh-CN' : 'en';
  return LANG;
}
export const lang = () => LANG;
export const locale = () => (LANG === 'zh' ? 'zh-CN' : undefined);
export function t(key, vars = {}) {
  const s = DICT[LANG]?.[key] ?? DICT.en[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
}
export const tAction = (a) => (LANG === 'zh' ? ACTIONS_ZH[a] || a : a);
export function applyI18n(root = document) {
  for (const n of root.querySelectorAll('[data-i18n]')) n.textContent = t(n.dataset.i18n, n.dataset.i18nN ? { n: n.dataset.i18nN } : {});
  for (const n of root.querySelectorAll('[data-i18n-title]')) n.title = t(n.dataset.i18nTitle);
}
export const KEYS = { en: Object.keys(DICT.en), zh: Object.keys(DICT.zh) };
