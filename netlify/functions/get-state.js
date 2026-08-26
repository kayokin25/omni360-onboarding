const { findByToken, getState, json } = require('./_lib/store');

exports.handler = async (event) => {
  const q = event.queryStringParameters || {};
  const me = await findByToken(q.t);
  if (!me) return json(404, { error: 'unknown token' });

  let targetToken = me.token;
  if (q.student) {
    if (me.role !== 'manager') return json(403, { error: 'not allowed' });
    const student = await findByToken(q.student);
    if (!student) return json(404, { error: 'unknown student' });
    targetToken = student.token;
  }

  const state = await getState(targetToken);
  return json(200, state);
};
