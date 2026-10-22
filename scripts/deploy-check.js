#!/usr/bin/env node
// Is the live site running exactly the code in this checkout?
//
//   node scripts/deploy-check.js                 checks https://maqlab.onrender.com
//   node scripts/deploy-check.js http://localhost:3000
//
// Three things, each of which has been wrong before without anything saying
// so: the commit Render says it is serving, the database and Discord being
// connected, and the asset stamp. The stamp is a hash of every script and
// stylesheet the page loads, worked out here from the files on disk the same
// way the server works it out, so if the two match, the browser is getting
// these exact bytes (and Discord's proxy has no older copy to hand out).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const BASE = (process.argv[2] || 'https://maqlab.onrender.com').replace(/\/$/, '');
const PUB = path.join(__dirname, '..', 'public');

function localStamp() {
  const listed = dir => { try { return fs.readdirSync(path.join(PUB, dir)).filter(f => /\.(js|css)$/.test(f)).sort().map(f => `${dir}/${f}`); } catch { return []; } };
  const files = ['app.js', 'discord.js', 'avatar.js', 'style.css', ...listed('js'), ...listed('css')];
  return crypto.createHash('sha1')
    .update(files.map(f => { try { return fs.readFileSync(path.join(PUB, f)); } catch { return ''; } }).join('|'))
    .digest('hex').slice(0, 10);
}

(async () => {
  let ok = true;
  const say = (good, what) => { console.log(`${good ? 'ok  ' : 'FAIL'}  ${what}`); if (!good) ok = false; };

  const health = await (await fetch(`${BASE}/health`)).json();
  const head = execSync('git rev-parse --short=7 HEAD', { cwd: path.join(__dirname, '..') }).toString().trim();
  say(health.ok === true, `/health answers (up ${health.uptimeSeconds}s, ${health.rooms} rooms, ${health.players} players)`);
  say(health.commit === head || health.commit === 'local', `serving commit ${health.commit}, this checkout is ${head}`);
  say(health.database === 'connected', `database ${health.database}`);
  say(health.discord === 'configured', `discord ${health.discord}`);
  if (health.errors) say(health.errors.count === 0, `server errors since boot: ${health.errors.count}${health.errors.last ? ` (latest: ${health.errors.last})` : ''}`);

  const page = await (await fetch(`${BASE}/`)).text();
  const live = (page.match(/app\.js\?v=([0-9a-f]+)/) || [])[1];
  say(live === localStamp(), `asset stamp live ${live}, local ${localStamp()}`);

  // Every module the page reaches loads, under the live stamp.
  const mods = ['app.js', ...fs.readdirSync(path.join(PUB, 'js')).filter(f => f.endsWith('.js')).map(f => `js/${f}`)];
  const codes = await Promise.all(mods.map(async m => [m, (await fetch(`${BASE}/${m}?v=${live}`)).status]));
  const bad = codes.filter(([, s]) => s !== 200);
  say(!bad.length, `${mods.length} client modules load${bad.length ? `, except ${bad.map(([m, s]) => `${m} (${s})`).join(', ')}` : ''}`);

  process.exit(ok ? 0 : 1);
})().catch(e => { console.error('deploy check failed:', e.message); process.exit(1); });
