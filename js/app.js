(function () {
  'use strict';

  var params = new URLSearchParams(location.search);
  var token = params.get('t');
  var app = document.getElementById('app');
  var D = window.COURSE_DATA;

  wireLightbox();

  if (!token) { showError('Нет ссылки', 'Откройте страницу по персональной ссылке, которую вам прислал руководитель.'); return; }

  // screenshots render at ~780px inside the card but are 1400-1900px wide, so the
  // UI labels the text refers to are unreadable — click any of them for full size.
  // delegated on document so it survives every re-render.
  function wireLightbox() {
    function close() {
      var box = document.querySelector('.lightbox');
      if (box) box.remove();
      return !!box;
    }
    document.addEventListener('click', function (e) {
      if (close()) return;
      var img = e.target.tagName === 'IMG' && e.target.classList.contains('shotimg') ? e.target : null;
      if (!img) return;
      var box = document.createElement('div');
      box.className = 'lightbox';
      var full = new Image();
      full.src = img.src;
      full.alt = img.alt;
      box.appendChild(full);
      document.body.appendChild(box);
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
  }

  function api(path, opts) {
    opts = opts || {};
    var url = '/api/' + path;
    return fetch(url, opts).then(function (r) {
      if (!r.ok) return r.json().then(function (e) { throw new Error(e.error || r.statusText); });
      return r.json();
    });
  }

  function showError(title, msg) {
    app.innerHTML =
      '<div class="state-screen"><h1>' + escapeHtml(title) + '</h1><p>' + escapeHtml(msg) + '</p></div>';
  }

  function escapeHtml(s) {
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  // ---------- chapters ----------
  function buildChapters() {
    var list = [];
    list.push({ key: 'intro', short: 'Начало', kind: 'intro' });
    D.modules.forEach(function (m) { list.push({ key: m.id, short: m.number, kind: 'module', data: m }); });
    D.tasks.forEach(function (t) {
      var n = t.id.replace('t', '');
      list.push({ key: t.id, short: 'Т' + n, kind: 'task', data: t });
    });
    list.push({ key: 'glossary', short: 'Словарь', kind: 'glossary' });
    list.push({ key: 'exam', short: 'Аттестация', kind: 'exam' });
    return list;
  }
  var chapters = buildChapters();

  // where each open question lives, so a manager's reply can link straight to it
  var STEP_OF_KEY = {};
  chapters.forEach(function (c) {
    chapterSteps(c).forEach(function (s, i) {
      if (s.type !== 'opentask') return;
      var key = (s.html.match(/data-k="([^"]+)"/) || [])[1];
      if (!key) return;
      var label = (s.html.match(/data-label="([^"]*)"/) || [])[1] || c.short;
      STEP_OF_KEY[key] = { chapter: c.key, step: i, label: label };
    });
  });

  function unreadMessages(key) {
    var thread = state.feedback[key] || [];
    var seen = state.feedbackSeen[key];
    // ISO strings sort lexicographically, so a plain > is enough here
    return seen ? thread.filter(function (f) { return f.at > seen; }) : thread.slice();
  }

  function unreadInChapter(chapterKey) {
    return Object.keys(STEP_OF_KEY).reduce(function (acc, key) {
      var loc = STEP_OF_KEY[key];
      if (loc.chapter !== chapterKey) return acc;
      var messages = unreadMessages(key);
      if (messages.length) acc.push({ key: key, loc: loc, messages: messages });
      return acc;
    }, []);
  }

  function markRead(keys) {
    var seenAt = new Date().toISOString();
    keys.forEach(function (k) { state.feedbackSeen[k] = seenAt; });
    api('mark-feedback-read', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ t: token, questionKeys: keys }),
    }).catch(function () { /* best-effort; the dot is already cleared locally */ });
  }

  // ---------- app state ----------
  var me = null; // {name, role}
  var state = null; // {answers, feedback, quizzes}
  var navKey = 'onboarding-nav:' + token;
  var current = loadNav();

  function loadNav() {
    try {
      var raw = localStorage.getItem(navKey);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return { chapter: 'intro', step: 0 };
  }
  function saveNav() {
    try { localStorage.setItem(navKey, JSON.stringify(current)); } catch (e) {}
  }

  function chapterIndex(key) {
    for (var i = 0; i < chapters.length; i++) if (chapters[i].key === key) return i;
    return 0;
  }

  function totalAnswered() {
    return Object.keys(state.answers).length;
  }

  // a module/task/exam is "done" once every one of its open answers is sent
  // and every one of its quiz blocks is passed; intro/glossary have neither
  function isChapterDone(ch) {
    var data = ch.data || (ch.kind === 'exam' ? D.exam : null);
    if (!data) return false;
    var otKeys = data.opentaskKeys || [];
    var qKeys = data.quizBlockKeys || [];
    if (!otKeys.length && !qKeys.length) return false;
    return otKeys.every(function (k) { return !!state.answers[k]; }) &&
      qKeys.every(function (k) { return state.quizzes[k] && state.quizzes[k].passed; });
  }

  // ---------- boot ----------
  api('whoami?t=' + encodeURIComponent(token))
    .then(function (person) {
      if (person.role === 'manager') {
        location.href = 'manager.html?t=' + encodeURIComponent(token);
        return null;
      }
      me = person;
      return api('get-state?t=' + encodeURIComponent(token));
    })
    .then(function (s) {
      if (!s) return;
      state = s;
      // states saved before feedbackSeen existed come back without it
      if (!state.feedbackSeen) state.feedbackSeen = {};
      render();
    })
    .catch(function (err) {
      showError('Ссылка не работает', 'Проверьте, что скопировали её целиком. Если проблема повторяется — напишите руководителю. (' + err.message + ')');
    });

  // ---------- render ----------
  function render() {
    var ch = chapters[chapterIndex(current.chapter)];
    app.innerHTML =
      '<div class="shell">' +
        '<div class="masthead">' +
          '<div class="eyebrow">' + escapeHtml(D.meta.eyebrow) + '</div>' +
          '<h1 class="title">' + escapeHtml(D.meta.title) + '</h1>' +
          '<p class="sub">' + escapeHtml(D.meta.sub) + '</p>' +
          '<div class="whoami">Вы вошли как <b>' + escapeHtml(me.name) + '</b></div>' +
        '</div>' +
        '<div class="progress">' +
          '<div class="progress-top"><h2>Прогресс</h2><span class="progress-num"><b>' + totalAnswered() + '</b> из ' + D.meta.totalOpentasks + ' заданий отправлено</span></div>' +
          '<div class="progress-bar"><i style="width:' + Math.round(100 * totalAnswered() / D.meta.totalOpentasks) + '%"></i></div>' +
        '</div>' +
        '<nav class="rail" id="chapterRail"></nav>' +
        '<div id="chapterBody"></div>' +
      '</div>';

    var rail = document.getElementById('chapterRail');
    chapters.forEach(function (c) {
      var unread = unreadInChapter(c.key);
      var b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = escapeHtml(c.short) +
        (unread.length ? ' <span class="rail-dot" aria-label="есть ответ руководителя"></span>' : '') +
        (isChapterDone(c) ? ' <span class="rail-done">✓</span>' : '');
      b.className = (c.key === ch.key ? 'active' : '') + (unread.length ? ' has-feedback' : '');
      b.addEventListener('click', function () {
        // a chapter with an unanswered reply shows the reply first, rather than
        // silently dropping the student on step 1 to hunt for it
        if (unread.length) { openFeedback(c, unread); return; }
        current = { chapter: c.key, step: 0 };
        saveNav();
        render();
      });
      rail.appendChild(b);
    });

    renderChapter(ch);
  }

  function openFeedback(chapter, items) {
    var wrap = document.createElement('div');
    wrap.className = 'fbmodal';
    wrap.innerHTML =
      '<div class="fbmodal-card" role="dialog" aria-modal="true" aria-labelledby="fbTitle">' +
        '<div class="fbmodal-head">' +
          '<div>' +
            '<div class="fbmodal-kicker">' + escapeHtml(chapter.short) + '</div>' +
            '<h3 id="fbTitle">' + (items.length === 1 ? 'Руководитель ответил на ваше задание' : 'Руководитель ответил на ' + items.length + ' ваших задания') + '</h3>' +
          '</div>' +
          '<button type="button" class="fbmodal-x" id="fbX" aria-label="Закрыть">&times;</button>' +
        '</div>' +
        '<div class="fbmodal-body">' +
          items.map(function (it) {
            return '<div class="fbmodal-item">' +
              '<div class="fbmodal-q">' + escapeHtml(it.loc.label) + '</div>' +
              it.messages.map(function (f) {
                return '<div class="feedback-msg"><div class="fm-head">' + escapeHtml(f.author) + ' · ' + formatDate(f.at) + '</div>' + escapeHtml(f.text) + '</div>';
              }).join('') +
              '<button type="button" class="fbmodal-go" data-key="' + escapeHtml(it.key) + '">Перейти к ответу →</button>' +
            '</div>';
          }).join('') +
        '</div>' +
        '<div class="fbmodal-foot">' +
          '<button type="button" class="btn" id="fbRead">Отметить прочитанным</button>' +
          '<button type="button" class="btn ghost" id="fbClose">Закрыть</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(wrap);

    function close() {
      wrap.remove();
      document.removeEventListener('keydown', onKey);
    }
    function onKey(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);

    // backdrop only — a click inside the card must not dismiss it
    wrap.addEventListener('click', function (e) { if (e.target === wrap) close(); });
    wrap.querySelector('#fbX').addEventListener('click', close);
    wrap.querySelector('#fbClose').addEventListener('click', close);

    wrap.querySelector('#fbRead').addEventListener('click', function () {
      markRead(items.map(function (it) { return it.key; }));
      close();
      render();
    });

    Array.prototype.forEach.call(wrap.querySelectorAll('.fbmodal-go'), function (btn) {
      btn.addEventListener('click', function () {
        var key = btn.dataset.key;
        // they are about to read it in place, so the dot has done its job
        markRead([key]);
        current = { chapter: STEP_OF_KEY[key].chapter, step: STEP_OF_KEY[key].step };
        saveNav();
        close();
        render();
        window.scrollTo({ top: 0 });
      });
    });

    wrap.querySelector('#fbRead').focus();
  }

  // every chapter, even a single-screen one like intro/glossary, exposes a
  // steps array so next/prev can flow continuously across the whole course
  function chapterSteps(ch) {
    if (ch.kind === 'intro') return [{ html: D.intro.html }];
    if (ch.kind === 'glossary') return [{ html: D.glossary.html }];
    if (ch.kind === 'module') return ch.data.steps;
    if (ch.kind === 'task') return ch.data.steps;
    if (ch.kind === 'exam') return D.exam.steps;
    return [{ html: '' }];
  }

  function renderChapter(ch) {
    var body = document.getElementById('chapterBody');

    var steps = chapterSteps(ch);
    var head;
    if (ch.kind === 'intro') {
      head = '<div class="chapter-head"><div class="chapter-kicker">' + escapeHtml(D.intro.kicker) + '</div><h2 class="chapter-title">' + escapeHtml(D.intro.title) + '</h2></div>';
    } else if (ch.kind === 'glossary') {
      head = '<div class="chapter-head"><div class="chapter-kicker">Словарь</div><h2 class="chapter-title">Словарь</h2></div>';
    } else if (ch.kind === 'module') {
      var m = ch.data;
      steps = m.steps;
      head =
        '<div class="chapter-head">' +
          '<div class="chapter-kicker">' + escapeHtml(m.number) + '</div>' +
          '<h2 class="chapter-title">' + escapeHtml(m.title) + '</h2>' +
          (m.goal ? '<p class="chapter-goal">' + escapeHtml(m.goal) + '</p>' : '') +
          '<div class="chapter-meta">' + [m.duration].concat(m.srcs).filter(Boolean).map(escapeHtml).join(' &nbsp;·&nbsp; ') + '</div>' +
        '</div>';
    } else if (ch.kind === 'task') {
      var t = ch.data;
      steps = t.steps;
      var io = t.io.map(function (x) { return '<div><span class="k">' + escapeHtml(x.k) + '</span>' + escapeHtml(x.v) + '</div>'; }).join('');
      head =
        '<div class="chapter-head">' +
          '<div class="chapter-kicker">' + escapeHtml(t.stage) + '</div>' +
          '<h2 class="chapter-title">' + escapeHtml(t.title) + ' <span class="chapter-meta" style="display:inline">' + escapeHtml(t.diff) + '</span></h2>' +
          '<div class="io">' + io + '</div>' +
        '</div>';
    } else if (ch.kind === 'exam') {
      steps = D.exam.steps;
      head = '<div class="chapter-head"><div class="chapter-kicker">Итог</div><h2 class="chapter-title">Аттестация</h2></div>';
    }

    if (current.step >= steps.length) current.step = 0;
    var stepIdx = current.step;
    var step = steps[stepIdx];
    var chIdx = chapterIndex(ch.key);
    var isFirstOverall = chIdx === 0 && stepIdx === 0;
    var isLastOverall = chIdx === chapters.length - 1 && stepIdx === steps.length - 1;
    var nextLabel = stepIdx === steps.length - 1 && chIdx < chapters.length - 1
      ? 'Дальше: ' + chapters[chIdx + 1].short + ' →'
      : 'Далее →';
    var quizLocked = step.type === 'quizblock' && !(state.quizzes[step.key] && state.quizzes[step.key].passed);

    body.innerHTML =
      head +
      '<div class="card">' + stepHtml(step) + '</div>' +
      '<div class="nav">' +
        '<span class="step-of">Шаг ' + (stepIdx + 1) + ' из ' + steps.length + '</span>' +
        '<div class="btnrow">' +
          '<button class="btn ghost" id="prevBtn"' + (isFirstOverall ? ' disabled' : '') + '>← Назад</button>' +
          '<button class="btn" id="nextBtn" data-label="' + escapeHtml(nextLabel) + '"' + ((isLastOverall || quizLocked) ? ' disabled' : '') + '>' + (quizLocked ? 'Сначала пройдите квиз' : nextLabel) + '</button>' +
        '</div>' +
      '</div>';

    var prevBtn = document.getElementById('prevBtn');
    var nextBtn = document.getElementById('nextBtn');
    if (prevBtn) prevBtn.addEventListener('click', function () {
      if (stepIdx > 0) { current = { chapter: ch.key, step: stepIdx - 1 }; }
      else if (chIdx > 0) { var prevCh = chapters[chIdx - 1]; current = { chapter: prevCh.key, step: chapterSteps(prevCh).length - 1 }; }
      saveNav(); render(); window.scrollTo({ top: 0 });
    });
    if (nextBtn) nextBtn.addEventListener('click', function () {
      if (stepIdx < steps.length - 1) { current = { chapter: ch.key, step: stepIdx + 1 }; }
      else if (chIdx < chapters.length - 1) { current = { chapter: chapters[chIdx + 1].key, step: 0 }; }
      saveNav(); render(); window.scrollTo({ top: 0 });
    });

    wireInteractions(body);
  }

  function stepHtml(step) {
    if (step.type !== 'quizblock') return step.html;
    var passed = !!(state.quizzes[step.key] && state.quizzes[step.key].passed);
    return (
      '<div class="quizblock" data-key="' + escapeHtml(step.key) + '">' +
        step.questions.map(function (q) { return q.html; }).join('') +
        '<div class="qb-footer">' +
          '<button class="btn" id="qbCheck"' + (passed ? ' disabled' : '') + '>' + (passed ? 'Пройдено ✓' : 'Проверить') + '</button>' +
          '<div class="qb-score"' + (passed ? '' : ' hidden') + '>' + (passed ? 'Все ответы верны' : '') + '</div>' +
        '</div>' +
      '</div>'
    );
  }

  // ---------- interactivity inside injected HTML ----------
  function wireInteractions(root) {
    wireQuizBlock(root);
    wireOpentask(root);
  }

  function updateProgressChrome() {
    var num = document.querySelector('.progress-num');
    var bar = document.querySelector('.progress-bar > i');
    if (num) num.innerHTML = '<b>' + totalAnswered() + '</b> из ' + D.meta.totalOpentasks + ' заданий отправлено';
    if (bar) bar.style.width = Math.round(100 * totalAnswered() / D.meta.totalOpentasks) + '%';
  }

  function wireQuizBlock(root) {
    var block = root.querySelector('.quizblock');
    if (!block) return;
    var key = block.dataset.key;
    var checkBtn = block.querySelector('#qbCheck');
    var scoreEl = block.querySelector('.qb-score');
    if (state.quizzes[key] && state.quizzes[key].passed) return; // already passed, nothing to wire

    // clear any wrong/right highlight the moment the student changes an answer
    block.querySelectorAll('.quiz').forEach(function (q) {
      q.querySelectorAll('input[type=radio]').forEach(function (r) {
        r.addEventListener('change', function () { q.classList.remove('wrong', 'right'); });
      });
    });

    checkBtn.addEventListener('click', function () {
      var questions = Array.prototype.slice.call(block.querySelectorAll('.quiz'));
      var unanswered = questions.filter(function (q) { return !q.querySelector('input[type=radio]:checked'); });
      if (unanswered.length) {
        scoreEl.hidden = false;
        scoreEl.className = 'qb-score warn';
        scoreEl.textContent = 'Ответьте на все вопросы, прежде чем проверять.';
        unanswered.forEach(function (q) { q.classList.add('wrong'); });
        return;
      }

      var correctCount = 0;
      var wrong = [];
      questions.forEach(function (q) {
        var opts = Array.prototype.slice.call(q.querySelectorAll('input[type=radio]'));
        var picked = q.querySelector('input[type=radio]:checked');
        var right = picked.dataset.correct === 'true';
        q.classList.toggle('right', right);
        q.classList.toggle('wrong', !right);
        if (right) correctCount++;
        // record WHICH option was picked, not just that the question was missed —
        // the wrong option is what tells the manager what the student believes
        else wrong.push({ q: picked.name, pick: opts.indexOf(picked) });
      });

      var passed = correctCount === questions.length;
      scoreEl.hidden = false;
      scoreEl.textContent = correctCount + ' из ' + questions.length + ' правильно';

      api('record-quiz-attempt', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ t: token, key: key, wrong: wrong, passed: passed }),
      }).catch(function () { /* best-effort; local state already updated below */ });

      if (passed) {
        scoreEl.className = 'qb-score ok';
        state.quizzes[key] = state.quizzes[key] || { passed: false, attempts: 0, everWrong: {} };
        state.quizzes[key].passed = true;
        checkBtn.disabled = true;
        checkBtn.textContent = 'Пройдено ✓';
        var nextBtn = document.getElementById('nextBtn');
        if (nextBtn) { nextBtn.disabled = false; nextBtn.textContent = nextBtn.dataset.label || 'Далее →'; }
      } else {
        scoreEl.className = 'qb-score warn';
        scoreEl.textContent += ' — найдите ошибку в подсвеченных вопросах и попробуйте снова.';
      }
    });
  }

  function wireOpentask(root) {
    root.querySelectorAll('.opentask').forEach(function (box) {
      var key = box.dataset.k;
      var ta = box.querySelector('textarea');
      var existing = state.answers[key];
      if (existing) ta.value = existing.text;

      var actions = box.querySelector('.opentask-actions');
      if (actions) {
        actions.innerHTML =
          '<button class="sendbtn" type="button">Отправить руководителю</button>' +
          '<span class="sent-msg" hidden></span>';
        var btn = actions.querySelector('.sendbtn');
        var msg = actions.querySelector('.sent-msg');
        if (existing) { msg.hidden = false; msg.textContent = 'Отправлено ' + formatDate(existing.submittedAt); }

        btn.addEventListener('click', function () {
          btn.disabled = true;
          api('submit-answer', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ t: token, questionKey: key, text: ta.value }),
          })
            .then(function () {
              state.answers[key] = { text: ta.value, submittedAt: new Date().toISOString() };
              msg.hidden = false;
              msg.textContent = 'Отправлено только что';
              btn.disabled = false;
              updateProgressChrome();
            })
            .catch(function () {
              msg.hidden = false;
              msg.textContent = 'Не отправилось — проверьте связь и попробуйте снова.';
              btn.disabled = false;
            });
        });
      }

      var thread = state.feedback[key];
      if (thread && thread.length) {
        var html = '<div class="feedback-thread">' + thread.map(function (f) {
          return '<div class="feedback-msg"><div class="fm-head">' + escapeHtml(f.author) + ' · ' + formatDate(f.at) + '</div>' + escapeHtml(f.text) + '</div>';
        }).join('') + '</div>';
        box.insertAdjacentHTML('beforeend', html);
      }
    });
  }

  function formatDate(iso) {
    try {
      var d = new Date(iso);
      return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch (e) { return iso; }
  }
})();
