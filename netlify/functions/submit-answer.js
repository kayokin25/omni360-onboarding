const { findByToken, getState, saveState, json, connectLambda } = require('./_lib/store');

exports.handler = async (event) => {
  connectLambda(event);
  if (event.httpMethod !== 'POST') return json(405, { error: 'method not allowed' });

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'bad json' });
  }

  const me = await findByToken(body.t);
  if (!me) return json(404, { error: 'unknown token' });

  const { questionKey, text } = body;
  if (!questionKey) return json(400, { error: 'questionKey is required' });

  const state = await getState(me.token);
  state.answers[questionKey] = { text: text || '', submittedAt: new Date().toISOString() };
  await saveState(me.token, state);
  return json(200, { ok: true });
};
