// One-time bootstrap: works only while the roster is completely empty, so it
// can't be used to mint extra managers later. Run it once after first deploy
// to get your own manager link, then forget it exists.
const { getRoster, saveRoster, randomToken, json } = require('./_lib/store');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'method not allowed' });

  const roster = await getRoster();
  if (roster.length > 0) {
    return json(403, { error: 'roster already has entries — bootstrap is disabled' });
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'bad json' });
  }
  const name = (body.name || '').trim();
  if (!name) return json(400, { error: 'name is required' });

  const token = randomToken();
  await saveRoster([{ token, name, role: 'manager', createdAt: new Date().toISOString() }]);
  return json(200, { token, name });
};
