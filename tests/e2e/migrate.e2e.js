// Migrations against a real Postgres (E2E_DATABASE_URL). Each case gets its
// own throwaway database, so nothing here touches anything else.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Pool } = require('pg');

const DB = process.env.E2E_DATABASE_URL || '';
const skip = !DB && 'set E2E_DATABASE_URL to run the migration cases';
const BASELINE = path.join(__dirname, '..', '..', 'db', 'migrations', '001_baseline.sql');

// db.js reads DATABASE_URL when it is loaded; migrate() takes its own pool,
// so loading it with none set is fine.
const { migrate } = require('../../db');

async function scratchDb(name) {
  const admin = new Pool({ connectionString: DB, max: 1 });
  await admin.query(`drop database if exists ${name}`);
  await admin.query(`create database ${name}`);
  await admin.end();
  const url = new URL(DB); url.pathname = '/' + name;
  const pool = new Pool({ connectionString: url.toString(), max: 2 });
  return {
    pool,
    async drop() {
      await pool.end();
      const a = new Pool({ connectionString: DB, max: 1 });
      await a.query(`drop database if exists ${name}`);
      await a.end();
    },
  };
}
const tag = () => `maqlab_mig_${process.pid}_${Math.floor(Math.random() * 1e6)}`;

test('a fresh database gets every migration once, and a second boot applies nothing', { skip }, async () => {
  const db = await scratchDb(tag());
  try {
    const first = await migrate(db.pool);
    assert.ok(first.includes('001_baseline.sql'));
    assert.deepEqual(await migrate(db.pool), [], 'a second boot applied a migration again');
    const { rows } = await db.pool.query("select count(*)::int as n from information_schema.tables where table_name in ('profiles','game_results','matches','live_rooms')");
    assert.equal(rows[0].n, 4);
  } finally { await db.drop(); }
});

test('production, which already has the old schema, takes the baseline without a change', { skip }, async () => {
  const db = await scratchDb(tag());
  try {
    // What production is: the schema applied by the old boot, no record of it.
    await db.pool.query(fs.readFileSync(BASELINE, 'utf8'));
    await db.pool.query("insert into profiles (user_id, name) values ('u1', 'Existing')");
    assert.deepEqual(await migrate(db.pool), fs.readdirSync(path.dirname(BASELINE)).filter(f => f.endsWith('.sql')).sort());
    const { rows } = await db.pool.query("select name from profiles where user_id = 'u1'");
    assert.equal(rows[0].name, 'Existing', 'the baseline touched existing data');
  } finally { await db.drop(); }
});

test('a migration that fails is rolled back and not recorded', { skip }, async () => {
  const db = await scratchDb(tag());
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mig-'));
  try {
    fs.writeFileSync(path.join(dir, '001_ok.sql'), 'create table a (x int);');
    fs.writeFileSync(path.join(dir, '002_bad.sql'), 'create table b (x int); select * from no_such_table;');
    await assert.rejects(migrate(db.pool, dir), /002_bad\.sql failed/);
    const { rows } = await db.pool.query('select name from schema_migrations order by name');
    assert.deepEqual(rows.map(r => r.name), ['001_ok.sql']);
    const b = await db.pool.query("select count(*)::int as n from information_schema.tables where table_name = 'b'");
    assert.equal(b.rows[0].n, 0, 'half of the failed migration was left behind');
  } finally { await db.drop(); fs.rmSync(dir, { recursive: true, force: true }); }
});
