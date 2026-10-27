// Offscreen document: only job is DOMParser. Service workers have fetch + storage but no DOMParser;
// offscreen documents have DOMParser but no chrome.storage. So the worker sends HTML here and gets
// back plain JSON extracted by the same parser functions the tests cover.
import { parseCourseModules, parseGradeOverview } from './lib/moodle.js';

const parseHTML = (html) => new DOMParser().parseFromString(html, 'text/html');
const PARSERS = { courseModules: parseCourseModules, gradeOverview: parseGradeOverview };

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg.target !== 'offscreen' || msg.cmd !== 'parse') return;
  try { reply({ ok: true, value: PARSERS[msg.parser](msg.html, parseHTML) }); }
  catch (e) { reply({ ok: false, code: e.code, what: e.what, message: e.message }); }
});
