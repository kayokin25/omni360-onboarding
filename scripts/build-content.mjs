// One-time/repeatable transform: onboarding-omni360.html (single long document)
// -> content/course-data.js (data-driven, step-by-step course structure).
//
// Parses the existing, already-correct markup rather than re-typing content by hand.
// Re-run after editing onboarding-omni360.html's prose to pick up changes:
//   npm run build:content

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, '..', 'onboarding-omni360.html');
const OUT_DIR = join(__dirname, '..', 'content');
const OUT_FILE = join(OUT_DIR, 'course-data.js');

const html = readFileSync(SRC, 'utf8');
const $ = cheerio.load(html, { decodeEntities: false });

function text(el) {
  return $(el).text().trim().replace(/\s+/g, ' ');
}
function outer(el) {
  return $.html(el);
}

// Group an ordered list of top-level body nodes into steps.
// Each h4.lbl starts a new "concept" step; .quiz/.opentask/.ckbox each become
// their own single-purpose step. Anything before the first h4 attaches to the
// first concept step (or becomes its own lead-in step if nothing follows it).
function groupIntoSteps(children) {
  const steps = [];
  let current = null;

  function flush() {
    if (current && current.htmlParts.length) {
      steps.push({ type: current.type, title: current.title, html: current.htmlParts.join('\n') });
    }
    current = null;
  }

  for (const el of children) {
    const cls = ($(el).attr('class') || '');
    if (cls.includes('quiz')) {
      flush();
      steps.push({ type: 'quiz', title: null, html: outer(el) });
      continue;
    }
    if (cls.includes('opentask')) {
      flush();
      steps.push({ type: 'opentask', title: null, html: outer(el) });
      continue;
    }
    if (cls.includes('ckbox')) {
      flush();
      steps.push({ type: 'checklist', title: null, html: outer(el) });
      continue;
    }
    if (el.tagName === 'h4' && cls.includes('lbl')) {
      flush();
      current = { type: 'concept', title: text(el), htmlParts: [outer(el)] };
      continue;
    }
    if (!current) current = { type: 'concept', title: null, htmlParts: [] };
    current.htmlParts.push(outer(el));
  }
  flush();
  return steps;
}

// ---- modules (M1..M11) ----
const modules = [];
$('article.card[data-block]').each((_, article) => {
  const id = $(article).attr('data-block');
  const number = text($(article).find('.mod-n'));
  const title = text($(article).find('.mod-title'));
  const goal = text($(article).find('.mod-goal'));
  const duration = text($(article).find('.mod-dur'));
  const srcs = $(article).find('.src span').map((_, s) => text(s)).get();

  const bodyChildren = $(article)
    .children()
    .not('.mod-head')
    .not('.src')
    .toArray();

  const steps = groupIntoSteps(bodyChildren);
  modules.push({ id, number, title, goal, duration, srcs, steps });
});

// ---- tasks (T1..T7) ----
const tasks = [];
$('article.task[data-block]').each((_, article) => {
  const id = $(article).attr('data-block');
  const stage = text($(article).find('.task-stage'));
  const title = text($(article).find('.task-title'));
  const diff = text($(article).find('.diff'));
  const io = $(article)
    .find('.io > div')
    .map((_, d) => ({ k: text($(d).find('.k')), v: text(d).replace(text($(d).find('.k')), '').trim() }))
    .get();

  const bodyChildren = $(article)
    .children()
    .not('.task-head')
    .not('.io')
    .toArray();

  const steps = groupIntoSteps(bodyChildren);
  tasks.push({ id, stage, title, diff, io, steps });
});

// ---- weeks (grouping metadata for the rail) ----
const weeks = [];
$('section.part[id^="w"]').each((_, section) => {
  const id = $(section).attr('id');
  const kicker = text($(section).find('.part-kicker'));
  const time = text($(section).find('.part-time'));
  const wtitle = text($(section).find('.part-title'));
  const lede = text($(section).find('.part-lede'));
  const moduleIds = $(section).find('article.card[data-block]').map((_, a) => $(a).attr('data-block')).get();
  weeks.push({ id, kicker, time, title: wtitle, lede, moduleIds });
});

// ---- intro ("Как устроена программа") ----
const introSection = $('section.part#start');
const intro = {
  kicker: text(introSection.find('.part-kicker')),
  title: text(introSection.find('.part-title')),
  html: outer(introSection.find('.card').get(0)),
};

// ---- tasks section lede ----
const tasksSection = $('section.part#tasks');
const tasksIntro = {
  kicker: text(tasksSection.find('.part-kicker')),
  title: text(tasksSection.find('.part-title')),
  lede: text(tasksSection.find('.part-lede')),
};

// ---- glossary ----
const glossary = { html: outer($('section.part#gloss .card').get(0)) };

// ---- exam ----
const examSection = $('section.part#exam .card');
const examChildren = examSection.children().toArray();
const examSteps = groupIntoSteps(examChildren);
const exam = { steps: examSteps };

// ---- top-level meta ----
const meta = {
  eyebrow: text($('.eyebrow').get(0)),
  title: text($('h1.title')),
  sub: text($('.sub')),
  srclinks: $('.srclink').map((_, a) => ({ label: text($(a).find('.m')), text: text(a).replace(text($(a).find('.m')), '').trim(), href: $(a).attr('href') })).get(),
  footer: text($('.footer')),
  totalCheckItems: $('.ckbox input[type=checkbox]').length,
  totalQuizItems: $('.quiz').length,
  totalOpentasks: $('.opentask').length,
};

const data = { meta, intro, weeks, modules, tasksIntro, tasks, glossary, exam };

mkdirSync(OUT_DIR, { recursive: true });
const banner = '// GENERATED by scripts/build-content.mjs from onboarding-omni360.html — do not hand-edit, re-run the script instead.\n';
const body = `${banner}(function (root, factory) {\n  if (typeof module === 'object' && module.exports) module.exports = factory();\n  else root.COURSE_DATA = factory();\n})(typeof self !== 'undefined' ? self : this, function () {\n  return ${JSON.stringify(data, null, 2)};\n});\n`;
writeFileSync(OUT_FILE, body, 'utf8');

const totalConceptSteps = modules.reduce((n, m) => n + m.steps.length, 0) + tasks.reduce((n, t) => n + t.steps.length, 0);
console.log(`Wrote ${OUT_FILE}: ${modules.length} modules, ${tasks.length} tasks, ${totalConceptSteps} steps total.`);
