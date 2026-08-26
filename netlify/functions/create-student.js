const { getRoster, saveRoster, findByToken, randomToken, json, connectLambda } = require('./_lib/store');

exports.handler = async (event) => {
  connectLambda(event);
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

  const name = (body.name || '').trim();
  if (!name) return json(400, { error: 'name is required' });
  const role = body.role === 'manager' ? 'manager' : 'student';

  const roster = await getRoster();
  const token = randomToken();
  roster.push({ token, name, role, createdAt: new Date().toISOString() });
  await saveRoster(roster);

  return json(200, { token, name, role });
};
