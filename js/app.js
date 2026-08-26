(function () {
  'use strict';

  var params = new URLSearchParams(location.search);
  var token = params.get('t');
  var app = document.getElementById('app');
  var D = window.COURSE_DATA;

  if (!token) { showError('Нет ссылки', 'Откройте страницу по персональной ссылке, которую вам прислал руководитель.'); return; }

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

  // ---------- app state ----------
  var me = null; // {name, role}
  var state = null; // {answers, feedback}
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
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = c.short;
      b.className = c.key === ch.key ? 'active' : '';
      b.addEventListener('click', function () { current = { chapter: c.key, step: 0 }; saveNav(); render(); });
      rail.appendChild(b);
    });

    renderChapter(ch);
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
    var chIdx = chapterIndex(ch.key);
    var isFirstOverall = chIdx === 0 && stepIdx === 0;
    var isLastOverall = chIdx === chapters.length - 1 && stepIdx === steps.length - 1;
    var nextLabel = stepIdx === steps.length - 1 && chIdx < chapters.length - 1
      ? 'Дальше: ' + chapters[chIdx + 1].short + ' →'
      : 'Далее →';

    body.innerHTML =
      head +
      '<div class="card">' + steps[stepIdx].html + '</div>' +
      '<div class="nav">' +
        '<span class="step-of">Шаг ' + (stepIdx + 1) + ' из ' + steps.length + '</span>' +
        '<div class="btnrow">' +
          '<button class="btn ghost" id="prevBtn"' + (isFirstOverall ? ' disabled' : '') + '>← Назад</button>' +
          '<button class="btn" id="nextBtn"' + (isLastOverall ? ' disabled' : '') + '>' + nextLabel + '</button>' +
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

  // ---------- interactivity inside injected HTML ----------
  function wireInteractions(root) {
    wireQuiz(root);
    wireOpentask(root);
  }

  function updateProgressChrome() {
    var num = document.querySelector('.progress-num');
    var bar = document.querySelector('.progress-bar > i');
    if (num) num.innerHTML = '<b>' + totalAnswered() + '</b> из ' + D.meta.totalOpentasks + ' заданий отправлено';
    if (bar) bar.style.width = Math.round(100 * totalAnswered() / D.meta.totalOpentasks) + '%';
  }

  function wireQuiz(root) {
    root.querySelectorAll('.quiz').forEach(function (q) {
      var radios = q.querySelectorAll('input[type=radio]');
      var fb = q.querySelector('.q-fb');
      radios.forEach(function (r) {
        r.addEventListener('change', function () {
          var correct = r.dataset.correct === 'true';
          q.classList.remove('ok', 'no');
          q.classList.add('answered', correct ? 'ok' : 'no');
          fb.textContent = correct ? (fb.dataset.ok || 'Верно.') : (fb.dataset.no || 'Неверно, посмотрите ещё раз.');
        });
      });
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
