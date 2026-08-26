const { getRoster, getState, json, findByToken } = require('./_lib/store');

exports.handler = async (event) => {
  const q = event.queryStringParameters || {};
  const me = await findByToken(q.t);
  if (!me) return json(404, { error: 'unknown token' });
  if (me.role !== 'manager') return json(403, { error: 'not allowed' });

  const roster = await getRoster();
  const students = roster.filter((r) => r.role === 'student');

  const withProgress = await Promise.all(
    students.map(async (s) => {
      const state = await getState(s.token);
      const checkDone = Object.values(state.checklist).filter(Boolean).length;
      const answered = Object.keys(state.answers).length;
      const answersWithoutFeedback = Object.keys(state.answers).filter(
        (k) => !(state.feedback[k] && state.feedback[k].length)
      ).length;
      return {
        token: s.token,
        name: s.name,
        createdAt: s.createdAt,
        checkDone,
        answered,
        answersWithoutFeedback,
      };
    })
  );

  return json(200, { students: withProgress });
};
