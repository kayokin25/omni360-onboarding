const { getRoster, getState, json, findByToken, connectLambda } = require('./_lib/store');

exports.handler = async (event) => {
  connectLambda(event);
  const q = event.queryStringParameters || {};
  const me = await findByToken(q.t);
  if (!me) return json(404, { error: 'unknown token' });
  if (me.role !== 'manager') return json(403, { error: 'not allowed' });

  const roster = await getRoster();
  const students = roster.filter((r) => r.role === 'student');

  const withProgress = await Promise.all(
    students.map(async (s) => {
      const state = await getState(s.token);
      const answered = Object.keys(state.answers).length;
      const answersWithoutFeedback = Object.keys(state.answers).filter(
        (k) => !(state.feedback[k] && state.feedback[k].length)
      ).length;
      // quiz roll-up so the roster shows who is struggling without drilling in
      const quizzes = Object.values(state.quizzes || {});
      return {
        token: s.token,
        name: s.name,
        createdAt: s.createdAt,
        answered,
        answersWithoutFeedback,
        quizPassed: quizzes.filter((q) => q.passed).length,
        quizAttempts: quizzes.reduce((n, q) => n + (q.attempts || 0), 0),
        quizMissed: quizzes.reduce((n, q) => n + Object.keys(q.everWrong || {}).length, 0),
      };
    })
  );

  return json(200, { students: withProgress });
};
