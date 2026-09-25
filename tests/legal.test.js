// The privacy and terms pages carry both languages in one file, split by a
// divider. Editing one half and forgetting the other is silent — it happened
// the day the match replay shipped: the English half was corrected to say the
// rounds are written to the database while the Arabic half went on promising
// they never touch disk. Nothing compared them, so nothing complained.
//
// Discord reads these pages before it will turn Discovery on, and an Arabic
// reader is entitled to the same document an English one gets.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const PAGES = ['privacy.html', 'terms.html'];
const SPLIT = '<div class="lang-split"></div>';

const read = f => fs.readFileSync(path.join(__dirname, '..', 'public', f), 'utf8');
const headings = t => [...t.matchAll(/<h2>(.*?)<\/h2>/g)].map(m => m[1]);
const dates = h => [...h.matchAll(/class="updated">([^<]*)</g)].map(m => m[1]);

// ٢٥ -> 25, so the two dates can be compared as numbers
const latin = s => s.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7,
  august: 8, september: 9, october: 10, november: 11, december: 12,
  'يناير': 1, 'فبراير': 2, 'مارس': 3, 'أبريل': 4, 'مايو': 5, 'يونيو': 6, 'يوليو': 7,
  'أغسطس': 8, 'سبتمبر': 9, 'أكتوبر': 10, 'نوفمبر': 11, 'ديسمبر': 12,
};
function parseDate(text) {
  const t = latin(text);
  const day = (t.match(/(\d{1,2})\s/) || [])[1];
  const year = (t.match(/(\d{4})/) || [])[1];
  const month = Object.keys(MONTHS).find(m => t.toLowerCase().includes(m));
  return { day: Number(day), month: MONTHS[month], year: Number(year) };
}

for (const page of PAGES) {
  test(`${page} carries both languages`, () => {
    const html = read(page);
    assert.ok(html.includes(SPLIT), 'the language divider is gone');
    const [, arabic] = html.split(SPLIT);
    assert.ok(arabic && arabic.includes('dir="rtl"'), 'the Arabic half is missing or not marked RTL');
  });

  test(`${page} says the same thing in both languages`, () => {
    const [english, arabic] = read(page).split(SPLIT);
    const en = headings(english);
    const ar = headings(arabic);
    assert.ok(en.length > 0, 'no sections found in the English half');
    assert.equal(ar.length, en.length,
      `English has ${en.length} sections and Arabic has ${ar.length} — one half was edited without the other:\n` +
      `  en: ${en.join(' | ')}\n  ar: ${ar.join(' | ')}`);
  });

  test(`${page} was last updated on the same day in both languages`, () => {
    const found = dates(read(page));
    assert.equal(found.length, 2, `expected one date per language, found ${found.length}`);
    const [en, ar] = found.map(parseDate);
    for (const part of ['day', 'month', 'year']) {
      assert.ok(Number.isFinite(en[part]) && Number.isFinite(ar[part]),
        `could not read the ${part} from "${found[0]}" / "${found[1]}"`);
    }
    assert.deepEqual(ar, en, `the two halves claim different dates: "${found[0]}" vs "${found[1]}"`);
  });
}

test('the privacy policy still describes what the replay keeps', () => {
  // The two claims that went stale last time, pinned in both languages.
  const html = read('privacy.html');
  const [english, arabic] = html.split(SPLIT);
  assert.match(english, /round by round|each round/i, 'the English half stopped mentioning the round record');
  assert.ok(arabic.includes('جولة'), 'the Arabic half stopped mentioning the round record');
  assert.ok(!/never written to disk/i.test(html), 'the disk claim that stopped being true is back');
  assert.ok(!html.includes('ما تُكتب على القرص أبداً'), 'the Arabic disk claim that stopped being true is back');
});

// The terms told players they could join as a guest while the server refused
// every join without a session, and the privacy policy said the opposite of
// the terms. Nothing tied any of the three together, so all three disagreed
// for as long as nobody read them side by side.
test('the legal pages agree with the sign-in the server actually enforces', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const signInRequired = /if \(!session\) return reply\(cb, \{ error: 'signin' \}\)/.test(server);
  assert.ok(signInRequired,
    'the join handler no longer requires a session — the legal pages say it does, so update them together');

  const terms = read('terms.html');
  for (const claim of ['play as a guest', 'Signing in with Discord is optional', 'تقدر تلعب كضيف']) {
    assert.ok(!terms.includes(claim),
      `terms.html still claims "${claim}" while the server refuses a join without a session`);
  }
  assert.match(terms, /Playing requires signing in/i, 'the English terms stopped saying sign-in is required');
  assert.ok(terms.includes('اللعب يتطلب تسجيل دخول'), 'the Arabic terms stopped saying sign-in is required');

  // and the privacy policy has to tell the same story
  const privacy = read('privacy.html');
  assert.match(privacy, /Playing (requires|needs) a Discord sign-in/i, 'the privacy policy disagrees with the terms');
});
