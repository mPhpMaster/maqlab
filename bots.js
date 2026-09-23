// Bots exist so a single player is not locked out of half the game: "who's
// most likely" needs three people and the spy round needs four, so alone you
// would only ever see the other four round types.
//
// A bot is an ordinary entry in room.players with bot: true and no socket.
// Nothing is ever sent to it. It reaches the game only by calling the same
// submit functions a human calls, so it cannot skip a validation a human
// cannot skip, and it never sees more than its own snapshot would show. That
// matters most in the spy round, where knowing the word is the whole game.
//
// This file decides only *what* a bot does. The server owns *when*, because
// the server owns the round state.

const NAMES = ['Nova', 'Bolt', 'Echo', 'Pixel', 'Zap', 'Comet', 'Dash', 'Rusty', 'Kiwi', 'Mango'];

const pick = a => a[Math.floor(Math.random() * a.length)];
const between = ([lo, hi]) => lo + Math.random() * (hi - lo);

// Human-shaped on purpose. A bot that answers the instant a question appears
// ends every round before anyone has finished reading it.
const THINK = {
  write: [7000, 16000],
  vote: [4000, 10000],
  guess: [4000, 11000],
  likelyVote: [3000, 8000],
  blitz: [1800, 5000],
  emoji: [2200, 6000],
  odd: [3000, 8000],
  order: [8000, 20000],
  spyClue: [6000, 14000],
  spyVote: [4000, 10000],
};

// How often a bot is right. Deliberately short of perfect: a bot that always
// knows is not an opponent, it is a wall.
const ACCURACY = { blitz: 0.62, emoji: 0.55, order: 0.3 };

// Clues vague enough to be honest about any word in the category — which is
// exactly what a careful human writes when they do not want to give it away.
// The spy gets the same pool, because a spy who only has the category is in
// precisely this position for real.
//
// Fourteen each, not five. Five was fewer than the five bots a room can hold,
// so at a full table a repeat was arithmetic rather than bad luck, and three
// bots writing the same words does not read as three careful people.
//
// Every clue has to hold for *every* word in its category, which rules out
// more than it sounds: "cheap" is a lie about a phone and "fairly small" is a
// lie about a camel, and either one tells the table who is guessing.
const CLUES = {
  Place: [
    ['مزدحم', 'Crowded'], ['أروح له أحياناً', 'I go sometimes'], ['فيه ناس', 'People there'],
    ['تنتظر فيه', 'You wait there'], ['مو بعيد', 'Not far'], ['رحت له قبل', "I've been before"],
    ['أعرف مكانه', 'I know where it is'], ['ما أقعد فيه كثير', "I don't stay long"],
    ['يختلف بالليل', 'Different at night'], ['فيه أصوات', "There's noise"],
    ['مو مكان غريب', 'Nothing unusual'], ['أحياناً أحتاجه', 'I need it sometimes'],
    ['ما يعجب الجميع', 'Not for everyone'], ['شفته كثير', "I've seen it plenty"],
  ],
  Job: [
    ['دوام طويل', 'Long hours'], ['متعب', 'Tiring'], ['يحتاج صبر', 'Needs patience'],
    ['له راتب', 'It pays'], ['ناس تحترمه', 'Respected'], ['يحتاج تدريب', 'Needs training'],
    ['ما يناسب الكل', 'Not for everyone'], ['أعرف واحد يشتغله', 'I know someone in it'],
    ['يتعامل مع ناس', 'You deal with people'], ['فيه ضغط', "There's pressure"],
    ['يحتاج خبرة', 'Needs experience'], ['مطلوب دايماً', 'Always needed'],
    ['تتعلمه مع الوقت', 'You learn it over time'], ['ما هو سهل', 'Not an easy one'],
  ],
  Food: [
    ['أحبه', 'I like it'], ['ريحته حلوة', 'Smells good'], ['نتشاركه', 'We share it'],
    ['مو كل يوم', 'Not every day'], ['يشبع', 'Filling'], ['آكله أحياناً', 'I have it sometimes'],
    ['متوفر', 'Easy to find'], ['يعجب الصغار', 'Kids like it'], ['له طعم مميز', 'Distinct taste'],
    ['أطلبه أحياناً', 'I order it sometimes'], ['ما أمل منه', "I don't get bored of it"],
    ['يختلف من مكان لمكان', 'Varies by place'], ['ما هو غريب', 'Nothing exotic'],
    ['يذكرني بشي', 'It reminds me of things'],
  ],
  Animal: [
    ['شفت واحد', "I've seen one"], ['يتحرك', 'It moves'], ['مو أليف دايماً', 'Not always a pet'],
    ['صوته مميز', 'Distinct sound'], ['شفته بالتلفزيون', "I've seen it on TV"],
    ['له اسم معروف', 'Everyone knows it'], ['الأطفال يحبونه', 'Kids like it'],
    ['موجود بالطبيعة', 'Found in nature'], ['ما أشوفه يومياً', "I don't see it daily"],
    ['له لون معروف', 'A known colour'], ['يأكل', 'It eats'],
    ['شكله يميزه', 'Known by its look'], ['تشوفه بحديقة حيوان', 'Zoos have them'],
    ['ما أخاف منه', "I'm not scared of it"],
  ],
  Object: [
    ['في البيت', 'In the house'], ['ينكسر', 'It breaks'], ['أستخدمه', 'I use it'],
    ['تحمله بيدك', 'You hold it'], ['عندي واحد', 'I own one'],
    ['أحتاجه أحياناً', 'I need it sometimes'], ['ما هو جديد', 'Not a new invention'],
    ['له شكل معروف', 'A familiar shape'], ['تلقاه بأي بيت', 'Any house has one'],
    ['ضاع مني قبل', "I've lost one before"], ['سهل تلقاه', 'Easy to find'],
    ['ما يحتاج شرح', 'Needs no explaining'], ['ما أنتبه له', "I don't notice it much"],
    ['صعب أستغني عنه', 'Hard to do without'],
  ],
  Activity: [
    ['نهاية الأسبوع', 'At the weekend'], ['مع الربع', 'With friends'], ['ياخذ وقت', 'Takes time'],
    ['متعب بس حلو', 'Tiring but good'], ['مو كل يوم', 'Not every day'],
    ['أسويه أحياناً', 'I do it sometimes'], ['يحتاج مزاج', 'Needs the right mood'],
    ['ما يحتاج ناس كثير', "Doesn't need a crowd"], ['أول مرة كانت صعبة', 'First time was hard'],
    ['ناس تحبه وناس لا', 'Some love it, some not'], ['يحتاج تجهيز', 'Needs some prep'],
    ['ينسيك الوقت', 'You lose track of time'], ['ما أمل منه', "I don't get bored of it"],
    ['تتحسن فيه بالممارسة', 'You get better at it'],
  ],
  Sport: [
    ['عرق', 'Sweat'], ['فيه قوانين', 'It has rules'], ['أشوفه بالتلفزيون', 'I watch it'],
    ['متعب', 'Tiring'], ['يحتاج لياقة', 'Needs fitness'], ['له بطولات', 'It has tournaments'],
    ['ناس تتابعه', 'People follow it'], ['يحتاج تدريب', 'Needs training'],
    ['جربته قبل', "I've tried it"], ['مو سهل', 'Not easy'], ['يحتاج تركيز', 'Needs focus'],
    ['فيه فوز وخسارة', 'You win or you lose'], ['يبدأون فيه صغار', 'People start young'],
    ['ما يناسب الكل', 'Not for everyone'],
  ],
};
const FALLBACK_CLUES = [
  ['صعب أوصفه', 'Hard to describe'], ['معروف', 'Well known'], ['عادي', 'Ordinary'],
  ['ما أدري وش أقول', 'Not sure what to say'], ['شي معتاد', 'A familiar thing'],
  ['ما عندي وصف أحسن', 'No better word for it'],
];

// A name nobody in the room already has.
function freeName(taken) {
  const free = NAMES.filter(n => !taken.includes(n));
  return free.length ? pick(free) : `${pick(NAMES)} ${Math.floor(Math.random() * 90) + 10}`;
}

const thinkFor = phase => Math.round(between(THINK[phase] || [3000, 7000]));

// ---- one decision per phase ----
// Each returns what to pass to the matching submit function, or null when
// there is nothing sensible to do (the round timer then covers the bot).

// Lies are borrowed from real answers to *other* questions in the same bank.
// They read exactly like the truth because they are true somewhere else,
// which is the hardest kind of lie to pick out and costs no writing.
function lie({ decoys, truth }) {
  const usable = decoys.filter(d => d && d.toLowerCase() !== String(truth).toLowerCase());
  return usable.length ? pick(usable) : null;
}

function bluffVote({ options, myId }) {
  // Never vote for its own lie: humans cannot either, and the server refuses.
  const mine = options.filter(o => !(o.authors || []).includes(myId));
  const opt = pick(mine.length ? mine : options);
  // Mostly a safe single, sometimes a real bet. Nobody bets big every round.
  const bet = Math.random() < 0.6 ? 1 : Math.random() < 0.75 ? 2 : 3;
  return opt ? { id: opt.id, bet } : null;
}

// Wrong in a believable direction rather than wrong at random: a guess that
// is half or double the answer looks like someone who thought about it.
function numberGuess({ answer }) {
  const n = Number(answer);
  if (!isFinite(n)) return null;
  const off = n * (0.45 + Math.random() * 1.1);
  const v = n >= 100 ? Math.round(off / 5) * 5 : Math.round(off);
  return Math.max(0, v === n ? v + (n >= 10 ? Math.round(n * 0.08) : 1) : v);
}

const blitzAnswer = ({ truth }) => (Math.random() < ACCURACY.blitz ? !!truth : !truth);

function emojiAnswer({ options, correctId }) {
  if (!options || !options.length) return null;
  if (Math.random() < ACCURACY.emoji && correctId) return correctId;
  const wrong = options.filter(o => o.id !== correctId);
  return pick(wrong.length ? wrong : options).id;
}

// Votes for a person, never itself — the server refuses that too.
function votePlayer({ players, myId }) {
  const others = players.filter(p => p.id !== myId);
  return others.length ? pick(others).id : null;
}

// `taken` is every clue already on the board. Without it three bots in one
// round routinely wrote the same words — which does not read as three people
// being vague, it reads as three bots, and it hands the round away before
// anyone has voted.
function spyClue({ category, taken = [] }) {
  const pool = CLUES[category] || FALLBACK_CLUES;
  const used = taken.map(t => String(t).trim().toLowerCase());
  const free = pool.filter(([ar, en]) => !used.includes(ar.toLowerCase()) && !used.includes(en.toLowerCase()));
  const [ar, en] = pick(free.length ? free : pool);
  return { ar, en };
}

// Sometimes exactly right, more often nearly right: one or two neighbouring
// swaps is what half-knowing an order actually looks like, and it is worth
// partial credit under the same scoring a human gets.
function orderGuess({ correctIds }) {
  if (!Array.isArray(correctIds) || correctIds.length < 2) return null;
  const seq = correctIds.slice();
  if (Math.random() < ACCURACY.order) return seq;
  // Distinct positions: two swaps at the same spot cancel out and hand back a
  // perfect answer, which quietly made the bot far better than the accuracy
  // above claims — measured at 38% perfect when it should have been 30%.
  const spots = [];
  for (let i = 0; i < seq.length - 1; i++) spots.push(i);
  const swaps = Math.random() < 0.65 ? 1 : 2;
  for (let n = 0; n < swaps && spots.length; n++) {
    const i = spots.splice(Math.floor(Math.random() * spots.length), 1)[0];
    [seq[i], seq[i + 1]] = [seq[i + 1], seq[i]];
  }
  return seq;
}

// The spy has only ever been told the category, so its guess is a word from
// that category and nothing better. Exactly the position a human spy is in.
const spyGuess = ({ candidates }) => (candidates && candidates.length ? pick(candidates) : null);

module.exports = {
  NAMES, freeName, thinkFor,
  lie, bluffVote, numberGuess, blitzAnswer, emojiAnswer, votePlayer, orderGuess, spyClue, spyGuess,
};
