const test = require('node:test');
const assert = require('node:assert');
const app = require('./index');

const server = app.listen(0);
const base = `http://localhost:${server.address().port}`;
const email = `test${Date.now()}@mail.com`;
let token = '';
let linkId = null;

const call = async (path, method = 'GET', body, auth) => {
  const res = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json() };
};

test.after(() => server.close());

test('register rejects a short password', async () => {
  const r = await call('/api/auth/register', 'POST', { name: 'T', email, password: '123' });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.json.success, false);
});

test('register creates an account', async () => {
  const r = await call('/api/auth/register', 'POST', { name: 'Tester', email, password: 'secret123' });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.json.data.password, undefined);
});

test('register rejects a duplicate email', async () => {
  const r = await call('/api/auth/register', 'POST', { name: 'Tester', email, password: 'secret123' });
  assert.strictEqual(r.status, 409);
});

test('login fails with a wrong password', async () => {
  const r = await call('/api/auth/login', 'POST', { email, password: 'wrongpass' });
  assert.strictEqual(r.status, 401);
});

test('login succeeds and returns a token', async () => {
  const r = await call('/api/auth/login', 'POST', { email, password: 'secret123' });
  assert.strictEqual(r.status, 200);
  assert.ok(r.json.data.token);
  token = r.json.data.token;
});

test('links route is protected', async () => {
  const r = await call('/api/links');
  assert.strictEqual(r.status, 401);
});

test('create link rejects an invalid URL', async () => {
  const r = await call('/api/links', 'POST', { originalUrl: 'not-a-url' }, token);
  assert.strictEqual(r.status, 400);
});

test('create link works', async () => {
  const r = await call('/api/links', 'POST', { originalUrl: 'https://example.com' }, token);
  assert.strictEqual(r.status, 201);
  assert.ok(r.json.data.code);
  linkId = r.json.data.id;
});

test('list links returns the new link', async () => {
  const r = await call('/api/links?search=example', 'GET', null, token);
  assert.strictEqual(r.status, 200);
  assert.ok(r.json.data.links.length >= 1);
});

test('delete link works', async () => {
  const r = await call(`/api/links/${linkId}`, 'DELETE', null, token);
  assert.strictEqual(r.status, 200);
});

test('delete a missing link returns 404', async () => {
  const r = await call(`/api/links/${linkId}`, 'DELETE', null, token);
  assert.strictEqual(r.status, 404);
});