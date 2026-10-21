// A player's own data: they can take it away, and they can delete it. Played
// against a real Postgres (E2E_DATABASE_URL), after a real game, so there is
// a profile, results and a shared match replay to export and to clean up.
const test = require('node:test');
const assert = require('node:assert');
const { startServer, playGame, sleep } = require('./harness');
const { bearer } = require('../helpers/session');

const DB = process.env.E2E_DATABASE_URL || '';
const skip = !DB && 'set E2E_DATABASE_URL to run the account cases';

test('a player can download their data and delete their account', { skip }, async () => {
  const srv = await startServer(4900 + (process.pid % 90), { db: DB });
  const tag = `acct${process.pid}`;
  const me = `${tag}-p0`;
  const api = (path, opts = {}) => fetch(srv.url + path, { ...opts, headers: { 'Content-Type': 'application/json', ...bearer(me, me), ...(opts.headers || {}) } });
  try {
    const g = await playGame(srv.url, { n: 3, types: ['higher'], rounds: 3, tag });
    assert.ok(g.final);
    await sleep(1500); // results are written once the final screen is up

    const exp = await (await api('/api/account/export')).json();
    assert.equal(exp.profile.user_id, me);
    assert.ok(exp.games.length >= 1, 'the game just played is not in the export');
    assert.ok(exp.matches.length >= 1, 'the match replay is not in the export');
    assert.ok(!('banned_by' in exp.profile), 'the export names the admin who set a ban');
    const matchId = exp.matches[0];

    const page = await fetch(`${srv.url}/match/${matchId}`);
    assert.equal(page.headers.get('x-robots-tag'), 'noindex', 'match pages can be indexed by search engines');

    const before = JSON.stringify(await (await fetch(`${srv.url}/api/match/${matchId}`)).json());
    assert.ok(before.includes(me), 'the replay does not show the player before deletion');

    const noConfirm = await api('/api/account/delete', { method: 'POST', body: '{}' });
    assert.equal(noConfirm.status, 400, 'an account was deleted without the confirm');

    const del = await (await api('/api/account/delete', { method: 'POST', body: JSON.stringify({ confirm: 'delete' }) })).json();
    assert.deepEqual(del, { ok: true });

    assert.equal((await fetch(`${srv.url}/api/profile/${me}`)).status, 404, 'the profile is still there');
    const after = await (await fetch(`${srv.url}/api/match/${matchId}`)).json();
    const text = JSON.stringify(after);
    assert.ok(!text.includes(me), 'the deleted player is still named in the replay');
    assert.ok(text.includes('Deleted player'), 'the replay lost the deleted player instead of anonymising them');
    assert.ok(text.includes(`${tag}-p1`), 'the other players were taken out of the replay too');
    assert.equal((await api('/api/account/export')).status, 404, 'there is still data to export after deletion');
  } finally {
    await srv.stop('SIGKILL');
  }
});
