const { getStore, connectLambda } = require('@netlify/blobs');

const ROSTER_KEY = 'roster';

function store() {
  // NOTE: consistency:'strong' is NOT available here — connectLambda()'s
  // context (Lambda-compat mode, which classic exports.handler functions run
  // in) never carries the uncachedEdgeURL that strong reads require; passing
  // it throws BlobsConsistencyError on every call. Default (eventually
  // consistent, ~60s worst case) is the only option in this mode.
  return getStore('onboarding');
}

async function getRoster() {
  const raw = await store().get(ROSTER_KEY, { type: 'json' });
  return raw || [];
}

async function saveRoster(list) {
  await store().setJSON(ROSTER_KEY, list);
}

async function findByToken(token) {
  if (!token) return null;
  const roster = await getRoster();
  return roster.find((r) => r.token === token) || null;
}

function emptyState() {
  return { answers: {}, feedback: {}, quizzes: {} }; // quizzes[blockKey] = { passed, attempts, everWrong: {questionKey: true}, lastAttemptAt }
}

async function getState(token) {
  const raw = await store().get(`state:${token}`, { type: 'json' });
  // merge, not replace: old saved states predate the quizzes field and would
  // otherwise come back without it, crashing anything that reads state.quizzes
  return Object.assign(emptyState(), raw || {});
}

async function saveState(token, state) {
  await store().setJSON(`state:${token}`, state);
}

function randomToken() {
  // URL-safe, unguessable enough for an internal-link-as-access-token model
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString('base64url');
}

function json(status, body) {
  return {
    statusCode: status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  };
}

module.exports = { getRoster, saveRoster, findByToken, getState, saveState, randomToken, json, emptyState, connectLambda };
