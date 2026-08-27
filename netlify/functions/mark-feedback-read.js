const { findByToken, getState, saveState, json, connectLambda } = require('./_lib/store');

// Students mark a manager's reply as read, which clears the dot on the chapter
// button. Stored as a timestamp per question rather than a boolean, so a later
// reply in the same thread lights the dot up again.
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

  const keys = (Array.isArray(body.questionKeys) ? body.questionKeys : [body.questionKey]).filter(Boolean);
  if (!keys.length) return json(400, { error: 'questionKey(s) required' });

  const state = await getState(me.token);
  const seenAt = new Date().toISOString();
  keys.forEach((k) => { state.feedbackSeen[k] = seenAt; });

  await saveState(me.token, state);
  return json(200, { ok: true, seenAt });
};
