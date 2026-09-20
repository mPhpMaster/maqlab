# MAQLAB | مقلب — a party game for your whole crew (English / عربي)

"Lie well, catch the liars." Everyone plays from their own phone at the same time. Each round opens with a slot machine that picks the round type and the score multiplier.

## Running it
```
npm install
npm start          # http://localhost:3000
```
To play with people on the same network: open `http://<your IP>:3000` on their phones and enter the 5-letter room code, or scan the QR.

### Running the server in the background (Windows / PowerShell)
```
.\start.ps1      # starts the server in the background, writes the PID to .server.pid
.\stop.ps1       # stops it
.\restart.ps1    # stop, then start
```
Logs go to `server.log` and `server.err.log` in the same folder.

## Round types (6)
| Round | Idea | Scoring |
|---|---|---|
| 🤥 **Bluff** | Everyone writes a lie, then picks the truth and bets ×1/×2/×3 | Right = 500×bet • wrong on a high bet = −150 per level • each player fooled by your lie = +300 |
| 🎯 **Closest number** | A question whose answer is a number | Dead on (±1%) +1000 • closest +600 • second +300 • third +150 |
| ⚡ **True or false** | 3 fast statements | Correct +200 + up to +200 for speed • fastest +100 |
| 🔤 **Decode the emoji** | 3 emoji puzzles, 4 options each | Correct +300 + up to +300 for speed • fastest +100 |
| 👥 **Who's most likely?** | Everyone votes for someone in the room (needs 3+ players) | With the majority +300 • the person chosen +150 |
| 🕵️ **Spy** | One player is the spy and sees only the category, never the word. Everyone writes a clue, then votes on who the spy is (needs 4+ players) | Catching the spy +350 • spy escaping (under half the votes) +500 • spy guessing the word +300 |

**Multipliers (the slot machine):** normal, points ×2 💎, speed ×1.5 ⏱️, mystery box 🎁, and the last round is always the **Golden Round ×3** 👑.

**Powers (once per game):** 🔍 a scanner that removes two wrong options (voting and emoji rounds) • 💎 a doubler for a whole round, and everyone sees you use it.

**Settings:** question language, rounds (3/5/8/12), which round types are in play, pace (chill / normal / fast).

## The details
- A ticking slot machine that slows as it lands, and calm background music generated in the browser (you can mute it)
- Lies revealed one at a time, with "you got played by so-and-so 😂"
- A personal score breakdown that bursts open, and a live leaderboard with ▲▼ arrows and a 👑 for the leader
- An on-screen announcer: combo 🔥, unstoppable!, you're first 👑, legendary bluff 😈, perfect 3/3
- A ✍️ indicator for who is typing, and pokes 👉 in the lobby
- 7 end-of-game titles plus "best lie of the game"
- Levels and XP, 24 permanent achievements 🏅, and hats that unlock as you level
- Emoji that fly across everyone's screen, confetti, and phone haptics
- A revealed answer links straight to an image search, because half the fun of a strange answer is seeing the thing

## Accounts and profiles
Players sign in with Discord — there is no typed name, so nobody can sit down as someone else. Signing in gives you a profile with lifetime stats, achievements, a place on the leaderboard, and your last five matches. Any finished match has its own shareable page at `/match/<id>` that anyone can open, whether or not they were in the room.

## 🎮 Running it as a Discord Activity
The game runs inside Discord (launched from the rocket 🚀 button in a voice channel) — everyone in that channel lands in the same room automatically, and their names come from their Discord accounts.

**Setup (all of it happens in your own Discord and Render accounts):**
1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) → **New Application**.
2. Under the **Activities** tab, enable it, and under **URL Mappings** add a root mapping: prefix `/` → target is your Render domain without `https://` (e.g. `maqlab.onrender.com`).
3. Under **OAuth2**, copy the **Client ID**, then **Reset Secret** and copy the **Client Secret** (never put it anywhere public).
4. In the Render dashboard: **Environment** → add both variables:
   - `DISCORD_CLIENT_ID`
   - `DISCORD_CLIENT_SECRET`
5. Redeploy (Render restarts automatically once environment variables change).
6. Under **Activities → Settings**, add the server you want to test in, and launch the game from a voice channel with the rocket button.

**Note:** without those two variables the game runs fine as an ordinary website — the Activity feature degrades quietly instead of breaking anything.

**Two things the Activity iframe will not forgive**, both already handled here and both worth knowing before you change `public/discord.js`:
- It can only talk to the mapped domain. The Discord SDK is therefore vendored into `public/vendor/` and imported by path; a CDN import is blocked and kills the bootstrap on its first line.
- Discord's proxy serves stale assets for a long time regardless of cache headers. The server stamps `app.js` and `avatar.js` with a hash of their contents, and `app.js` passes that stamp on to its import of `discord.js`. If you add another client module, give it the same treatment or you will spend an afternoon debugging code that is not running.

## Files
- `server.js`: the game engine (rooms, round scheduling, scoring, powers, titles)
- `content.js`: all the content in English and Arabic — 768 questions (bluff 157, numbers 125, true/false 152, most likely 117, emoji 106, spy 111). `npm run check` validates the banks for duplicates, schema and answers that give themselves away by length.
- `db.js` + `db/schema.sql`: profiles, match results, follows, reports, suggestions
- `auth.js`: signed session tokens, Discord sign-in, admin checks
- `public/`: the front end (`app.js`, `avatar.js` for the characters, `style.css`, `discord.js` for the Discord Activity integration)

---

# بالعربي

«اكذب بذكاء، اكشف الكذابين». الشلة تلعب من جوالاتها في نفس الوقت. كل جولة تبدأ بآلة حظ تحدد نوع الجولة ومضاعِف النقاط.

## التشغيل
```
npm install
npm start          # http://localhost:3000
```
للعب مع ناس على نفس الشبكة: افتح `http://<IP جهازك>:3000` من الجوالات وادخل بالكود المكوّن من 5 حروف أو امسح الـQR.

### تشغيل السيرفر بالخلفية (Windows / PowerShell)
```
.\start.ps1      # يشغّل السيرفر بالخلفية ويحفظ الـPID في .server.pid
.\stop.ps1       # يوقف السيرفر
.\restart.ps1    # إعادة تشغيل (stop ثم start)
```
اللوقز تروح لـ`server.log` و`server.err.log` في نفس المجلد.

## أنواع الجولات (6)
| الجولة | الفكرة | النقاط |
|---|---|---|
| 🤥 **المقلب** | الكل يكتب كذبة، بعدين يختار الصح ويراهن ×1/×2/×3 | صح = 500×الرهان • غلط برهان عالي = −150 لكل مستوى • كل واحد ينخدع بكذبتك = +300 |
| 🎯 **أقرب رقم** | سؤال جوابه رقم | في الصميم (±1%) +1000 • الأقرب +600 • الثاني +300 • الثالث +150 |
| ⚡ **صح ولا خطأ** | 3 عبارات سريعة | صح +200 + سرعة حتى +200 • الأسرع +100 |
| 🔤 **فكّ الإيموجي** | 3 ألغاز إيموجي، 4 خيارات | صح +300 + سرعة حتى +300 • الأسرع +100 |
| 👥 **مين فينا؟** | الكل يصوّت على واحد من الشلة (يحتاج 3 لاعبين أو أكثر) | مع الأغلبية +300 • اللي اختاروه +150 |
| 🕵️ **الجاسوس** | واحد بينهم جاسوس يشوف الفئة بس (بدون الكلمة)، الكل يكتب تلميح، وبعدين يصوّتون مين الجاسوس (يحتاج 4 لاعبين أو أكثر) | لقّطوا الجاسوس +350 • الجاسوس إذا هرب (أقل من نص الأصوات) +500 • الجاسوس إذا خمّن الكلمة الصح +300 |

**المضاعفات (آلة الحظ):** عادي، نقاط ×2 💎، سرعة ×1.5 ⏱️، صندوق الحظ 🎁، وآخر جولة دايماً **الجولة الذهبية ×3** 👑.

**القدرات (مرة وحدة لكل لعبة):** 🔍 كشّاف يشيل خيارين غلط (في التصويت والإيموجي) • 💎 دبل يضاعف نقاط جولة كاملة، والكل يشوف إنك فعّلته.

**الإعدادات:** لغة الأسئلة، الجولات (3/5/8/12)، أنواع الجولات، السرعة (رايق / عادي / سريع).

## اللمسات
- آلة حظ بتكتكة تتباطأ، وموسيقى خلفية هادئة تتولّد في المتصفح (تقدر تطفيها)
- كشف الكذبات وحدة وحدة، و«انقلبت على يد فلان 😂»
- انفجار نقاطك الشخصية مع التفاصيل، ولوحة ترتيب متحركة بأسهم ▲▼ وتاج 👑 للمتصدر
- مذيع على الشاشة: كومبو 🔥، ما ينوقف!، صرت الأول 👑، مقلب أسطوري 😈، مثالي 3/3
- مؤشر ✍️ لمين قاعد يكتب، ونغز الربع 👉 في اللوبي
- 7 ألقاب آخر اللعبة + «أفضل كذبة في اللعبة»
- مستويات وخبرة، و24 إنجاز دائم 🏅، وقبعات تنفتح مع المستوى
- إيموجي يطيرون على شاشات الكل، كونفيتي، واهتزاز الجوال
- الجواب لما ينكشف فيه زر يوديك لبحث صور، لأن نص المتعة إنك تشوف الشي بعينك

## الحسابات والبروفايلات
الدخول عن طريق ديسكورد، وما فيه اسم يُكتب باليد — يعني ما أحد يقدر يدخل باسم غيره. تسجيل الدخول يعطيك بروفايل فيه إحصائياتك، وإنجازاتك، ومركزك في لوحة الترتيب، وآخر ٥ مباريات. كل مباراة خلصت لها صفحة خاصة على `‎/match/<id>` تقدر تشاركها مع أي أحد حتى لو ما كان معكم بالغرفة.

## 🎮 تشغيلها كـ Discord Activity
اللعبة تشتغل جوّا ديسكورد (تفتح من زر الروكيت 🚀 في قناة صوتية) — كل الشلة اللي بنفس القناة تدخل نفس الغرفة تلقائياً، وأسماؤهم تنسحب من حساباتهم في ديسكورد بدون ما يكتبونها. الخطوات الكاملة موجودة في القسم الإنجليزي فوق.
