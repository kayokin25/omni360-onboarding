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

  const { key, value } = body;
  if (!key) return json(400, { error: 'key is required' });

  const state = await getState(me.token);
  state.checklist[key] = value;
  await saveState(me.token, state);
  return json(200, { ok: true });
};
