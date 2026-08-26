const { findByToken, json, connectLambda } = require('./_lib/store');

exports.handler = async (event) => {
  connectLambda(event);
  const token = event.queryStringParameters && event.queryStringParameters.t;
  const person = await findByToken(token);
  if (!person) return json(404, { error: 'unknown token' });
  return json(200, { name: person.name, role: person.role });
};
