const { getStore, connectLambda } = require('@netlify/blobs');

const ROSTER_KEY = 'roster';

function store() {
  // Strong consistency: this tool is low-traffic and a manager reading a
  // student's answer seconds after it was submitted must see it immediately,
  // not whatever the eventually-consistent edge cache still has.
  return getStore({ name: 'onboarding', consistency: 'strong' });
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
  return { checklist: {}, quiz: {}, answers: {}, feedback: {} };
}

async function getState(token) {
  const raw = await store().get(`state:${token}`, { type: 'json' });
  return raw || emptyState();
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
