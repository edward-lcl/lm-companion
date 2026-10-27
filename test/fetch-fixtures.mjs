// Fetch real Learning Mall pages once so the parsers are built against actual markup.
// Output goes to test/fixtures/private/ (gitignored: contains personal data).
import fs from 'node:fs';
const M = process.env.XJTLU_CORE_CLIENT || `${process.env.HOME}/.local/share/xjtlu-core-mcp/node_modules/xjtlu-core-mcp/src/moodle/client.js`;
const { MoodleClient } = await import(M);
const c = new MoodleClient({});
const out = new URL('./fixtures/private', import.meta.url).pathname;
fs.mkdirSync(out, { recursive: true });
const save = (name, body) => { fs.writeFileSync(`${out}/${name}`, body); console.log('saved', name, body.length); };
save('my.html', await c.html('/my/'));
save('my-courses.html', await c.html('/my/courses.php'));
const { courses } = await c.courses();
save('courses.json', JSON.stringify(courses, null, 1));
const course = courses.find((x) => /MTH015/.test(x.name)) || courses[0];
const html = await c.html(`/course/view.php?id=${course.id}`);
save('course.html', html);
const co = await c.course(course.id);
const assign = co.items.find((i) => i.type === 'assign' && i.available);
const quiz = co.items.find((i) => i.type === 'quiz' && i.available);
if (assign) save('assign.html', await c.html(`/mod/assign/view.php?id=${assign.id}`));
if (quiz) save('quiz.html', await c.html(`/mod/quiz/view.php?id=${quiz.id}`));
save('upcoming.json', JSON.stringify(await c.upcoming(30), null, 1));
