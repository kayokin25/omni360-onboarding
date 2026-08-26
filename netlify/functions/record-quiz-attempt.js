const { findByToken, getState, saveState, json, connectLambda } = require('./_lib/store');

// Called on every "Проверить" click, not just when the block is fully
// passed — so the manager can see how many tries it took and which
// questions tripped the student up along the way.
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

  const { key, wrong, passed } = body;
  if (!key || !Array.isArray(wrong)) return json(400, { error: 'key and wrong[] are required' });

  const state = await getState(me.token);
  const q = state.quizzes[key] || { passed: false, attempts: 0, everWrong: {} };
  q.attempts += 1;
  wrong.forEach(({ q: questionKey, pick }) => {
    if (!questionKey) return;
    // states written before this version stored a bare `true` here; upgrade in
    // place so the dashboard only ever has to read one shape going forward
    const prev = q.everWrong[questionKey];
    const miss = prev && typeof prev === 'object' ? prev : { count: 0, picks: [] };
    miss.count += 1;
    if (Number.isInteger(pick) && pick >= 0 && !miss.picks.includes(pick)) miss.picks.push(pick);
    q.everWrong[questionKey] = miss;
  });
  if (passed) q.passed = true;
  q.lastAttemptAt = new Date().toISOString();
  state.quizzes[key] = q;

  await saveState(me.token, state);
  return json(200, { ok: true });
};
