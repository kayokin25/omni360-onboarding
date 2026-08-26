// Local preview only: activated by ?mock=student or ?mock=manager in the URL.
// Stubs the /api/* calls with in-memory data so the course/dashboard can be
// clicked through without a deployed backend. Not loaded unless ?mock is set.
(function () {
  var mode = new URLSearchParams(location.search).get('mock');
  if (!mode) return;

  var studentState = { answers: {}, feedback: {}, quizzes: {} };
  var students = [
    { token: 'demo-anna', name: 'Анна Тестовая', createdAt: new Date().toISOString(), answered: 1, answersWithoutFeedback: 1 },
  ];
  var demoAnswers = {
    ot_m1: { text: 'DOOH дополняет интернет-рекламу охватом в общественных местах, ОРД не нужен, потому что DOOH не подпадает под закон о маркировке интернет-рекламы.', submittedAt: new Date().toISOString() },
  };
  var demoFeedback = {};
  var demoQuizzes = {
    'q_m1_6': { passed: true, attempts: 1, everWrong: {} },
    'q_m1_1+q_m1_2+q_m1_3+q_m1_4+q_m1_5': { passed: true, attempts: 2, everWrong: { q_m1_1: true } },
  };

  var realFetch = window.fetch.bind(window);
  window.fetch = function (url, opts) {
    var u = String(url);
    if (u.indexOf('/api/') !== 0) return realFetch(url, opts);

    function ok(body) { return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })); }

    if (u.indexOf('/api/whoami') === 0) {
      return ok(mode === 'manager' ? { name: 'Руководитель (демо)', role: 'manager' } : { name: 'Ученик (демо)', role: 'student' });
    }
    if (u.indexOf('/api/get-state') === 0) {
      if (u.indexOf('student=') > -1) return ok({ answers: demoAnswers, feedback: demoFeedback, quizzes: demoQuizzes });
      return ok(studentState);
    }
    if (u.indexOf('/api/submit-answer') === 0) {
      var b2 = JSON.parse(opts.body);
      studentState.answers[b2.questionKey] = { text: b2.text, submittedAt: new Date().toISOString() };
      return ok({ ok: true });
    }
    if (u.indexOf('/api/record-quiz-attempt') === 0) {
      var b5 = JSON.parse(opts.body);
      var qz = studentState.quizzes[b5.key] || { passed: false, attempts: 0, everWrong: {} };
      qz.attempts += 1;
      b5.wrongKeys.forEach(function (k) { qz.everWrong[k] = true; });
      if (b5.passed) qz.passed = true;
      studentState.quizzes[b5.key] = qz;
      return ok({ ok: true });
    }
    if (u.indexOf('/api/list-students') === 0) return ok({ students: students });
    if (u.indexOf('/api/create-student') === 0) {
      var b3 = JSON.parse(opts.body);
      var t = 'demo-' + Math.random().toString(36).slice(2, 8);
      students.push({ token: t, name: b3.name, createdAt: new Date().toISOString(), answered: 0, answersWithoutFeedback: 0 });
      return ok({ token: t, name: b3.name, role: 'student' });
    }
    if (u.indexOf('/api/submit-feedback') === 0) {
      var b4 = JSON.parse(opts.body);
      if (!demoFeedback[b4.questionKey]) demoFeedback[b4.questionKey] = [];
      demoFeedback[b4.questionKey].push({ text: b4.text, author: 'Руководитель (демо)', at: new Date().toISOString() });
      return ok({ ok: true });
    }
    return realFetch(url, opts);
  };
})();
