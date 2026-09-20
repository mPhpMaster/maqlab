// The session layer is what stands between a player and someone else's
// identity, so it gets tested before anything else.
process.env.SESSION_SECRET = 'test-secret-not-used-anywhere-real';
process.env.ADMIN_IDS = '111,222';

const test = require('node:test');
const assert = require('node:assert');
const auth = require('../auth');

const b64 = s => Buffer.from(s).toString('base64url');

test('a minted token verifies and carries its claims', () => {
  const t = auth.mint({ id: 'u1', name: 'سارة' });
  const s = auth.verify(t);
  assert.equal(s.id, 'u1');
  assert.equal(s.name, 'سارة');
});

test('a tampered payload is rejected even when it claims an admin id', () => {
  const forged = b64(JSON.stringify({ id: '111', name: 'hacker', exp: Date.now() + 1e6 })) + '.notarealsignature';
  assert.equal(auth.verify(forged), null);
});

test('swapping the payload of a genuine token invalidates it', () => {
  const real = auth.mint({ id: 'u1', name: 'سارة' });
  const sig = real.split('.')[1];
  const swapped = b64(JSON.stringify({ id: '111', name: 'سارة', exp: Date.now() + 1e6 })) + '.' + sig;
  assert.equal(auth.verify(swapped), null);
});

test('an expired token is rejected', () => {
  const body = b64(JSON.stringify({ id: 'u1', name: 'x', exp: Date.now() - 1000 }));
  // sign it the way auth does, so only expiry can be what fails
  const crypto = require('node:crypto');
  const sig = crypto.createHmac('sha256', process.env.SESSION_SECRET).update(body).digest('base64url');
  assert.equal(auth.verify(body + '.' + sig), null);
});

test('malformed input never throws', () => {
  for (const bad of ['', '.', 'a.b', null, undefined, 'no-dot', 'x'.repeat(500)]) {
    assert.equal(auth.verify(bad), null);
  }
});

test('isAdmin matches only the configured ids', () => {
  assert.equal(auth.isAdmin('111'), true);
  assert.equal(auth.isAdmin('222'), true);
  assert.equal(auth.isAdmin('333'), false);
  assert.equal(auth.isAdmin(''), false);
  assert.equal(auth.isAdmin(null), false);
});

test('a session is read from either transport', () => {
  const t = auth.mint({ id: 'u9', name: 'n' });
  assert.equal(auth.sessionFrom({ authorization: `Bearer ${t}` }).id, 'u9');
  assert.equal(auth.sessionFrom({ cookie: `maqlab_session=${t}; other=1` }).id, 'u9');
  assert.equal(auth.sessionFrom({}), null);
});
