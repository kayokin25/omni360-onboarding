const { findByToken, getState, saveState, json } = require('./_lib/store');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'method not allowed' });

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'bad json' });
  }

  const manager = await findByToken(body.t);
  if (!manager) return json(404, { error: 'unknown token' });
  if (manager.role !== 'manager') return json(403, { error: 'not allowed' });

  const { student: studentToken, questionKey, text } = body;
  if (!studentToken || !questionKey || !text) {
    return json(400, { error: 'student, questionKey and text are required' });
  }

  const student = await findByToken(studentToken);
  if (!student) return json(404, { error: 'unknown student' });

  const state = await getState(student.token);
  if (!state.feedback[questionKey]) state.feedback[questionKey] = [];
  state.feedback[questionKey].push({ text, author: manager.name, at: new Date().toISOString() });
  await saveState(student.token, state);
  return json(200, { ok: true });
};
