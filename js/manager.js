(function () {
  'use strict';

  var params = new URLSearchParams(location.search);
  var token = params.get('t');
  var app = document.getElementById('app');
  var D = window.COURSE_DATA;

  if (!token) { showError('Нет ссылки', 'Откройте страницу по вашей персональной ссылке руководителя.'); return; }

  function api(path, opts) {
    return fetch('/api/' + path, opts || {}).then(function (r) {
      if (!r.ok) return r.json().then(function (e) { throw new Error(e.error || r.statusText); });
      return r.json();
    });
  }
  function escapeHtml(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : s;
    return d.innerHTML;
  }
  function showError(title, msg) {
    app.innerHTML = '<div class="state-screen"><h1>' + escapeHtml(title) + '</h1><p>' + escapeHtml(msg) + '</p></div>';
  }
  function formatDate(iso) {
    try { return new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }
    catch (e) { return iso; }
  }

  // ---------- index every open question once, so we can show its text next to an answer ----------
  var ANSWER_INDEX = buildAnswerIndex();
  function buildAnswerIndex() {
    var idx = {};
    function scan(chapterLabel, steps) {
      steps.forEach(function (s) {
        if (s.type !== 'opentask') return;
        var tmp = document.createElement('div');
        tmp.innerHTML = s.html;
        var box = tmp.querySelector('.opentask');
        if (!box) return;
        var key = box.dataset.k;
        var label = box.dataset.label || chapterLabel;
        var question = (tmp.querySelector('.q-text') || {}).textContent || '';
        idx[key] = { label: label, question: question.trim(), chapterLabel: chapterLabel };
      });
    }
    D.modules.forEach(function (m) { scan(m.number + ' · ' + m.title, m.steps); });
    D.tasks.forEach(function (t) { scan(t.title, t.steps); });
    scan('Аттестация', D.exam.steps);
    return idx;
  }

  var me = null;
  var lastCreatedLink = null;
  api('whoami?t=' + encodeURIComponent(token))
    .then(function (person) {
      if (person.role !== 'manager') { location.href = 'index.html?t=' + encodeURIComponent(token); return null; }
      me = person;
      return renderRoster();
    })
    .catch(function (err) {
      showError('Ссылка не работает', 'Проверьте, что скопировали её целиком. (' + err.message + ')');
    });

  function shell(inner) {
    app.innerHTML =
      '<div class="shell">' +
        '<div class="masthead">' +
          '<div class="eyebrow">Дашборд руководителя</div>' +
          '<h1 class="title">Онбординг Omni360</h1>' +
          '<div class="whoami">Вы вошли как <b>' + escapeHtml(me.name) + '</b></div>' +
        '</div>' +
        inner +
      '</div>';
  }

  function renderRoster() {
    return api('list-students?t=' + encodeURIComponent(token)).then(function (res) {
      var rows = res.students.map(function (s) {
        var flag = s.answersWithoutFeedback > 0;
        return (
          '<button type="button" class="roster-row" data-token="' + escapeHtml(s.token) + '">' +
            '<span class="roster-name">' + escapeHtml(s.name) + '</span>' +
            '<span class="roster-stat">' + s.answered + '/' + D.meta.totalOpentasks + ' ответов</span>' +
            '<span class="roster-stat' + (flag ? ' flag' : '') + '">' + (flag ? s.answersWithoutFeedback + ' без фидбека' : (s.answered ? 'фидбек дан' : 'пока нет ответов')) + '</span>' +
          '</button>'
        );
      }).join('');

      shell(
        '<div class="addstudent">' +
          '<input type="text" id="newName" placeholder="Имя нового ученика">' +
          '<button class="btn" id="addBtn" type="button">Добавить ученика</button>' +
        '</div>' +
        (lastCreatedLink ? '<div class="link-out">Ссылка для ' + escapeHtml(lastCreatedLink.name) + ': ' + escapeHtml(lastCreatedLink.link) + '</div>' : '') +
        '<div class="roster">' + (rows || '<p style="color:var(--ink-faint)">Учеников пока нет — добавьте первого выше.</p>') + '</div>'
      );

      document.getElementById('addBtn').addEventListener('click', function () {
        var name = document.getElementById('newName').value.trim();
        if (!name) return;
        api('create-student', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ t: token, name: name }),
        }).then(function (res) {
          lastCreatedLink = { name: res.name, link: location.origin + '/index.html?t=' + encodeURIComponent(res.token) };
          renderRoster();
        });
      });

      Array.prototype.forEach.call(document.querySelectorAll('.roster-row'), function (row) {
        row.addEventListener('click', function () { renderStudent(row.dataset.token); });
      });
    });
  }

  function renderStudent(studentToken) {
    Promise.all([
      api('get-state?t=' + encodeURIComponent(token) + '&student=' + encodeURIComponent(studentToken)),
      api('list-students?t=' + encodeURIComponent(token)),
    ]).then(function (res) {
      var state = res[0];
      var roster = res[1].students;
      var student = roster.filter(function (s) { return s.token === studentToken; })[0];
      var name = student ? student.name : studentToken;

      var answerKeys = Object.keys(state.answers).sort(function (a, b) {
        return new Date(state.answers[a].submittedAt) - new Date(state.answers[b].submittedAt);
      });

      var blocks = answerKeys.map(function (key) {
        var meta = ANSWER_INDEX[key] || { label: key, question: '' };
        var ans = state.answers[key];
        var thread = state.feedback[key] || [];
        var threadHtml = thread.map(function (f) {
          return '<div class="feedback-msg"><div class="fm-head">' + escapeHtml(f.author) + ' · ' + formatDate(f.at) + '</div>' + escapeHtml(f.text) + '</div>';
        }).join('');

        return (
          '<div class="answer-block" data-key="' + escapeHtml(key) + '">' +
            '<div class="answer-meta">' + escapeHtml(meta.label) + '</div>' +
            '<div class="answer-q">' + escapeHtml(meta.question) + '</div>' +
            '<div class="answer-text">' + escapeHtml(ans.text || '(ответ пуст)') + '</div>' +
            '<div class="answer-meta">Отправлено ' + formatDate(ans.submittedAt) + '</div>' +
            (threadHtml ? '<div class="feedback-thread">' + threadHtml + '</div>' : '') +
            '<div class="fb-form">' +
              '<textarea placeholder="Ответить ученику..."></textarea>' +
              '<button class="btn" type="button">Отправить</button>' +
            '</div>' +
          '</div>'
        );
      }).join('');

      shell(
        '<a class="backlink" href="#" id="backLink">← Ко всем ученикам</a>' +
        '<h2 class="chapter-title">' + escapeHtml(name) + '</h2>' +
        '<p style="color:var(--ink-soft); font-size:14px; margin:0 0 16px;">' +
          answerKeys.length + ' из ' + D.meta.totalOpentasks + ' заданий отправлено' +
        '</p>' +
        (blocks || '<p style="color:var(--ink-faint)">Ученик пока не отправил ни одного ответа.</p>')
      );

      document.getElementById('backLink').addEventListener('click', function (e) { e.preventDefault(); renderRoster(); });

      Array.prototype.forEach.call(document.querySelectorAll('.answer-block'), function (block) {
        var key = block.dataset.key;
        var ta = block.querySelector('textarea');
        var btn = block.querySelector('.fb-form .btn');
        btn.addEventListener('click', function () {
          var text = ta.value.trim();
          if (!text) return;
          btn.disabled = true;
          api('submit-feedback', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ t: token, student: studentToken, questionKey: key, text: text }),
          }).then(function () { renderStudent(studentToken); });
        });
      });
    });
  }
})();
