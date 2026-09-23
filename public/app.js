// Imported by URL rather than by name so the ?v= stamp on this module rides
// along to the next one. Discord's activity proxy caches hard enough that
// headers alone do not dislodge a stale client, and a half-updated pair of
// modules is worse than either.
const { getDiscordBootstrap } = await import('./discord.js' + new URL(import.meta.url).search);

(() => {
  'use strict';

  const $app = document.getElementById('app');
  const $toasts = document.getElementById('toasts');
  const $modal = document.getElementById('modal-root');
  const $floaters = document.getElementById('floaters');

  // Discord launches the game inside an iframe and says so in the URL. Several
  // decisions below hang off this, including the very first screen we paint.
  const IN_DISCORD = new URLSearchParams(location.search).has('frame_id');

  // ================= storage =================
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };

  // ================= i18n =================
  const STR = {
    ar: {
      appName: 'MAQLAB', tagline: 'اكذب بذكاء، اكشف الكذابين 😏', yourName: 'اسمك', create: 'أنشئ غرفة ✨', join: 'ادخل', or: 'أو',
      how: 'كيف تلعب؟', editAvatar: 'عدّل شخصيتك', save: 'حفظ', random: 'عشوائي 🎲', needName: 'اكتب اسمك أول 😊', needCode: 'اكتب كود الغرفة',
      tab_s: 'الشكل', tab_c: 'اللون', tab_e: 'العيون', tab_m: 'الفم', tab_h: 'القبعة', lockedAt: 'تنفتح في المستوى {n} 🔒', hatUnlocked: 'فتحت قبعة جديدة! 🎩',
      roomCode: 'كود الغرفة', copyLink: 'انسخ الرابط', share: 'شارك', copied: 'تم النسخ ✅', players: 'اللاعبين', invite: 'ادعُ', pokeHint: 'اضغط على أي لاعب عشان تنغزه 👉',
      settings: 'الإعدادات', qLang: 'لغة الأسئلة', rounds: 'عدد الجولات', types: 'أنواع الجولات', pace: 'السرعة', chill: 'رايق 😌', normal: 'عادي', fast: 'سريع ⚡',
      start: 'يلا نبدأ! 🚀', waitHost: 'بانتظار المضيف يبدأ اللعبة', enterRoom: 'ادخل الغرفة', room: 'غرفة',
      round: 'الجولة', spinning: 'وش بتكون الجولة الجاية؟',
      type_bluff: 'المقلب', desc_bluff: 'اكتب كذبة مقنعة تخدع فيها الشلة', type_number: 'أقرب رقم', desc_number: 'خمّن الرقم… الأقرب يكسب', type_blitz: 'صح ولا خطأ', desc_blitz: '3 عبارات سريعة، والسرعة تفرق!',
      type_likely: 'مين فينا؟', desc_likely: 'صوّت على واحد من الشلة… ووافق الأغلبية', type_emoji: 'فكّ الإيموجي', desc_emoji: '3 ألغاز إيموجي… الأسرع يكسب',
      type_odd: 'الدخيل', desc_odd: '٤ كلمات، وحدة منهم ما لها دخل… لقّطها بسرعة', type_spy: 'الجاسوس', desc_spy: 'واحد بينكم جاسوس ما يعرف الكلمة… لقّطوه! 🕵️',
      category: 'الفئة', youAreSpy: 'أنت الجاسوس! 🕵️', spyHintSpy: 'اكتب تلميح يخليهم يحسبونك تعرف الكلمة', spyHintCivilian: 'اكتب تلميح عن الكلمة بدون ما تقولها',
      writeClue: 'اكتب تلميحك…', yourClue: 'تلميحك', spyPickSuspect: 'مين تحس إنه الجاسوس؟ 🤔', spyWordIs: 'الكلمة: {n}',
      guessWord: 'خمّن الكلمة السرية (اختياري)', spyGuessBtn: 'خمّن 🎯', guessSent: 'خمّنت: {n}',
      spyWas: 'الجاسوس كان: {n}! 🕵️', spyCaught: 'انلقط! ✅', spyEscaped: 'هرب! 😈', spyGuessWas: 'خمّن الكلمة: «{n}»',
      mod_normal: 'عادي', mod_double: 'نقاط ×2', mod_speed: 'سرعة ×1.5', mod_jackpot: 'صندوق الحظ', mod_golden: 'الجولة الذهبية ×3',
      mdesc_normal: 'نقاط عادية', mdesc_double: 'كل النقاط مضاعفة!', mdesc_speed: 'الوقت أقصر والنقاط ×1.5', mdesc_jackpot: 'أعلى لاعب بالجولة ياخذ صندوق مفاجآت 🎁', mdesc_golden: 'آخر جولة… كل شيء ×3!',
      writeLie: 'اكتب إجابة كاذبة مقنعة…', lieHint: 'كل واحد ينخدع بكذبتك = +300', send: 'أرسل 😈', yourLie: 'كذبتك', waitOthers: 'ننتظر الباقين',
      pickTruth: 'وين الإجابة الصحيحة؟ 🤔', bet1: 'آمن', bet2: 'واثق', bet3: 'متأكد 100%', yours: 'كذبتك', betInfo: 'صح = 500 × رهانك • غلط = −150 لكل مستوى زيادة', voted: 'تم التصويت ✓',
      lieBy: 'كذبة {n}', houseLie: 'كذبة اللعبة 🤖', truth: 'الصح ✅', fooledN: 'انخدع {n} 😈', gotIt: 'عرفوها 🧠', nobody: 'ما أحد عرفها! 😱', next: 'التالي ⏭', nextIn: 'التالي بعد', seeImages: 'شوف صور', gotFooledBy: 'انقلبت على يد {n} 😂',
      yourGuess: 'تخمينك', typeNumber: 'اكتب رقم', true: 'صح', false: 'خطأ', rightAns: 'أصبت! 🎉', wrongAns: 'أخطأت 😬', noAns: 'ما جاوبت ⏰', fastestIs: '⚡ الأسرع: {n}',
      pickPlayer: 'اختار واحد من الشلة 👇', youPicked: 'اخترت {n}', likelyWinner: 'الشلة اختارت: {n}!', votesN: { one: 'صوت واحد', two: 'صوتان', few: '{n} أصوات', many: '{n} صوتاً', other: '{n} صوتاً' }, withCrowd: 'مع الأغلبية +300 👥', noVotes: 'ما أحد صوّت',
      whatEmoji: 'وش تعني هالإيموجيات؟', answerWas: 'الجواب: {v}',
      scores: 'الترتيب', final: 'انتهت اللعبة! 🎉', winnerIs: '{n} فاز! 🏆', awards: 'الألقاب', playAgain: 'جولة ثانية 🔁', home: 'الرئيسية', bestLie: 'أفضل كذبة في اللعبة', bestLieBy: '{n} • خدعت {f}',
      level: 'مستوى', levelUp: 'مستوى جديد! 🎉',
      leave: 'غادر الغرفة', endGame: 'أنهِ اللعبة الحين', sound: 'الأصوات', music: 'الموسيقى', on: 'شغّال', off: 'مطفي', uiLang: 'English', menu: 'القائمة',
      kicked: 'تم إخراجك من الغرفة', confirmKick: 'تبي تطلّع {n} من الغرفة؟', yes: 'إيه', cancel: 'إلغاء', reconnecting: 'انقطع الاتصال… نحاول نرجع', loading: 'جاري الدخول…', close: 'تمام', pokedYou: '{n} نغزك 👉',
      power_peek: 'كشّاف', power_double: 'دبل', powerOn: 'مفعّل ✓', peekDone: 'شلنا خيارين غلط 🔍', doubleDone: 'نقاطك بهالجولة ×2 💎', doubledBy: '💎 {n} فعّل الدبل!',
      err_truth: 'هذي الإجابة الصحيحة! اكتب كذبة 😏', err_own: 'ما تقدر تختار كذبتك 😅', err_selfvote: 'ما تقدر تصوت لنفسك 😅', err_noroom: 'الغرفة غير موجودة', err_full: 'الغرفة ممتلئة', err_nan: 'اكتب رقم صحيح', err_empty: 'اكتب شيء أول', err_late: 'انتهى الوقت ⏰', err_host: 'للمضيف فقط', err_dup: 'استخدمتها خلاص', err_nopower: 'خلصت هالقدرة', err_nopeek: 'الكشّاف يشتغل وقت الاختيار بس 🔍', err_bad: 'خيار غير صالح', err_signin: 'سجّل دخولك بديسكورد أول',
      g_correct: 'إجابة صحيحة', g_fooled: 'خدعت لاعبين', g_betLoss: 'خسارة الرهان', g_streak: 'سلسلة 🔥', g_bullseye: 'في الصميم 🎯', g_closest: 'الأقرب', g_second: 'المركز الثاني', g_third: 'المركز الثالث', g_blitz: 'إجابات صحيحة', g_emoji: 'إجابات صحيحة', g_odd: 'إجابات صحيحة', g_speed: 'مكافأة السرعة', g_fastest: 'الأسرع ⚡', g_jackpot: 'صندوق الحظ 🎁', g_majority: 'مع الأغلبية 👥', g_famous: 'اختاروك 🌟', g_double: 'دبل 💎', g_spyCatch: 'لقّط الجاسوس', g_spyEvade: 'هرب من اللقطة', g_spyGuess: 'خمّن الكلمة',
      a_liar: 'سيد المقالب', a_liar_d: { one: 'خدع مرة واحدة', two: 'خدع مرتين', few: 'خدع {n} مرات', many: 'خدع {n} مرة', other: 'خدع {n} مرة' }, a_detective: 'المحقق', a_detective_d: { one: 'إجابة صحيحة واحدة', two: 'إجابتان صحيحتان', few: '{n} إجابات صحيحة', many: '{n} إجابة صحيحة', other: '{n} إجابة صحيحة' }, a_sniper: 'القناص', a_sniper_d: { one: 'تخمين دقيق واحد', two: 'تخمينان دقيقان', few: '{n} تخمينات دقيقة', many: '{n} تخميناً دقيقاً', other: '{n} تخميناً دقيقاً' }, a_lightning: 'البرق', a_lightning_d: { one: 'الأسرع مرة واحدة', two: 'الأسرع مرتين', few: 'الأسرع {n} مرات', many: 'الأسرع {n} مرة', other: 'الأسرع {n} مرة' }, a_gambler: 'المغامر', a_gambler_d: { one: 'راهن بقوة مرة واحدة', two: 'راهن بقوة مرتين', few: 'راهن بقوة {n} مرات', many: 'راهن بقوة {n} مرة', other: 'راهن بقوة {n} مرة' }, a_fire: 'ولّعت', a_fire_d: 'سلسلة {n} 🔥', a_star: 'نجم الشلة', a_star_d: { one: 'اختاروه مرة واحدة', two: 'اختاروه مرتين', few: 'اختاروه {n} مرات', many: 'اختاروه {n} مرة', other: 'اختاروه {n} مرة' },
      ann_first: 'صرت الأول! 👑', ann_combo: 'كومبو ×{n} 🔥', ann_unstoppable: 'ما ينوقف!! 🔥🔥', ann_legend: 'مقلب أسطوري! 😈', ann_perfect: 'مثالي! 3 من 3 ✨', ann_golden: 'الجولة الذهبية! 👑',
      achievements: 'إنجازاتي', achUnlocked: 'إنجاز جديد! 🏅',
      ach_games50: 'مدمن فعلي', achd_games50: 'العب ٥٠ لعبة', ach_wins25: 'بطل', achd_wins25: 'افز بـ٢٥ لعبة',
      ach_liar50: 'أبو الكذب', achd_liar50: 'اخدع ٥٠ لاعب', ach_bull10: 'قنّاص محترف', achd_bull10: '١٠ مرات في الصميم',
      ach_streak8: 'ما ينوقف', achd_streak8: 'سلسلة ٨ ورا بعض', ach_speedy25: 'برق مضاعف', achd_speedy25: 'كن الأسرع ٢٥ مرة',
      ach_spy_hunter: 'صائد الجواسيس', achd_spy_hunter: 'لقّط الجاسوس ٥ مرات', ach_spy_ghost: 'شبح', achd_spy_ghost: 'اهرب كجاسوس ٥ مرات',
      ach_winstreak3: 'ثلاثية', achd_winstreak3: 'افز ٣ ألعاب ورا بعض', ach_winstreak10: 'أسطورة حية', achd_winstreak10: 'افز ١٠ ألعاب ورا بعض',
      ach_score10k: 'عشرة آلاف', achd_score10k: 'اجمع ١٠٬٠٠٠ نقطة', ach_score100k: 'مليونير', achd_score100k: 'اجمع ١٠٠٬٠٠٠ نقطة',
      ach_crowded: 'نجم الحفلة', achd_crowded: 'افز بلعبة فيها ٦ لاعبين أو أكثر', ach_sniper: 'عين الصقر', achd_sniper: '٢٠ تخمين دقيق',
      ach_first_game: 'أول لعبة', achd_first_game: 'خلّص أول لعبة', ach_first_win: 'أول فوز', achd_first_win: 'اطلع الأول في لعبة', ach_liar5: 'كذّاب محترف', achd_liar5: 'اخدع 5 لاعبين', ach_bull: 'قنّاص', achd_bull: 'جيب «في الصميم» 🎯', ach_streak4: 'نار', achd_streak4: 'سلسلة 4 ورا بعض', ach_allin: 'كل شي أو لا شي', achd_allin: 'اكسب رهان ×3', ach_famous: 'المشهور', achd_famous: 'الشلة تختارك في «مين فينا؟»', ach_speedy: 'برق', achd_speedy: 'كن الأسرع 3 مرات', ach_games10: 'مدمن', achd_games10: 'العب 10 ألعاب', ach_wins5: 'أسطورة', achd_wins5: 'افز بـ 5 ألعاب',
      howSteps: ['أنشئ غرفة وشارك الكود أو الرابط مع الشلة.', 'كل جولة تبدأ بآلة الحظ: تحدد نوع الجولة ومضاعف النقاط.', '🤥 المقلب: اكتب كذبة مقنعة، بعدين اختار الصح وراهن عليه.', '🎯 أقرب رقم: خمّن، والأقرب ياخذ النقاط (والصميم +1000!).', '⚡ صح ولا خطأ و🔤 فكّ الإيموجي: جاوب بسرعة، كل ثانية تفرق.', '👥 مين فينا؟ صوّت على واحد من الشلة ووافق الأغلبية.', '🕵️ الجاسوس: واحد ما يعرف الكلمة، الكل يكتب تلميح، وبعدين صوتوا مين الجاسوس!', 'عندك قدرتين كل لعبة: 🔍 كشّاف يشيل خيارين غلط، و💎 دبل يضاعف نقاط جولة.', 'اجمع سلاسل 🔥 واكسب الألقاب والإنجازات وارفع مستواك!'],
      bullseye: 'في الصميم! 🎯', streakToast: 'سلسلة {n}! 🔥',
      teams: 'وضع الفرق', teamsOff: 'كل واحد لحاله', teamsOn: 'فريقين ⚔️', team_A: 'الجمر 🔥', team_B: 'الموج 🌊', joinTeam: 'انضم', teamWins: 'فاز فريق {n}! 🏆', teamTie: 'تعادل الفريقين! 🤝',
      ready: 'جاهز ✋', notReady: 'مو جاهز بعد', readyN: '{n}/{m} جاهزين',
      balloonTitle: '🎈 لين تبدأ اللعبة… نفّخوا البالون!', balloonHint: 'اضغط على البالون بسرعة، اللي يفجّره يكسب 💥', popped: '💥 {n} فجّر البالون!', balloonKing: 'ملك البالون: {n} 🎈 ×{c}',
      laughHint: 'اضحك على أحلى كذبة 😂 وصاحبها ياخذ +200', g_funniest: 'أضحك كذبة 😂',
      rivals: '⚔️ خصومك', nemesis: 'عدوك اللدود', nemesisD: { one: 'قلبك مرة واحدة 😤', two: 'قلبك مرتين 😤', few: 'قلبك {n} مرات 😤', many: 'قلبك {n} مرة 😤', other: 'قلبك {n} مرة 😤' }, victim: 'ضحيتك المفضلة', victimD: { one: 'قلبته مرة واحدة 😈', two: 'قلبته مرتين 😈', few: 'قلبته {n} مرات 😈', many: 'قلبته {n} مرة 😈', other: 'قلبته {n} مرة 😈' },
      phrases: ['ما راح تعرفها 😏', 'أنا الفايز 🏆', 'يا ساتر 😂', 'ركّز يا بطل!', 'كذّاب! 🤥', 'يلا بسرعة ⏰', 'حظ أوفر 😅', 'الله عليك 👏', 'مستحيل! 😱', 'صدقني هذي الصح 😇', 'خلاص تعبت 😴', 'انتقامي قادم 😈'],
      signIn: 'دخول بديسكورد', signInToPlay: 'سجّل دخولك بديسكورد عشان تلعب — اسمك وصورتك يجونك منه', signOut: 'تسجيل خروج', guestNote: 'تلعب كضيف — تقدمك ما ينحفظ', signedInAs: 'مسجّل باسم',
      profile: 'الملف الشخصي', leaderboard: 'المتصدرون', suggestBtn: 'أرسل اقتراح', about: 'عن اللعبة', adminPanel: 'لوحة الإدارة',
      rank: 'الترتيب', games: 'ألعاب', wins: 'فوز', winRate: 'نسبة الفوز', bestScore: 'أعلى نتيجة', totalScore: 'مجموع النقاط',
      curStreak: 'سلسلة الفوز', bestStreak: 'أطول سلسلة', followers: 'متابِعين', followingN: 'يتابع', memberSince: 'عضو منذ',
      whichOdd: 'مين الدخيل بينهم؟', type_order: 'رتّبها', desc_order: 'رتّب ٤ أشياء… كل جارَين بالترتيب الصح لك نقاط', clear: 'امسح', lockIn: 'ثبّت الترتيب ✅', pickAll: 'باقي {n}', youSaid: 'حطيتها {n}', perfectOrder: 'ترتيب مثالي! 🎯', pairsRight: '{n} من ٣ صح', g_orderPairs: 'ترتيب صحيح', g_orderPerfect: 'ترتيب مثالي 🎯', addBot: 'ضيف بوت', soloHint: 'لحالك؟ اضغط «ضيف بوت»، أو ابدأ وبنجيب لك ربع 🤖', discordSignInBusy: 'قاعدين نسجّل دخولك من ديسكورد…', discordFailed: 'ما قدرنا نسجّل دخولك من ديسكورد: {e}', tryAgain: 'جرّب مرة ثانية', follow: 'متابعة', unfollow: 'إلغاء المتابعة', lastGames: 'آخر الألعاب', noGames: 'ما لعب أي لعبة بعد',
      repRounds: 'جولات المباراة', repTruth: 'الإجابة الصحيحة', repHouse: 'خيار من اللعبة', repAnswer: 'الجواب',
      repNobody: 'ما أحد', repMostVotes: 'أكثر واحد صوّتوا له', repCaught: 'انكشف 🎯', repEscaped: 'نجا بجلده 😎',
      repSpyGuess: 'تخمين الجاسوس', repRoundPts: 'نقاط الجولة', repCorrect: 'الترتيب الصحيح',
      matchResult: 'نتيجة المباراة', shareMatch: 'انسخ رابط المباراة', matchGone: 'المباراة هذي ما عادت موجودة', place1: 'الأول', placeN: 'المركز {n}', roundsN: { one: 'جولة واحدة', two: 'جولتان', few: '{n} جولات', many: '{n} جولة', other: '{n} جولة' }, openMatch: 'افتح',
      report: 'بلاغ', reportTitle: 'بلاغ عن {n}', reportWhy: 'وش المشكلة؟', r_cheat: 'غش', r_name: 'اسم مسيء', r_chat: 'إساءة بالدردشة', r_other: 'غير ذلك',
      reportDetails: 'تفاصيل (اختياري)', reportSent: 'وصلنا البلاغ، شكراً 🙏', suggestPlaceholder: 'وش تبي نضيف أو نغيّر؟',
      sent: 'تم الإرسال ✅', signInFirst: 'سجّل دخول أول', slowDown: 'على مهلك شوي ⏳',
      openRooms: 'غرف مفتوحة', noRooms: 'ما فيه غرف مفتوحة الحين — أنشئ وحدة!', refresh: 'تحديث', inLobby: 'باللوبي', playing: 'تلعب الحين',
      publicRoom: 'الغرفة', roomPublic: 'ظاهرة للكل', roomPrivate: 'بالكود فقط',
      makeHost: 'سلّمه التاج 👑', confirmHost: 'تسلّم الاستضافة لـ{n}؟', nowHost: '{n} صار المضيف 👑',
      tab_reports: 'البلاغات', tab_suggestions: 'الاقتراحات', tab_banned: 'المحظورين', tab_search: 'بحث',
      ban: 'حظر', unban: 'فك الحظر', resetProfile: 'تصفير البروفايل', markDone: 'تم', banWhy: 'سبب الحظر',
      confirmReset: 'تصفير كل تقدم {n}؟ ما يمكن التراجع.', nothingHere: 'ما فيه شي هنا 👌', searchPlayers: 'ابحث باسم لاعب',
      youAreBanned: 'حسابك محظور: {r}', achLocked: 'مقفل',
      aboutBody: ['مقلب لعبة حفلات جماعية عربية/إنجليزية، تنلعب من الجوال مع الشلة في نفس الوقت.', '٦ أنواع جولات، آلة حظ تحدد المضاعف، وقدرات تستخدمها مرة وحدة باللعبة.', 'كل شي فيها أصلي: الأسئلة، الشخصيات، والأصوات تتولّد بالمتصفح بدون أي ملفات.'],
      aboutMade: 'صُنعت بـ ❤️', version: 'الإصدار', terms: 'شروط الاستخدام', privacy: 'سياسة الخصوصية',
    },
    en: {
      appName: 'MAQLAB', tagline: 'Bluff smart. Catch the liars. 😏', yourName: 'Your name', create: 'Create room ✨', join: 'Join', or: 'or',
      how: 'How to play', editAvatar: 'Customize', save: 'Save', random: 'Random 🎲', needName: 'Enter your name first 😊', needCode: 'Enter the room code',
      tab_s: 'Shape', tab_c: 'Color', tab_e: 'Eyes', tab_m: 'Mouth', tab_h: 'Hat', lockedAt: 'Unlocks at level {n} 🔒', hatUnlocked: 'New hat unlocked! 🎩',
      roomCode: 'ROOM CODE', copyLink: 'Copy link', share: 'Share', copied: 'Copied ✅', players: 'Players', invite: 'Invite', pokeHint: 'Tap a player to poke them 👉',
      settings: 'Settings', qLang: 'Question language', rounds: 'Rounds', types: 'Round types', pace: 'Pace', chill: 'Chill 😌', normal: 'Normal', fast: 'Fast ⚡',
      start: "Let's go! 🚀", waitHost: 'Waiting for the host to start', enterRoom: 'Enter room', room: 'Room',
      round: 'Round', spinning: "What's next?",
      type_bluff: 'The Bluff', desc_bluff: 'Write a convincing lie to fool everyone', type_number: 'Closest Number', desc_number: 'Guess the number — closest wins', type_blitz: 'True or False', desc_blitz: '3 quick statements — speed matters!',
      type_likely: "Who's Most Likely?", desc_likely: 'Vote for a friend… and side with the crowd', type_emoji: 'Emoji Decode', desc_emoji: '3 emoji puzzles — fastest wins',
      type_odd: 'Odd One Out', desc_odd: "4 things, one does not belong — spot it fast", type_spy: 'The Spy', desc_spy: "One of you is a spy who doesn't know the word… catch them! 🕵️",
      category: 'Category', youAreSpy: "You're the SPY! 🕵️", spyHintSpy: 'Write a clue that makes them think you know the word', spyHintCivilian: 'Write a clue about the word without saying it',
      writeClue: 'Type your clue…', yourClue: 'Your clue', spyPickSuspect: "Who do you think is the spy? 🤔", spyWordIs: 'The word: {n}',
      guessWord: 'Guess the secret word (optional)', spyGuessBtn: 'Guess 🎯', guessSent: 'You guessed: {n}',
      spyWas: 'The spy was: {n}! 🕵️', spyCaught: 'Caught! ✅', spyEscaped: 'Got away! 😈', spyGuessWas: 'Guessed the word: "{n}"',
      mod_normal: 'Normal', mod_double: 'Double ×2', mod_speed: 'Speed ×1.5', mod_jackpot: 'Jackpot', mod_golden: 'Golden round ×3',
      mdesc_normal: 'Regular points', mdesc_double: 'Every point is doubled!', mdesc_speed: 'Less time, points ×1.5', mdesc_jackpot: "The round's top player wins a mystery box 🎁", mdesc_golden: 'Final round… everything ×3!',
      writeLie: 'Type a convincing fake answer…', lieHint: 'Every player you fool = +300', send: 'Send 😈', yourLie: 'Your lie', waitOthers: 'Waiting for others',
      pickTruth: 'Which one is the truth? 🤔', bet1: 'Safe', bet2: 'Sure', bet3: 'All in', yours: 'yours', betInfo: 'Right = 500 × bet • Wrong = −150 per extra level', voted: 'Voted ✓',
      lieBy: "{n}'s lie", houseLie: 'House lie 🤖', truth: 'TRUTH ✅', fooledN: '{n} fooled 😈', gotIt: 'Got it 🧠', nobody: 'Nobody got it! 😱', next: 'Next ⏭', nextIn: 'Next in', seeImages: 'See images', gotFooledBy: '{n} got you! 😂',
      yourGuess: 'Your guess', typeNumber: 'Type a number', true: 'True', false: 'False', rightAns: 'Correct! 🎉', wrongAns: 'Wrong 😬', noAns: 'No answer ⏰', fastestIs: '⚡ Fastest: {n}',
      pickPlayer: 'Pick someone 👇', youPicked: 'You picked {n}', likelyWinner: 'The crowd picked: {n}!', votesN: { one: '1 vote', other: '{n} votes' }, withCrowd: 'With the crowd +300 👥', noVotes: 'No votes',
      whatEmoji: 'What do these emojis mean?', answerWas: 'Answer: {v}',
      scores: 'Leaderboard', final: 'Game over! 🎉', winnerIs: '{n} wins! 🏆', awards: 'Awards', playAgain: 'Play again 🔁', home: 'Home', bestLie: 'Best lie of the game', bestLieBy: '{n} • fooled {f}',
      level: 'Level', levelUp: 'Level up! 🎉',
      leave: 'Leave room', endGame: 'End game now', sound: 'Sound effects', music: 'Music', on: 'On', off: 'Off', uiLang: 'العربية', menu: 'Menu',
      kicked: 'You were removed from the room', confirmKick: 'Remove {n} from the room?', yes: 'Yes', cancel: 'Cancel', reconnecting: 'Connection lost… reconnecting', loading: 'Joining…', close: 'Got it', pokedYou: '{n} poked you 👉',
      power_peek: 'Peek', power_double: 'Double', powerOn: 'Active ✓', peekDone: 'Removed two wrong options 🔍', doubleDone: 'Your points this round ×2 💎', doubledBy: '💎 {n} used Double!',
      err_truth: "That's the real answer! Write a lie 😏", err_own: "You can't pick your own lie 😅", err_selfvote: "You can't vote for yourself 😅", err_noroom: "Room doesn't exist", err_full: 'Room is full', err_nan: 'Enter a valid number', err_empty: 'Type something first', err_late: "Time's up ⏰", err_host: 'Host only', err_dup: 'Already used', err_nopower: 'No uses left', err_nopeek: 'Peek only works while choosing 🔍', err_bad: 'Invalid choice', err_signin: 'Sign in with Discord first',
      g_correct: 'Correct answer', g_fooled: 'Fooled players', g_betLoss: 'Lost bet', g_streak: 'Streak 🔥', g_bullseye: 'Bullseye 🎯', g_closest: 'Closest', g_second: '2nd closest', g_third: '3rd closest', g_blitz: 'Correct answers', g_emoji: 'Correct answers', g_odd: 'Correct answers', g_speed: 'Speed bonus', g_fastest: 'Fastest ⚡', g_jackpot: 'Jackpot 🎁', g_majority: 'With the crowd 👥', g_famous: 'Crowd pick 🌟', g_double: 'Double 💎', g_spyCatch: 'Caught the spy', g_spyEvade: 'Evaded capture', g_spyGuess: 'Guessed the word',
      a_liar: 'Master Liar', a_liar_d: { one: 'Fooled once', other: 'Fooled {n} times' }, a_detective: 'Detective', a_detective_d: { one: '1 correct answer', other: '{n} correct answers' }, a_sniper: 'Sniper', a_sniper_d: { one: '1 spot-on guess', other: '{n} spot-on guesses' }, a_lightning: 'Lightning', a_lightning_d: { one: 'Fastest once', other: 'Fastest {n} times' }, a_gambler: 'High Roller', a_gambler_d: { one: 'Bet big once', other: 'Bet big {n} times' }, a_fire: 'On Fire', a_fire_d: '{n} streak 🔥', a_star: 'Crowd Favorite', a_star_d: { one: 'Picked once', other: 'Picked {n} times' },
      ann_first: "You're #1! 👑", ann_combo: 'Combo ×{n} 🔥', ann_unstoppable: 'UNSTOPPABLE!! 🔥🔥', ann_legend: 'Legendary bluff! 😈', ann_perfect: 'Perfect! 3 of 3 ✨', ann_golden: 'GOLDEN ROUND! 👑',
      achievements: 'Achievements', achUnlocked: 'Achievement unlocked! 🏅',
      ach_games50: 'Veteran', achd_games50: 'Play 50 games', ach_wins25: 'Champion', achd_wins25: 'Win 25 games',
      ach_liar50: 'Master of Lies', achd_liar50: 'Fool 50 players', ach_bull10: 'Dead Eye', achd_bull10: 'Hit 10 bullseyes',
      ach_streak8: 'Unstoppable', achd_streak8: 'Get an 8 streak', ach_speedy25: 'Double Lightning', achd_speedy25: 'Be fastest 25 times',
      ach_spy_hunter: 'Spy Hunter', achd_spy_hunter: 'Catch the spy 5 times', ach_spy_ghost: 'Ghost', achd_spy_ghost: 'Escape as the spy 5 times',
      ach_winstreak3: 'Hat Trick', achd_winstreak3: 'Win 3 games in a row', ach_winstreak10: 'Living Legend', achd_winstreak10: 'Win 10 games in a row',
      ach_score10k: 'Ten Thousand', achd_score10k: 'Earn 10,000 points', ach_score100k: 'Point Millionaire', achd_score100k: 'Earn 100,000 points',
      ach_crowded: 'Life of the Party', achd_crowded: 'Win a game with 6+ players', ach_sniper: 'Hawk Eye', achd_sniper: '20 spot-on guesses',
      ach_first_game: 'First Game', achd_first_game: 'Finish your first game', ach_first_win: 'First Win', achd_first_win: 'Finish 1st in a game', ach_liar5: 'Pro Liar', achd_liar5: 'Fool 5 players', ach_bull: 'Sharpshooter', achd_bull: 'Hit a bullseye 🎯', ach_streak4: 'On Fire', achd_streak4: 'Get a 4 streak', ach_allin: 'All In', achd_allin: 'Win a ×3 bet', ach_famous: 'Famous', achd_famous: "Be the crowd's pick", ach_speedy: 'Lightning', achd_speedy: 'Be fastest 3 times', ach_games10: 'Regular', achd_games10: 'Play 10 games', ach_wins5: 'Legend', achd_wins5: 'Win 5 games',
      howSteps: ['Create a room and share the code or link with friends.', 'Every round starts with a slot machine: round type + point multiplier.', '🤥 The Bluff: write a convincing lie, then find the truth and bet on it.', '🎯 Closest Number: guess — closest wins (bullseye = +1000!).', '⚡ True or False & 🔤 Emoji Decode: answer fast, every second counts.', "👥 Who's Most Likely: vote for a friend and side with the crowd.", "🕵️ The Spy: one player doesn't know the word — everyone drops a clue, then vote who's the spy!", 'Two power-ups per game: 🔍 Peek removes two wrong options, 💎 Double doubles one round.', 'Build 🔥 streaks, win awards & achievements and level up!'],
      bullseye: 'BULLSEYE! 🎯', streakToast: '{n} streak! 🔥',
      teams: 'Team mode', teamsOff: 'Solo', teamsOn: 'Two teams ⚔️', team_A: 'Ember 🔥', team_B: 'Wave 🌊', joinTeam: 'Join', teamWins: 'Team {n} wins! 🏆', teamTie: "It's a tie! 🤝",
      ready: 'Ready ✋', notReady: 'Not ready', readyN: '{n}/{m} ready',
      balloonTitle: '🎈 While you wait… pump the balloon!', balloonHint: 'Tap the balloon fast — whoever pops it wins 💥', popped: '💥 {n} popped the balloon!', balloonKing: 'Balloon king: {n} 🎈 ×{c}',
      laughHint: 'Laugh at the funniest lie 😂 — its author gets +200', g_funniest: 'Funniest lie 😂',
      rivals: '⚔️ Your rivals', nemesis: 'Your nemesis', nemesisD: { one: 'Fooled you once 😤', other: 'Fooled you {n} times 😤' }, victim: 'Favourite victim', victimD: { one: 'You fooled them once 😈', other: 'You fooled them {n} times 😈' },
      phrases: ["You'll never get it 😏", "I'm winning 🏆", 'LOL 😂', 'Focus!', 'Liar! 🤥', 'Hurry up ⏰', 'Better luck next time 😅', 'Nice one 👏', 'No way! 😱', "Trust me, that's it 😇", "I'm tired 😴", 'Revenge is coming 😈'],
      signIn: 'Sign in with Discord', signInToPlay: 'Sign in with Discord to play — your name comes from there', signOut: 'Sign out', guestNote: "Playing as a guest — progress isn't saved", signedInAs: 'Signed in as',
      profile: 'Profile', leaderboard: 'Leaderboard', suggestBtn: 'Send a suggestion', about: 'About', adminPanel: 'Admin',
      rank: 'Rank', games: 'Games', wins: 'Wins', winRate: 'Win rate', bestScore: 'Best score', totalScore: 'Total points',
      curStreak: 'Win streak', bestStreak: 'Longest streak', followers: 'Followers', followingN: 'Following', memberSince: 'Member since',
      whichOdd: "Which one doesn't belong?", type_order: 'Line Them Up', desc_order: 'Put 4 things in order — every neighbouring pair you get right scores', clear: 'Clear', lockIn: 'Lock it in ✅', pickAll: '{n} to go', youSaid: 'you said {n}', perfectOrder: 'Perfect order! 🎯', pairsRight: '{n} of 3 right', g_orderPairs: 'Right order', g_orderPerfect: 'Perfect order 🎯', addBot: 'Add bot', soloHint: 'On your own? Add a bot, or just start — we will sit some down for you 🤖', discordSignInBusy: 'Signing you in through Discord…', discordFailed: 'Could not sign you in through Discord: {e}', tryAgain: 'Try again', follow: 'Follow', unfollow: 'Unfollow', lastGames: 'Recent games', noGames: 'No games played yet',
      repRounds: 'Round by round', repTruth: 'the true answer', repHouse: 'filler option', repAnswer: 'Answer',
      repNobody: 'Nobody', repMostVotes: 'Most votes', repCaught: 'Caught 🎯', repEscaped: 'Got away 😎',
      repSpyGuess: "Spy's guess", repRoundPts: 'Round points', repCorrect: 'Correct order',
      matchResult: 'Match result', shareMatch: 'Copy match link', matchGone: 'That match is no longer around', place1: '1st', placeN: 'Place {n}', roundsN: { one: '1 round', other: '{n} rounds' }, openMatch: 'Open',
      report: 'Report', reportTitle: 'Report {n}', reportWhy: "What's wrong?", r_cheat: 'Cheating', r_name: 'Offensive name', r_chat: 'Abusive chat', r_other: 'Something else',
      reportDetails: 'Details (optional)', reportSent: 'Report received, thank you 🙏', suggestPlaceholder: 'What should we add or change?',
      sent: 'Sent ✅', signInFirst: 'Sign in first', slowDown: 'Slow down a little ⏳',
      openRooms: 'Open rooms', noRooms: 'No open rooms right now — start one!', refresh: 'Refresh', inLobby: 'In lobby', playing: 'Playing',
      publicRoom: 'Room', roomPublic: 'Listed publicly', roomPrivate: 'Code only',
      makeHost: 'Make host 👑', confirmHost: 'Hand hosting to {n}?', nowHost: '{n} is the host now 👑',
      tab_reports: 'Reports', tab_suggestions: 'Suggestions', tab_banned: 'Banned', tab_search: 'Search',
      ban: 'Ban', unban: 'Unban', resetProfile: 'Reset profile', markDone: 'Done', banWhy: 'Ban reason',
      confirmReset: "Reset all of {n}'s progress? This can't be undone.", nothingHere: 'Nothing here 👌', searchPlayers: 'Search by player name',
      youAreBanned: 'Your account is banned: {r}', achLocked: 'Locked',
      aboutBody: ['MAQLAB is a bilingual Arabic/English party game, played together on your phones.', '6 round types, a slot machine that sets the multiplier, and one-use power-ups.', 'Everything in it is original: the questions, the characters, and sound synthesized in the browser with no audio files.'],
      aboutMade: 'Made with ❤️', version: 'Version', terms: 'Terms of Service', privacy: 'Privacy Policy',
    },
  };

  // ================= state =================
  const state = {
    // English is the base language of the game; Arabic is the addition. New
    // visitors start in English whatever their browser says, and the ع button
    // in the top bar switches — the choice is then remembered.
    lang: store.get('uiLang', 'en'),
    profile: store.get('profile', { name: '', avatar: Jelly.random() }),
    tokens: store.get('tokens', {}),
    xp: store.get('xp', 0),
    recorded: store.get('recorded', []),
    sound: store.get('sound', true),
    music: store.get('music', true),
    ach: store.get('ach', { unlocked: [], games: 0, wins: 0, fooled: 0, fastest: 0 }),
    route: { name: 'home' },
    room: null, code: null, joining: false,
    draft: { name: '', code: '', lie: '', guess: '', spyClue: '', spyGuess: '', order: [] },
    bet: 1, showQR: false, reactOpen: false,
    me: null, isAdmin: false, lobbies: null, achList: null,
    // meKnown stays false until /api/auth/me answers. Rendering a sign-in
    // button before that is a lie half the time, and it is what made the
    // screen flip from signed-out to signed-in a moment after every load.
    meKnown: false,
    // Set only inside the Discord Activity, where cookies are unreliable and
    // the session has to ride along as a bearer token instead.
    bearer: null, inDiscord: IN_DISCORD, discordDone: false, discordStage: '', discordError: null,
    lastKey: '', phaseTotal: 1, timeouts: [], editor: null,
  };
  state.draft.name = state.profile.name;

  // Which form of a counted noun to use. English has two; Arabic has five,
  // and "just add an s" has no equivalent — one thing, two things (dual),
  // a few (3–10) and many (11+) each take a different form, and for one and
  // two the numeral is normally dropped altogether. So a plural string is an
  // object of forms rather than one string with {n} glued into it.
  const PLURAL = {
    en: n => (n === 1 ? 'one' : 'other'),
    ar: n => {
      const r = n % 100;
      if (n === 1) return 'one';
      if (n === 2) return 'two';
      if (r >= 3 && r <= 10) return 'few';
      if (r >= 11 && r <= 99) return 'many';
      return 'other';
    },
  };
  // Callers pass counts already run through fmt(), which in Arabic means
  // Arabic-Indic digits and thousands separators — Number('٣') is NaN, and a
  // NaN count silently picks the wrong form everywhere. So read the number
  // back out rather than trusting it to be one.
  const countOf = v => {
    const s = String(v ?? '').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[^\d]/g, '');
    return s ? Number(s) : 0;
  };
  const t = (k, v = {}) => {
    let s = (STR[state.lang][k] ?? STR.ar[k] ?? k);
    // Arrays (how-to steps, chat phrases) are picked from, not counted.
    if (s && typeof s === 'object' && !Array.isArray(s)) {
      const form = (PLURAL[state.lang] || PLURAL.en)(countOf(v.n));
      s = s[form] ?? s.many ?? s.other ?? s.one ?? k;
    }
    if (typeof s === 'string') for (const [a, b] of Object.entries(v)) s = s.split(`{${a}}`).join(b);
    return s;
  };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const J = (av, cls) => Jelly.svg(av, cls);
  const now = () => Date.now() + (state.clockOffset || 0);
  const myId = () => state.room && state.tokens[state.room.code];
  const isHost = () => state.room && state.room.hostId === myId();
  const P = id => state.room && state.room.players.find(p => p.id === id);
  const me = () => P(myId());
  const fmt = n => Number(n).toLocaleString(state.lang === 'ar' ? 'ar-EG' : 'en-US');
  const later = (ms, fn) => state.timeouts.push(setTimeout(fn, ms));
  function applyDir() { document.documentElement.lang = state.lang; document.documentElement.dir = state.lang === 'ar' ? 'rtl' : 'ltr'; document.title = 'MAQLAB | مقلب'; }

  const TYPES = { bluff: '🤥', number: '🎯', blitz: '⚡', likely: '👥', emoji: '🔤', odd: '🧩', order: '📊', spy: '🕵️' };
  const MODS = { normal: '✨', double: '💎', speed: '⏱️', jackpot: '🎁', golden: '👑' };
  const AWARD_E = { liar: '🤥', detective: '🕵️', sniper: '🎯', lightning: '⚡', gambler: '🎲', fire: '🔥', star: '🌟' };
  const ACH = [['first_game', '🎮'], ['first_win', '🏆'], ['liar5', '🤥'], ['bull', '🎯'], ['streak4', '🔥'], ['allin', '🎲'], ['famous', '🌟'], ['speedy', '⚡'], ['games10', '🏅'], ['wins5', '👑']];
  // hats that unlock with level (index -> level)
  const HAT_LOCK = { 7: 2, 8: 3, 9: 4, 11: 5, 1: 6 };

  function levelInfo(xp) {
    let level = 1, need = 500;
    while (xp >= need) { xp -= need; level++; need += 250; }
    return { level, into: xp, need };
  }
  const myLevel = () => levelInfo(state.xp).level;
  const hatLocked = h => HAT_LOCK[h] && myLevel() < HAT_LOCK[h];

  // ================= sound, music & haptics =================
  let actx = null;
  function ctx() {
    try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch {}
    return actx;
  }
  function tone(freq, dur = 0.1, type = 'sine', vol = 0.06, delay = 0, slide = 0, force) {
    if (!state.sound && !force) return;
    const a = ctx(); if (!a) return;
    try {
      const t0 = a.currentTime + delay;
      const o = a.createOscillator(), g = a.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t0);
      if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t0 + dur);
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g).connect(a.destination); o.start(t0); o.stop(t0 + dur + 0.05);
    } catch {}
  }
  const sfx = {
    tap: () => tone(620, 0.06, 'triangle', 0.05),
    pop: () => tone(420, 0.12, 'sine', 0.08, 0, 2.2),
    send: () => { tone(520, 0.08, 'triangle', 0.06); tone(780, 0.12, 'triangle', 0.06, 0.07); },
    tick: () => tone(1500, 0.025, 'square', 0.025),
    ding: () => { tone(988, 0.3, 'sine', 0.07); tone(1318, 0.45, 'sine', 0.05, 0.08); },
    whoosh: () => tone(300, 0.25, 'sawtooth', 0.025, 0, 3),
    boing: () => tone(180, 0.35, 'triangle', 0.08, 0, 2.6),
    win: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.18, 'triangle', 0.07, i * 0.08)),
    fail: () => { tone(300, 0.2, 'sawtooth', 0.04, 0, 0.6); tone(200, 0.3, 'sawtooth', 0.04, 0.15, 0.6); },
    coin: () => { tone(1320, 0.05, 'square', 0.03); tone(1760, 0.08, 'square', 0.03, 0.05); },
    fanfare: () => [523, 659, 784, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.2, 'triangle', 0.07, i * 0.11)),
    low: () => tone(880, 0.05, 'sine', 0.05),
    join: () => { tone(660, 0.08, 'sine', 0.06); tone(990, 0.12, 'sine', 0.06, 0.08); },
    power: () => { tone(400, 0.3, 'sine', 0.06, 0, 3); tone(1200, 0.2, 'triangle', 0.04, 0.2); },
    drum: () => { for (let i = 0; i < 14; i++) tone(90 + (i % 2) * 20, 0.06, 'triangle', 0.06, i * 0.07); },
    ach: () => [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.25, 'sine', 0.06, i * 0.1)),
  };
  const buzz = p => { try { if (navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) navigator.vibrate(p); } catch {} };

  // tiny generative background loop: soft bass + plucked arpeggio (Am–F–C–G)
  const PROG = [[220, 261.63, 329.63], [174.61, 220, 261.63], [261.63, 329.63, 392], [196, 246.94, 293.66]];
  const ARP = [0, 1, 2, 1, 0, 2, 1, 2];
  let musicStep = 0, musicTimer = null;
  function musicTick() {
    if (!state.music || document.hidden) return;
    const bar = Math.floor(musicStep / 8) % 4, s = musicStep % 8, ch = PROG[bar];
    if (s === 0) tone(ch[0] / 2, 0.9, 'sine', 0.03, 0, 0, true);
    if (s !== 3 && s !== 7) tone(ch[ARP[s]] * 2, 0.22, 'triangle', 0.012, 0, 0, true);
    musicStep++;
  }
  function startMusic() { if (!musicTimer) musicTimer = setInterval(musicTick, 210); }
  document.addEventListener('pointerdown', () => { ctx(); startMusic(); }, { once: true });

  // ================= ui helpers =================
  function toast(msg, kind = '') {
    const el = document.createElement('div');
    el.className = `toast ${kind}`; el.textContent = msg;
    $toasts.appendChild(el);
    setTimeout(() => { el.style.transition = 'opacity .3s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 2600);
    if (kind === 'err') { sfx.fail(); buzz(80); }
  }
  function announce(text, tone2 = 'gold') {
    const el = document.createElement('div');
    el.className = `announce ${tone2}`; el.innerHTML = `<span>${esc(text)}</span>`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2300);
    sfx.fanfare(); buzz([40, 30, 40]);
  }
  function modal(html, mount) {
    $modal.innerHTML = `<div class="modal-bg"><div class="modal">${html}</div></div>`;
    const bg = $modal.firstElementChild;
    bg.addEventListener('click', e => { if (e.target === bg || e.target.closest('[data-close]')) closeModal(); });
    mount && mount(bg.firstElementChild);
  }
  const closeModal = () => { $modal.innerHTML = ''; state.editor = null; };
  function confirmBox(text, cb) {
    modal(`<h3>${esc(text)}</h3><div class="row"><button class="btn coral grow" id="cf-ok">${t('yes')}</button><button class="btn ghost grow" data-close>${t('cancel')}</button></div>`,
      m => { m.querySelector('#cf-ok').onclick = () => { closeModal(); cb(); }; });
  }
  function confetti(n = 110) {
    const w = document.createElement('div'); w.className = 'confetti';
    const cols = ['#ffd65c', '#ff7a85', '#4fe0b0', '#5aaeff', '#a883ff', '#ff82c4'];
    for (let i = 0; i < n; i++) {
      const c = document.createElement('i');
      c.style.left = Math.random() * 100 + 'vw'; c.style.background = cols[i % cols.length];
      c.style.animationDuration = 2 + Math.random() * 2.2 + 's'; c.style.animationDelay = Math.random() * 0.6 + 's';
      w.appendChild(c);
    }
    document.body.appendChild(w); setTimeout(() => w.remove(), 5200);
  }
  function burst(g) {
    const total = g ? g.total : 0;
    const items = g ? g.items.map((it, i) => `<span class="chip" style="animation-delay:${0.25 + i * 0.12}s">${t('g_' + it.k)} <b class="${it.v < 0 ? 'neg' : ''}">${it.v > 0 ? '+' : ''}${fmt(it.v)}</b></span>`).join('') : '';
    const el = document.createElement('div'); el.className = 'burst';
    el.innerHTML = `<div class="inner"><div class="big ${total <= 0 ? 'zero' : ''}">${total > 0 ? '+' : ''}${fmt(total)}</div><div class="items">${items}</div></div>`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2700);
    if (total > 0) { sfx.win(); buzz([30, 40, 60]); if (total >= 1000) confetti(70); } else sfx.pop();
  }
  function floater(html) {
    const el = document.createElement('div'); el.className = 'floater';
    el.style.left = 8 + Math.random() * 80 + 'vw';
    el.style.setProperty('--dx', (Math.random() * 60 - 30) + 'px');
    el.innerHTML = html;
    $floaters.appendChild(el); setTimeout(() => el.remove(), 2900);
  }

  // ================= achievements =================
  function unlock(id) {
    if (state.ach.unlocked.includes(id)) return;
    state.ach.unlocked.push(id); store.set('ach', state.ach);
    const e = (ACH.find(a => a[0] === id) || [])[1] || '🏅';
    setTimeout(() => {
      const el = document.createElement('div'); el.className = 'ach-pop';
      el.innerHTML = `<span class="e">${e}</span><div><small>${t('achUnlocked')}</small><b>${esc(t('ach_' + id))}</b></div>`;
      document.body.appendChild(el); setTimeout(() => el.remove(), 3600);
      sfx.ach(); buzz([30, 30, 30]); confetti(40);
    }, 1400);
  }
  function bumpAch(k, n = 1) { state.ach[k] = (state.ach[k] || 0) + n; store.set('ach', state.ach); }
  async function showAchievements() {
    modal(`<div class="center" style="padding:40px"><div class="spinner"></div></div>`);
    if (!state.achList) state.achList = (await api('/api/achievements')).list || [];
    let unlocked = [];
    if (signedIn()) {
      const d = await api('/api/profile/' + encodeURIComponent(state.me.id));
      unlocked = (d.profile && d.profile.achievements) || [];
    }
    const have = new Set(unlocked);
    const list = state.achList.map(({ id, e }) => {
      const ok = have.has(id);
      return `<div class="ach-row ${ok ? 'ok' : ''}"><span class="e">${ok ? e : '🔒'}</span><div class="grow"><b>${t('ach_' + id)}</b><small>${t('achd_' + id)}</small></div>${ok ? '✅' : ''}</div>`;
    }).join('');
    modal(`<h3>🏅 ${t('achievements')} (${fmt(have.size)}/${fmt(state.achList.length)})</h3>
      ${signedIn() ? '' : `<div class="center muted" style="font-size:13px;margin-bottom:10px">${t('guestNote')}</div>`}
      <div class="col" style="gap:8px;max-height:56vh;overflow-y:auto">${list}</div>
      <button class="btn block" data-close style="margin-top:14px">${t('close')}</button>`);
  }

  // ================= socket =================
  // Inside Discord the handshake needs a bearer token that does not exist yet,
  // so the socket waits rather than connecting once anonymously and then
  // reconnecting — that second handshake was pure latency on the way in.
  const socket = io({ transports: ['websocket', 'polling'], autoConnect: !IN_DISCORD });
  const emit = (ev, data) => new Promise(res => socket.emit(ev, data, r => { if (r && r.error) toast(t('err_' + r.error), 'err'); res(r || {}); }));
  socket.on('connect', () => { if (state.code && state.route.name === 'room') join(state.code, true); });
  socket.on('disconnect', () => { if (state.code) toast(t('reconnecting'), 'err'); });
  socket.on('room', snap => {
    const prev = state.room;
    state.clockOffset = snap.now - Date.now();
    state.room = snap;
    const changed = !prev || prev.phase !== snap.phase || prev.round !== snap.round || (snap.current && prev.current && snap.current.idx !== prev.current.idx);
    if (changed) onPhase(prev, snap);
    else if (prev && prev.current && snap.current) {
      const added = snap.current.doubled.filter(id => !prev.current.doubled.includes(id) && id !== myId());
      added.forEach(id => { const p = P(id); if (p) { toast(t('doubledBy', { n: p.name })); sfx.power(); } });
    }
    render();
  });
  socket.on('joined', ({ id }) => { if (id !== myId()) sfx.join(); });
  socket.on('react', r => { const p = P(r.pid); bubbleOn(r.pid, r.e); floater(`<span class="e">${esc(r.e)}</span>${p ? `<span class="n">${esc(p.name)}</span>` : ''}`); if (r.pid !== myId()) tone(900 + Math.random() * 400, 0.05, 'sine', 0.03); });
  socket.on('typing', pid => {
    const el = $app.querySelector(`.mini[data-pid="${CSS.escape(pid)}"]`);
    if (!el) return;
    el.classList.add('typing');
    clearTimeout(el._tt); el._tt = setTimeout(() => el.classList.remove('typing'), 1800);
  });
  socket.on('poke', ({ from, to }) => {
    const el = $app.querySelector(`.pcard[data-pid="${CSS.escape(to)}"]`);
    if (el) { el.classList.remove('poked'); void el.offsetWidth; el.classList.add('poked'); }
    const f = P(from);
    tone(500, 0.12, 'triangle', 0.05, 0, 1.8);
    if (to === myId() && f) { toast(t('pokedYou', { n: f.name })); buzz([60, 40, 60]); sfx.boing(); }
  });
  socket.on('say', ({ pid, i }) => {
    const text = STR[state.lang].phrases[i];
    if (!text) return;
    bubbleOn(pid, text, true);
    const pl = P(pid);
    floater(`<span class="say-f">${esc(text)}</span>${pl ? `<span class="n">${esc(pl.name)}</span>` : ''}`);
    if (pid !== myId()) tone(700, 0.08, 'triangle', 0.04);
  });
  socket.on('balloon', ({ size, by }) => {
    if (state.room) state.room.balloon.size = size;
    setBalloon(size, true);
    if (by !== myId()) tone(300 + size * 14, 0.05, 'sine', 0.03);
  });
  socket.on('pop', ({ by, pops }) => {
    if (!state.room) return;
    state.room.balloon = { size: 0, pops };
    const pl = P(by);
    const el = document.getElementById('balloon');
    if (el) { const r = el.getBoundingClientRect(); sparks(r.left + r.width / 2, r.top + r.height / 2); sparks(r.left + r.width / 2, r.top + r.height / 3, '#ff7a85'); }
    tone(120, 0.3, 'sawtooth', 0.1, 0, 0.3); tone(900, 0.15, 'square', 0.05, 0.05, 0.4);
    confetti(by === myId() ? 90 : 40); buzz([60, 30, 60]);
    if (pl) toast(t('popped', { n: pl.name }), by === myId() ? 'ok' : '');
    state.lastKey = ''; render();
  });
  socket.on('laughs', counts => {
    if (!state.room || !state.room.current) return;
    state.room.current.laughs = counts;
    $app.querySelectorAll('.laugh[data-id]').forEach(b => { b.querySelector('b').textContent = fmt(counts[b.dataset.id] || 0); });
    tone(1000 + Math.random() * 300, 0.05, 'triangle', 0.03);
  });
  socket.on('achievements', ids => ids.forEach((id, i) => later(1400 + i * 1200, () => {
    const found = (state.achList || []).find(a => a.id === id);
    const el = document.createElement('div');
    el.className = 'ach-pop';
    el.innerHTML = `<span class="e">${found ? found.e : '🏅'}</span><div><small>${t('achUnlocked')}</small><b>${esc(t('ach_' + id))}</b></div>`;
    document.body.appendChild(el); setTimeout(() => el.remove(), 3600);
    sfx.ach(); buzz([30, 30, 30]); confetti(40);
  })));
  socket.on('kicked', () => { forget(state.code); state.room = null; state.code = null; toast(t('kicked'), 'err'); navigate('/'); });

  function onPhase(prev, s) {
    state.phaseTotal = s.deadline ? Math.max(1000, s.deadline - s.now) : 1;
    if (s.phase === 'write') state.draft.lie = '';
    if (s.phase === 'guess') state.draft.guess = '';
    if (s.phase === 'vote') state.bet = 1;
    if (s.phase === 'spyClue') state.draft.spyClue = '';
    if (s.phase === 'spyVote') state.draft.spyGuess = '';
    const m = s.players.find(p => p.id === myId());
    if (s.phase === 'scores' && prev && m) {
      const old = prev.players.find(p => p.id === m.id);
      if (m.streak >= 5 && (!old || old.streak < m.streak)) later(2900, () => announce(t('ann_unstoppable'), 'fire'));
      else if (m.streak >= 3 && (!old || old.streak < m.streak)) later(2900, () => announce(t('ann_combo', { n: m.streak }), 'fire'));
      else if (m.streak === 2 && (!old || old.streak < 2)) later(2900, () => toast(t('streakToast', { n: 2 }), 'ok'));
      if (m.streak >= 4) unlock('streak4');
    }
  }

  function forget(code) { if (code) { delete state.tokens[code]; store.set('tokens', state.tokens); } }

  async function join(code, silent) {
    if (state.joining) return;
    state.joining = true; render();
    const r = await new Promise(res => socket.emit('join', { code, token: state.tokens[code], name: state.profile.name, avatar: state.profile.avatar }, res));
    state.joining = false;
    if (!r || r.error) {
      forget(code);
      if (r && r.error) toast(t('err_' + r.error), 'err');
      if (!silent || (r && r.error === 'noroom')) { state.room = null; state.code = null; navigate('/'); }
      else render();
      return;
    }
    state.tokens[code] = r.token; store.set('tokens', state.tokens);
    state.code = code;
    render();
  }

  function leaveRoom() {
    socket.emit('leave');
    state.room = null; state.code = null;
    navigate('/');
  }

  // ================= routing =================
  function parseRoute() {
    const m = location.pathname.match(/^\/room\/([A-Za-z]{4,5})/);
    if (m) return { name: 'room', code: m[1].toUpperCase() };
    const g = location.pathname.match(/^\/match\/([0-9a-f-]{36})/i);
    return g ? { name: 'match', id: g[1] } : { name: 'home' };
  }
  function navigate(path) { history.pushState(null, '', path); onRoute(); }
  window.addEventListener('popstate', onRoute);
  function onRoute() {
    const prev = state.route;
    state.route = parseRoute();
    closeModal();
    if (prev.name === 'room' && state.code && (state.route.name !== 'room' || state.route.code !== state.code)) {
      socket.emit('leave'); state.room = null; state.code = null;
    }
    if (state.route.name === 'room' && state.code !== state.route.code && state.tokens[state.route.code] && state.profile.name) join(state.route.code, false);
    render();
    // A shared /match/<id> link lands on the home screen with the scoreboard
    // on top of it, so closing it leaves the visitor somewhere they can play.
    if (state.route.name === 'match') openMatch(state.route.id, true);
  }

  // ================= render =================
  const STATIC = new Set(['spin', 'bluffReveal', 'numReveal', 'blitzResult', 'emojiResult', 'oddResult', 'orderResult', 'likelyReveal', 'spyReveal', 'scores', 'final']);
  function screenKey() {
    const r = state.route, s = state.room;
    if (r.name === 'room' && s && state.code === r.code) return `room:${s.phase}:${s.gameNo}:${s.round}:${s.current && s.current.idx != null ? s.current.idx : ''}`;
    if (r.name === 'room') return state.joining || (state.tokens[r.code] && state.profile.name) ? 'loading' : 'enter';
    // An Activity is always on its way into the channel's room, so the home
    // screen is a place the player never goes. Showing it while the handshake
    // runs is a flicker of the wrong game. If the handshake fails we fall
    // through to home, which at least has something to press.
    if (state.inDiscord && !state.discordDone) return 'loading';
    return 'home';
  }

  function render() {
    applyDir();
    const rs = state.room;
    document.body.dataset.tint = rs && state.route.name === 'room' && rs.current && !['lobby', 'final'].includes(rs.phase) && !(rs.phase === 'spin') ? rs.current.type : '';
    const key = screenKey();
    const same = key === state.lastKey;
    const phase = state.room && state.room.phase;
    if (same && key.startsWith('room:') && STATIC.has(phase)) { renderReactBar(); return; }

    const f = document.activeElement, fid = f && f.id;
    const sel = fid && f.selectionStart != null ? [f.selectionStart, f.selectionEnd] : null;
    const scrolls = {}; $app.querySelectorAll('[data-scroll]').forEach(el => { scrolls[el.dataset.scroll] = el.scrollTop; });

    if (!same) { state.timeouts.forEach(clearTimeout); state.timeouts = []; }
    $app.classList.toggle('no-anim', same);
    $app.innerHTML = view(key);
    state.lastKey = key;

    if (same) $app.querySelectorAll('[data-scroll]').forEach(el => { if (scrolls[el.dataset.scroll] != null) el.scrollTop = scrolls[el.dataset.scroll]; });
    if (fid) { const el = document.getElementById(fid); if (el) { el.focus({ preventScroll: true }); if (sel) try { el.setSelectionRange(sel[0], sel[1]); } catch {} } }
    else if (!same) { const af = $app.querySelector('[data-autofocus]'); if (af && matchMedia('(pointer:fine)').matches) af.focus(); }
    if (!same) mountHooks();
    renderReactBar();
    tick();
    requestAnimationFrame(lookAll);
  }

  function view(key) {
    if (key === 'home') return homeView();
    if (key === 'loading') return `<div class="screen"><div class="center-msg"><div>
      ${state.inDiscord ? `<div class="logo sm" style="margin-bottom:18px">MAQLAB<small>مقلب</small></div>` : ''}
      <div class="spinner"></div><b>${t('loading')}</b>
    </div></div></div>`;
    if (key === 'enter') return enterView();
    const views = {
      lobby: lobbyView, spin: spinView, write: writeView, vote: voteView, bluffReveal: bluffRevealView, guess: guessView, numReveal: numRevealView,
      blitz: blitzView, blitzResult: blitzResultView, likelyVote: likelyVoteView, likelyReveal: likelyRevealView, emoji: emojiView, emojiResult: emojiResultView, odd: oddView, oddResult: oddResultView, order: orderView, orderResult: orderResultView,
      spyClue: spyClueView, spyVote: spyVoteView, spyReveal: spyRevealView,
      scores: scoresView, final: finalView,
    };
    return (views[state.room.phase] || (() => ''))();
  }

  // ---------- shared pieces ----------
  const menuBtn = `<button class="icon-btn" data-act="menu" aria-label="menu">☰</button>`;
  function levelPill() {
    const L = levelInfo(state.xp);
    return `<div class="level-pill"><span class="lv">${L.level}</span><span>${t('level')}</span><span class="bar"><i style="width:${(L.into / L.need) * 100}%"></i></span></div>`;
  }
  function meCard() {
    if (!signedIn()) {
      // Until the server answers we show the shape of the card, not a claim
      // about who you are.
      if (!state.meKnown) return `<div class="me-card skeleton"><div class="av"></div><div class="who-name"><i></i><i class="wide"></i></div></div>`;
      // A top-level redirect to discord.com cannot happen inside the Activity
      // iframe — Discord blocks it and the player just gets a white page. In
      // there, signing in is the Activity's own job, so we say so instead of
      // offering a button that goes nowhere.
      // While the bootstrap is still running, name the stage it is on. Once it
      // has given up, say so — a player left on "signing you in…" forever has
      // no way to tell a dead Activity from a slow one, which is exactly how
      // this looked the last time it broke. A sign-in button cannot help in
      // here (Discord blocks the top-level redirect), so the honest offer is
      // to start the Activity over.
      if (state.inDiscord && !state.discordDone) {
        return `<div class="center muted" style="font-size:14px">${t('discordSignInBusy')}${state.discordStage ? ` <b>${esc(state.discordStage)}</b>` : ''}</div>`;
      }
      if (state.inDiscord) return `<div class="col" style="gap:10px">
        <div class="center muted" style="font-size:14px">${t('discordFailed', { e: state.discordError || '—' })}</div>
        <button class="btn lilac block" data-act="retry">↻ ${t('tryAgain')}</button>
      </div>`;
      return `<div class="col" style="gap:10px">
        <div class="center muted" style="font-size:14px">${t('signInToPlay')}</div>
        <button class="btn lilac block" data-act="signin">💬 ${t('signIn')}</button>
      </div>`;
    }
    return `<div class="me-card">
      <button class="av" data-act="edit" aria-label="${t('editAvatar')}" style="border:none">${J(state.profile.avatar)}<span class="edit">✏️</span></button>
      <div class="who-name"><small>${t('signedInAs')}</small><b>${esc(state.me.name)}</b></div>
    </div>`;
  }
  function timerRing() {
    const s = state.room;
    if (!s.deadline || !['write', 'vote', 'guess', 'blitz', 'likelyVote', 'emoji', 'odd', 'order', 'spyClue', 'spyVote'].includes(s.phase)) return '<div style="width:48px"></div>';
    return `<div class="timer" data-deadline="${s.deadline}"><svg viewBox="0 0 48 48"><circle class="track" cx="24" cy="24" r="20"/><circle class="prog" cx="24" cy="24" r="20" stroke-dasharray="125.66" stroke-dashoffset="0"/></svg><span>0</span></div>`;
  }
  function gameTop() {
    const s = state.room, m = s.current ? s.current.mod : 'normal';
    const modChip = m && m !== 'normal' ? `<span class="mod ${m}">${MODS[m]} ${t('mod_' + m)}</span>` : '';
    const mp = me();
    const rank = mp ? [...s.players].sort((a, b) => b.score - a.score).findIndex(p => p.id === mp.id) + 1 : 0;
    const scoreChip = mp ? `<div class="my-score">⭐ <b>${fmt(mp.score)}</b><span>#${fmt(rank)}</span>${mp.streak >= 2 ? `<span class="fire">🔥${mp.streak}</span>` : ''}</div>` : '';
    return `<div class="topbar">${menuBtn}<div class="mid"><div class="mid-stack"><div class="round-pill">${t('round')} ${s.round}/${s.settings.rounds}${modChip}</div>${scoreChip}</div></div>${timerRing()}</div>`;
  }
  function leaderId() {
    const ps = state.room.players.filter(p => p.connected);
    const top = ps.reduce((a, b) => (b.score > (a ? a.score : -1) ? b : a), null);
    return top && top.score > 0 ? top.id : null;
  }
  function whoRow(doneIds, resultMap) {
    const done = new Set(doneIds || []);
    const lead = leaderId();
    const dbl = new Set((state.room.current && state.room.current.doubled) || []);
    return `<div class="who-row">${state.room.players.filter(p => p.connected).map(p => {
      let badge = '';
      if (resultMap) { const r = resultMap[p.id]; badge = `<span class="ok" style="background:${r ? (r.correct ? 'var(--mint)' : 'var(--coral)') : 'var(--muted)'}">${r ? (r.correct ? '✓' : '✗') : '–'}</span>`; }
      else if (done.has(p.id)) badge = '<span class="ok">✓</span>';
      const on = resultMap ? (resultMap[p.id] && resultMap[p.id].correct) : done.has(p.id);
      return `<div class="mini ${on ? 'done' : 'wait'} ${p.team ? 'team-' + p.team : ''}" data-pid="${esc(p.id)}">${p.id === lead ? '<span class="lead">👑</span>' : ''}${dbl.has(p.id) ? '<span class="dbl">💎</span>' : ''}<span class="typing-b">✍️</span>${J(p.avatar)}${badge}<span class="nm">${esc(p.name)}</span></div>`;
    }).join('')}</div>`;
  }
  function qCard(type, text, sub = '') {
    return `<div class="q-card glass"><span class="type-tag ${type}">${TYPES[type]} ${t('type_' + type)}</span><h1>${esc(text)}</h1>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;
  }
  function powerBar() {
    const s = state.room, c = s.current, m = me();
    if (!m || !m.powers) return '';
    const doubled = c.doubled.includes(m.id);
    const peekable = (s.phase === 'vote' && !c.myVote) || ((s.phase === 'emoji' || s.phase === 'odd') && c.myAnswer == null);
    const peekUsedNow = c.options && c.options.some(o => o.hidden);
    return `<div class="powers">
      <button class="pw peek" data-act="power" data-k="peek" ${!m.powers.peek || !peekable || peekUsedNow ? 'disabled' : ''}><span class="e">🔍</span><b>${t('power_peek')}</b><i>×${m.powers.peek}</i></button>
      <button class="pw double ${doubled ? 'on' : ''}" data-act="power" data-k="double" ${!m.powers.double || doubled ? 'disabled' : ''}><span class="e">💎</span><b>${doubled ? t('powerOn') : t('power_double')}</b>${doubled ? '' : `<i>×${m.powers.double}</i>`}</button>
    </div>`;
  }
  // Half the fun of a reveal is 'what does that even look like'. Opens the
  // answer in an image search rather than trying to ship pictures ourselves.
  const imgSearch = term => term
    ? `<a class="img-search" href="https://www.google.com/search?tbm=isch&q=${encodeURIComponent(term)}" target="_blank" rel="noopener noreferrer" title="${t('seeImages')}">🔍 ${t('seeImages')}</a>`
    : '';
  const dock = inner => `<div class="dock"><div class="wrap">${inner}</div></div>`;
  // Reveal/score screens auto-advance on a server timer. Show that countdown so
  // it never looks frozen, and let the host jump ahead early.
  function hostNext() {
    const dl = state.room.deadline || 0;
    const cd = dl ? `<span class="cd" data-count="${dl}"></span>` : '';
    return dock(isHost()
      ? `<button class="btn ghost block" data-act="next">${t('next')}${cd}</button>`
      : `<div class="center muted" style="font-size:13px">${t('nextIn')}${cd}</div>`);
  }
  const quickDots = (c, final) => `<div class="blitz-dots">${Array.from({ length: c.total }, (_, i) => `<i class="${i < c.idx || (final && i === c.idx) ? 'done' : i === c.idx ? 'on' : ''}"></i>`).join('')}</div>`;

  // ---------- home ----------
  function homeView() {
    return `<div class="screen"><div class="scroll" data-scroll="home">
      <div class="home-top">${levelPill()}<div class="row">
        <button class="icon-btn" data-act="music" aria-label="${t('music')}">${state.music ? '🎵' : '<span style="opacity:.4">🎵</span>'}</button>
        <button class="icon-btn" data-act="sound" aria-label="${t('sound')}">${state.sound ? '🔊' : '🔇'}</button>
        <button class="icon-btn" data-act="lang" style="font-weight:800;font-size:14px">${state.lang === 'ar' ? 'EN' : 'ع'}</button></div></div>
      <div class="wrap">
        <div class="hero">
          <div class="mascots">${J({ s: 2, c: 4, e: 1, m: 1, h: 10 })}${J({ s: 0, c: 0, e: 2, m: 3, h: 1 })}${J({ s: 3, c: 8, e: 4, m: 7, h: 2 })}</div>
          <div class="logo">MAQLAB<small>مقلب</small></div>
          <div class="tagline">${t('tagline')}</div>
          <div class="mode-strip">${Object.keys(TYPES).map((k, i) => `<span class="chip" style="animation-delay:${i * 0.08}s">${TYPES[k]} ${t('type_' + k)}</span>`).join('')}</div>
        </div>
        <div class="glass col" style="padding:16px;margin-top:10px">
          ${meCard()}
          ${signedIn() ? `<button class="btn block" data-act="create">${t('create')}</button>
          <div class="divider">${t('or')}</div>
          <div class="join-row">
            <input id="code" class="input code" maxlength="5" placeholder="ABCDE" value="${esc(state.draft.code)}" autocomplete="off" autocapitalize="characters" spellcheck="false">
            <button class="btn sky" data-act="join-code">${t('join')}</button>
          </div>` : ''}
        </div>
        ${accountBar()}
        ${lobbyList()}
        <div class="links">
          <button data-act="how">❓ ${t('how')}</button>
          <button data-act="edit">🎨 ${t('editAvatar')}</button>
          <button data-act="achievements">🏅 ${t('achievements')}</button>
          <button data-act="leaderboard">🏆 ${t('leaderboard')}</button>
          <button data-act="suggest">💡 ${t('suggestBtn')}</button>
          <button data-act="about">ℹ️ ${t('about')}</button>
        </div>
      </div>
    </div></div>`;
  }

  function enterView() {
    return `<div class="screen"><div class="topbar"><button class="icon-btn" data-act="home">${state.lang === 'ar' ? '→' : '←'}</button><div class="mid"><span class="chip">${t('room')} <b style="letter-spacing:3px;direction:ltr">${esc(state.route.code)}</b></span></div><div style="width:44px"></div></div>
      <div class="scroll"><div class="wrap">
        <div class="hero"><div class="logo sm">${t('appName')}</div><div class="tagline">${t('tagline')}</div></div>
        <div class="glass col" style="padding:16px">${meCard()}<button class="btn block" data-act="enter">${t('enterRoom')} 🚪</button></div>
      </div></div></div>`;
  }

  // ---------- lobby ----------
  function lobbyView() {
    const s = state.room, st = s.settings, host = isHost(), mid = myId();
    const online = s.players.filter(p => p.connected);
    const dis = host ? '' : 'disabled';
    const seg = (key, vals, lab) => `<div class="seg">${vals.map(v => `<button class="${st[key] === v ? 'on' : ''}" data-act="set" data-k="${key}" data-v="${v}" ${dis}>${lab(v)}</button>`).join('')}</div>`;
    const players = online.map(p => `
      <div class="pcard ${p.id === mid ? 'me' : ''} ${p.bot ? 'is-bot' : ''} ${p.team ? 'team-' + p.team : ''}" data-pid="${esc(p.id)}" ${p.id !== mid && !p.bot ? `data-act="poke" data-id="${esc(p.id)}"` : ''}>
        ${p.id === s.hostId ? '<span class="crown">👑</span>' : ''}${p.bot ? '<span class="bot-tag">🤖</span>' : ''}${host && p.id !== mid ? (p.bot
          ? `<span class="kick-x" data-act="unbot" data-id="${esc(p.id)}">✕</span>`
          : `<span class="kick-x" data-act="kick" data-id="${esc(p.id)}">✕</span><span class="crown-give" data-act="makehost" data-id="${esc(p.id)}" title="${t('makeHost')}">👑</span>`) : ''}${p.ready && !p.bot ? '<span class="rdy">✅</span>' : ''}${J(p.avatar)}<span class="nm" ${p.userId ? `data-act="profile" data-uid="${esc(p.userId)}"` : ''}>${esc(p.name)}</span>
      </div>`).join('');
    const invite = online.length < 12 ? `<div class="pcard empty" data-act="copy">＋<span style="font-size:12px;font-weight:700">${t('invite')}</span></div>` : '';
    // Alone, two of the six round types cannot run at all. Starting solo fills
    // the table automatically, but the button is here for anyone who wants
    // another player without waiting for one.
    const addBot = host && online.length < 12 ? `<div class="pcard empty" data-act="addbot">🤖<span style="font-size:12px;font-weight:700">${t('addBot')}</span></div>` : '';
    return `<div class="screen">
      <div class="topbar">${menuBtn}<div class="mid"><div class="logo sm">${t('appName')}</div></div><div style="width:44px"></div></div>
      <div class="scroll" data-scroll="lobby"><div class="wrap" style="padding-bottom:20px">
        <div class="glass code-card">
          <div class="label">${t('roomCode')}</div>
          <div class="code" data-act="copy-code">${esc(s.code)}</div>
          <div class="actions">
            <button class="btn sm ghost" data-act="copy">🔗 ${t('copyLink')}</button>
            ${navigator.share ? `<button class="btn sm ghost" data-act="share">📤 ${t('share')}</button>` : ''}
            <button class="btn sm ghost" data-act="qr">▦ QR</button>
          </div>
          ${state.showQR ? `<div class="qr-box"><img alt="QR" src="/api/qr?text=${encodeURIComponent(location.origin + '/room/' + s.code)}"></div>` : ''}
        </div>
        <div class="section-title"><span>${t('players')}</span><span class="chip">${online.length}/12</span></div>
        ${st.teams ? teamColumns(online, mid) : `<div class="players">${players}${invite}${addBot}</div>`}
        ${online.filter(p => !p.bot).length > 1 ? `<div class="center muted" style="font-size:12px;margin-top:8px">${t('pokeHint')}</div>` : ''}
        ${online.length === 1 && host ? `<div class="center muted" style="font-size:12px;margin-top:8px">${t('soloHint')}</div>` : ''}
        ${balloonCard()}
        <div class="section-title"><span>${t('settings')}</span>${host ? '' : '<span class="chip">🔒</span>'}</div>
        <div class="glass settings">
          <div class="set-row"><div class="lbl">${t('qLang')}</div>${seg('lang', ['en', 'ar'], v => v === 'ar' ? 'العربية' : 'English')}</div>
          <div class="set-row"><div class="lbl">${t('rounds')}</div>${seg('rounds', [3, 5, 8, 12], v => v)}</div>
          <div class="set-row"><div class="lbl">${t('types')}</div><div class="types">
            ${Object.keys(TYPES).map(k => `<button class="type-tog ${st.types[k] ? 'on' : ''}" data-act="type" data-k="${k}" ${dis}><span class="e">${TYPES[k]}</span>${t('type_' + k)}</button>`).join('')}
          </div></div>
          <div class="set-row"><div class="lbl">${t('pace')}</div>${seg('pace', ['chill', 'normal', 'fast'], v => t(v))}</div>
          <div class="set-row"><div class="lbl">${t('teams')}</div><div class="seg">${[false, true].map(v => `<button class="${st.teams === v ? 'on' : ''}" data-act="teams" data-v="${v}" ${dis}>${v ? t('teamsOn') : t('teamsOff')}</button>`).join('')}</div></div>
          <div class="set-row"><div class="lbl">${t('publicRoom')}</div><div class="seg">${[true, false].map(v => `<button class="${st.public === v ? 'on' : ''}" data-act="public" data-v="${v}" ${dis}>${v ? t('roomPublic') : t('roomPrivate')}</button>`).join('')}</div></div>
        </div>
      </div></div>
      ${dock(host
        ? `${online.length < 2 ? `<div class="center muted" style="font-size:13px;margin-bottom:8px">${t('soloHint')}</div>` : `<div class="center muted" style="font-size:13px;margin-bottom:8px">${t('readyN', { n: fmt(online.filter(p => p.ready || p.id === mid).length), m: fmt(online.length) })}</div>`}<button class="btn block pulse" data-act="start" style="min-height:60px;font-size:19px">${t('start')}</button>`
        : `<div class="row"><button class="btn ${me() && me().ready ? 'mint' : 'ghost'} grow" data-act="ready">${me() && me().ready ? t('ready') : t('notReady')}</button></div><div class="center muted" style="margin-top:8px;font-size:13px"><span class="dots">${t('waitHost')}</span></div>`)}
    </div>`;
  }

  function teamColumns(online, mid) {
    const col = team => {
      const ps = online.filter(p => p.team === team);
      const mine = me() && me().team === team;
      return `<div class="team-col team-${team}">
        <div class="team-head"><b>${t('team_' + team)}</b><span class="chip">${fmt(ps.length)}</span></div>
        <div class="team-list">${ps.map(p => `<div class="pcard team-${team} ${p.id === mid ? 'me' : ''}" data-pid="${esc(p.id)}" ${p.id !== mid ? `data-act="poke" data-id="${esc(p.id)}"` : ''}>${p.id === state.room.hostId ? '<span class="crown">👑</span>' : ''}${p.ready ? '<span class="rdy">✅</span>' : ''}${isHost() && p.id !== mid ? `<span class="kick-x" data-act="kick" data-id="${esc(p.id)}">✕</span>` : ''}${J(p.avatar)}<span class="nm">${esc(p.name)}</span></div>`).join('')}</div>
        ${mine ? '' : `<button class="btn sm ${team === 'A' ? 'coral' : 'sky'} block" data-act="team" data-t="${team}">${t('joinTeam')} ${t('team_' + team)}</button>`}
      </div>`;
    };
    return `<div class="teams-wrap">${col('A')}<div class="vs">VS</div>${col('B')}</div>`;
  }

  function balloonCard() {
    const b = state.room.balloon || { size: 0, pops: {} };
    const king = Object.entries(b.pops || {}).sort((a, c) => c[1] - a[1])[0];
    const kp = king && P(king[0]);
    return `<div class="section-title"><span>${t('balloonTitle')}</span></div>
      <div class="glass balloon-card">
        <button class="balloon-btn" data-act="pump" aria-label="balloon"><svg id="balloon" viewBox="0 0 100 130" style="transform:scale(${balloonScale(b.size)})">
          <defs><radialGradient id="bg1" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#ffc1c6"/><stop offset=".6" stop-color="#ff7a85"/><stop offset="1" stop-color="#c94f5c"/></radialGradient></defs>
          <path d="M50 118 Q46 124 52 130" stroke="#ddd" stroke-width="1.5" fill="none"/>
          <ellipse cx="50" cy="55" rx="38" ry="46" fill="url(#bg1)"/><path d="M45 100 L55 100 L50 108 Z" fill="#c94f5c"/>
          <ellipse cx="36" cy="36" rx="9" ry="14" fill="#fff" opacity=".35" transform="rotate(-25 36 36)"/>
        </svg></button>
        <div class="muted center" style="font-size:12px">${t('balloonHint')}</div>
        ${kp ? `<div class="center" style="margin-top:6px"><span class="chip">${t('balloonKing', { n: esc(kp.name), c: fmt(king[1]) })}</span></div>` : ''}
      </div>`;
  }
  const balloonScale = size => (0.55 + Math.min(size, 45) * 0.022).toFixed(3);
  function setBalloon(size, wobble) {
    const el = document.getElementById('balloon');
    if (!el) return;
    el.style.transform = `scale(${balloonScale(size)})`;
    if (wobble) { el.classList.remove('wob'); void el.getBoundingClientRect(); el.classList.add('wob'); }
  }
  function teamBars() {
    const ts = state.room.teamScores;
    if (!ts) return '';
    const max = Math.max(1, ts.A, ts.B);
    return `<div class="team-bars">${['A', 'B'].map(k => `<div class="tb team-${k}"><div class="tb-top"><b>${t('team_' + k)}</b><span>${fmt(ts[k])}</span></div><div class="tb-bar"><i style="width:${(ts[k] / max) * 100}%"></i></div></div>`).join('')}</div>`;
  }

  // ---------- spin ----------
  function spinView() {
    const c = state.room.current;
    return `<div class="screen">${gameTop()}
      <div class="spin-stage">
        <div class="spin-title">${t('spinning')}</div>
        <div class="slot ${c.mod === 'golden' ? 'golden-glow' : ''}"><div class="reel" id="reel1"><div class="strip"></div></div><div class="reel" id="reel2"><div class="strip"></div></div></div>
        <div class="spin-result" id="spin-result"></div>
      </div></div>`;
  }
  function mountSpin() {
    const c = state.room.current;
    const types = Object.keys(TYPES), mods = ['normal', 'double', 'speed', 'jackpot', 'golden'];
    const build = (el, list, target, labelFn, emojiMap, dur) => {
      const n = 16;
      const seq = Array.from({ length: n - 1 }, (_, i) => list[(i + Math.floor(Math.random() * list.length)) % list.length]).concat(target);
      const strip = el.querySelector('.strip');
      strip.innerHTML = seq.map(k => `<div class="cell"><span class="e">${emojiMap[k]}</span><span class="t">${labelFn(k)}</span></div>`).join('');
      strip.style.transform = 'translateY(0)';
      requestAnimationFrame(() => requestAnimationFrame(() => {
        strip.style.transition = `transform ${dur}ms cubic-bezier(.12,.72,.1,1)`;
        strip.style.transform = `translateY(-${(n - 1) * 150}px)`;
      }));
    };
    build(document.getElementById('reel1'), types, c.type, k => t('type_' + k), TYPES, 2300);
    build(document.getElementById('reel2'), mods, c.mod, k => t('mod_' + k), MODS, 3000);
    let dt = 45, acc = 0;
    while (acc < 2900) { later(acc, sfx.tick); dt *= 1.14; acc += dt; }
    later(2350, () => { sfx.pop(); buzz(20); });
    later(3050, () => {
      const el = document.getElementById('spin-result');
      if (!el) return;
      el.innerHTML = `<div class="land"><h2>${TYPES[c.type]} ${t('type_' + c.type)}</h2><p>${t('desc_' + c.type)}</p>
        ${c.mod !== 'normal' ? `<div class="chip" style="margin-top:10px;background:${c.mod === 'golden' ? 'linear-gradient(90deg,#ffe27a,#ffb347)' : 'var(--lemon)'};color:var(--ink)">${MODS[c.mod]} ${t('mdesc_' + c.mod)}</div>` : ''}</div>`;
      if (c.mod === 'golden') { announce(t('ann_golden')); confetti(60); } else if (c.mod !== 'normal') sfx.win(); else sfx.ding();
      buzz(40);
    });
    // 3… 2… 1… GO! while the server finishes the spin phase
    const left = Math.max(0, state.room.deadline - now());
    const start = Math.max(3500, left - 2600);
    ['3', '2', '1', state.lang === 'ar' ? 'يلا!' : 'GO!'].forEach((txt, i) => later(start + i * 650, () => countdown(txt, i === 3)));
  }
  function countdown(txt, go) {
    document.querySelector('.countdown')?.remove();
    const el = document.createElement('div');
    el.className = `countdown ${go ? 'go' : ''}`; el.innerHTML = `<span>${txt}</span>`;
    document.body.appendChild(el); setTimeout(() => el.remove(), 700);
    if (go) { tone(784, 0.18, 'square', 0.05); tone(1175, 0.3, 'square', 0.05, 0.08); buzz(60); }
    else { tone(523, 0.12, 'square', 0.05); buzz(25); }
  }

  // ---------- bluff ----------
  function writeView() {
    const c = state.room.current;
    return `<div class="screen">${gameTop()}<div class="stage"><div class="scroll" data-scroll="w"><div class="wrap">
      ${qCard('bluff', c.question, t('lieHint'))}
      ${whoRow(c.submitted)}
      <div class="answer-box">
        ${c.myLie
          ? `<div class="my-answer"><small>${t('yourLie')}</small>${esc(c.myLie)}</div><div class="center muted"><span class="dots">${t('waitOthers')}</span></div>`
          : `<form data-form="lie" class="col"><input id="lie" class="input" maxlength="50" placeholder="${t('writeLie')}" value="${esc(state.draft.lie)}" autocomplete="off" data-autofocus><button class="btn coral block" type="submit">${t('send')}</button></form>`}
      </div>
      ${powerBar()}
    </div></div></div></div>`;
  }

  function voteView() {
    const c = state.room.current;
    const voted = c.myVote;
    const bets = [1, 2, 3].map(b => `<button class="bet b${b} ${(voted ? voted.bet : state.bet) === b ? 'on' : ''}" data-act="bet" data-b="${b}" ${voted ? 'disabled' : ''}><span class="coins">${'🪙'.repeat(b)}</span><b>×${b}</b><span>${t('bet' + b)}</span></button>`).join('');
    return `<div class="screen">${gameTop()}<div class="stage"><div class="scroll" data-scroll="v"><div class="wrap">
      ${qCard('bluff', c.question)}
      <div class="center" style="font-weight:800;margin-top:16px">${voted ? t('voted') : t('pickTruth')}</div>
      <div class="bets">${bets}</div>
      <div class="center muted" style="font-size:12px;margin-top:6px">${t('betInfo')}</div>
      <div class="options">${c.options.map((o, i) => `
        <button class="opt ${o.mine ? 'mine' : ''} ${o.hidden ? 'gone' : ''} ${voted && voted.id === o.id ? 'picked' : ''}" style="animation-delay:${i * 70}ms" data-act="vote" data-id="${o.id}" ${o.mine || o.hidden || voted ? 'disabled' : ''}>
          ${o.mine ? `<span class="tag">${t('yours')}</span>` : ''}${o.hidden ? '<span class="tag">🔍</span>' : ''}${voted && voted.id === o.id ? `<span class="betb">×${voted.bet}</span>` : ''}${esc(o.text)}
        </button>`).join('')}</div>
      ${powerBar()}
      ${voted ? `<div class="center muted" style="margin-top:14px"><span class="dots">${t('waitOthers')}</span></div>${whoRow(c.voted)}` : ''}
    </div></div></div></div>`;
  }

  function bluffRevealView() {
    const c = state.room.current;
    const lies = c.options.filter(o => !o.truth).sort((a, b) => a.voters.length - b.voters.length);
    const truth = c.options.find(o => o.truth);
    const STEP = 2.4;
    const voterList = (vs, d) => vs.map((v, j) => { const p = P(v.id); return p ? `<span class="v" style="animation-delay:${d + 0.5 + j * 0.12}s">${J(p.avatar)}${v.bet > 1 ? `<span class="bb">×${v.bet}</span>` : ''}</span>` : ''; }).join('');
    const names = ids => ids.map(id => esc(P(id)?.name || '?')).join(' & ');
    const cards = lies.map((o, i) => {
      const d = i * STEP;
      const stamp = o.authors.length ? `<span class="stamp lie" style="animation-delay:${d + 1.1}s">${t('lieBy', { n: names(o.authors) })}</span>` : `<span class="stamp house" style="animation-delay:${d + 1.1}s">${t('houseLie')}</span>`;
      const gl = o.voters.length && o.authors.length ? `<div class="gainline" style="animation-delay:${d + 1.5}s">${t('fooledN', { n: fmt(o.voters.length) })} +${fmt(300 * o.voters.length)}</div>` : '';
      const canLaugh = o.authors.length && !o.authors.includes(myId());
      const laugh = canLaugh ? `<button class="laugh ${c.myLaugh === o.id ? 'on' : ''}" data-act="laugh" data-id="${o.id}" style="animation-delay:${d + 1.6}s">😂 <b>${fmt((c.laughs || {})[o.id] || 0)}</b></button>` : '';
      return `<div class="rv" style="animation-delay:${d}s">${stamp}<div class="txt">${esc(o.text)}</div><div class="voters">${voterList(o.voters, d)}</div>${gl}${laugh}</div>`;
    }).join('');
    const d = lies.length * STEP;
    return `<div class="screen">${gameTop()}<div class="stage"><div class="scroll" data-scroll="r"><div class="wrap">
      ${qCard('bluff', c.question)}
      ${lies.some(o => o.authors.length) ? `<div class="center muted" style="font-size:12px;margin-top:10px">${t('laughHint')}</div>` : ''}
      <div class="rv-list">${cards}
        <div class="rv truth" style="animation-delay:${d}s"><span class="stamp" style="animation-delay:${d + 0.4}s">${t('truth')}</span><div class="txt">${esc(truth.text)}</div>${imgSearch(truth.text)}<div class="voters">${voterList(truth.voters, d)}</div>
          <div class="gainline" style="animation-delay:${d + 1}s">${truth.voters.length ? t('gotIt') : t('nobody')}</div></div>
      </div>
    </div></div></div>${hostNext()}</div>`;
  }
  function mountBluffReveal() {
    const c = state.room.current, mid = myId();
    const lies = c.options.filter(o => !o.truth).sort((a, b) => a.voters.length - b.voters.length);
    lies.forEach((o, i) => {
      later(i * 2400, sfx.whoosh);
      later(i * 2400 + 200, () => { const els = $app.querySelectorAll('.rv'); els[i] && els[i].scrollIntoView({ behavior: 'smooth', block: 'center' }); });
      if (o.voters.length) later(i * 2400 + 1100, () => {
        sfx.boing();
        if (o.voters.some(v => v.id === mid) && o.authors.length) { buzz(120); toast(t('gotFooledBy', { n: o.authors.map(a => P(a)?.name || '?').join(' & ') })); }
        if (o.authors.includes(mid)) { sfx.coin(); buzz([20, 30, 20]); }
      });
    });
    const myFooled = lies.filter(o => o.authors.includes(mid)).reduce((n, o) => n + o.voters.length, 0);
    if (myFooled) { bumpAch('fooled', myFooled); if (state.ach.fooled >= 5) unlock('liar5'); }
    const truth = c.options.find(o => o.truth);
    later(lies.length * 2400, () => {
      const el = $app.querySelector('.rv.truth'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      sfx.ding();
      const mine = truth.voters.find(v => v.id === mid);
      if (mine) { sfx.win(); flash(true); confetti(60); buzz([30, 40, 60]); if (mine.bet === 3) unlock('allin'); }
      else if (c.options.some(o => !o.truth && o.voters.some(v => v.id === mid))) flash(false);
      if (myFooled >= 2) later(900, () => announce(t('ann_legend'), 'pink'));
    });
  }

  // ---------- number ----------
  function guessView() {
    const c = state.room.current;
    return `<div class="screen">${gameTop()}<div class="stage"><div class="scroll" data-scroll="g"><div class="wrap">
      ${qCard('number', c.question, c.unit ? `(${esc(c.unit)})` : '')}
      ${whoRow(c.submitted)}
      <div class="answer-box">
        ${c.myGuess != null
          ? `<div class="my-answer"><small>${t('yourGuess')}</small><span style="direction:ltr;display:inline-block">${fmt(c.myGuess)}</span> ${esc(c.unit || '')}</div><div class="center muted"><span class="dots">${t('waitOthers')}</span></div>`
          : `<form data-form="guess" class="col"><input id="guess" class="input num-input" inputmode="decimal" placeholder="${t('typeNumber')}" value="${esc(state.draft.guess)}" autocomplete="off" data-autofocus><button class="btn sky block" type="submit">${t('send')}</button></form>`}
      </div>
      ${powerBar()}
    </div></div></div></div>`;
  }

  function numRevealView() {
    const c = state.room.current;
    const vals = c.results.map(r => r.g).concat(c.answer);
    let lo = Math.min(...vals), hi = Math.max(...vals);
    if (lo === hi) { lo -= 1; hi += 1; }
    const pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
    const pos = v => ((v - lo) / (hi - lo)) * 100;
    const sorted = [...c.results].sort((a, b) => a.g - b.g);
    let lastPos = -99, level = 0, maxLevel = 0;
    const marks = sorted.map(r => {
      const p = P(r.pid); if (!p) return '';
      const x = pos(r.g);
      level = x - lastPos < 9 ? level + 1 : 0; lastPos = x; maxLevel = Math.max(maxLevel, level);
      return `<div class="mk" data-x="${x}" style="left:50%;top:${18 - level * 40}px">${J(p.avatar)}<span class="v">${fmt(r.g)}</span></div>`;
    }).join('');
    const label = r => r.bull ? t('g_bullseye') : r.rank === 0 ? t('g_closest') : r.rank === 1 ? t('g_second') : r.rank === 2 ? t('g_third') : '';
    const list = c.results.map((r, i) => { const p = P(r.pid); return p ? `<div class="nr ${r.bull ? 'bull' : ''}" style="animation-delay:${2.2 + i * 0.15}s">${J(p.avatar)}<b>${esc(p.name)}</b><span class="g muted">${fmt(r.g)}</span><span class="pts">${label(r)}</span></div>` : ''; }).join('');
    return `<div class="screen">${gameTop()}<div class="stage"><div class="scroll" data-scroll="n"><div class="wrap">
      ${qCard('number', c.question)}
      <div class="numline" style="margin-top:${40 + maxLevel * 40}px"><div class="axis"></div>${marks}
        <div class="truth-mk" style="left:${pos(c.answer)}%"><span class="flag">${fmt(c.answer)} ${esc(c.unit || '')}</span><span class="pole"></span></div></div>
      <div class="num-results">${list}</div>
    </div></div></div>${hostNext()}</div>`;
  }
  function mountNumReveal() {
    const c = state.room.current, mid = myId();
    requestAnimationFrame(() => requestAnimationFrame(() => $app.querySelectorAll('.numline .mk').forEach(el => { el.style.left = el.dataset.x + '%'; })));
    sfx.drum();
    later(1600, () => { sfx.ding(); buzz(30); });
    const mine = c.results.find(r => r.pid === mid);
    if (mine && mine.bull) { unlock('bull'); later(2000, () => { flash(true); announce(t('bullseye')); confetti(); }); }
    else if (mine && mine.rank === 0) later(2000, () => { sfx.win(); buzz([30, 40]); });
  }

  // ---------- true / false ----------
  function blitzView() {
    const c = state.room.current, a = c.myAnswer;
    return `<div class="screen">${gameTop()}<div class="stage"><div class="scroll"><div class="wrap">
      ${quickDots(c)}
      ${qCard('blitz', c.statement)}
      <div class="timebar"><i data-bar="${state.room.deadline}"></i></div>
      <div class="tf">
        <button class="btn mint ${a === true ? 'chosen' : ''}" data-act="tf" data-v="1" ${a != null ? 'disabled' : ''}><span class="emo">✅</span>${t('true')}</button>
        <button class="btn coral ${a === false ? 'chosen' : ''}" data-act="tf" data-v="0" ${a != null ? 'disabled' : ''}><span class="emo">❌</span>${t('false')}</button>
      </div>
      ${powerBar()}
      ${a != null ? `<div class="center muted" style="margin-top:14px"><span class="dots">${t('waitOthers')}</span></div>` : ''}
      ${whoRow(c.answered)}
    </div></div></div></div>`;
  }
  function quickResult(c, header) {
    const mine = c.results[myId()];
    const fast = c.fastest && P(c.fastest);
    return `${header}
      <div class="center" style="font-weight:800;font-size:20px;margin-top:6px">${mine ? (mine.correct ? t('rightAns') : t('wrongAns')) : t('noAns')}</div>
      ${fast ? `<div class="center" style="margin-top:8px"><span class="chip">${t('fastestIs', { n: esc(fast.name) })}</span></div>` : ''}
      ${whoRow(null, c.results)}`;
  }
  function blitzResultView() {
    const c = state.room.current;
    return `<div class="screen">${gameTop()}<div class="stage"><div class="scroll"><div class="wrap">
      ${quickDots(c, true)}${qCard('blitz', c.statement)}
      ${quickResult(c, `<div class="verdict ${c.truth ? 't' : 'f'}">${c.truth ? '✅ ' + t('true') : '❌ ' + t('false')}</div>`)}
    </div></div></div></div>`;
  }
  function mountQuickResult() {
    const c = state.room.current, mid = myId(), mine = c.results[mid];
    if (mine && mine.correct) { sfx.win(); flash(true); buzz([25, 30, 25]); } else { sfx.fail(); flash(false); buzz(120); $app.querySelector('.verdict')?.classList.add('shake'); }
    if (c.fastest === mid) { later(300, sfx.coin); bumpAch('fastest'); if (state.ach.fastest >= 3) unlock('speedy'); }
    // perfect 3/3 in a quick round
    if (c.idx === c.total - 1 && mine && mine.correct) {
      const prevCorrect = (state.quickCorrect || 0) + 1;
      if (prevCorrect >= c.total) later(700, () => announce(t('ann_perfect'), 'mint'));
    }
    state.quickCorrect = c.idx === 0 ? (mine && mine.correct ? 1 : 0) : (state.quickCorrect || 0) + (mine && mine.correct ? 1 : 0);
  }

  // ---------- emoji decode ----------
  function emojiView() {
    const c = state.room.current, a = c.myAnswer;
    return `<div class="screen">${gameTop()}<div class="stage"><div class="scroll"><div class="wrap">
      ${quickDots(c)}
      <div class="q-card glass emoji-card"><span class="type-tag emoji">${TYPES.emoji} ${t('type_emoji')}</span><div class="big-emoji">${esc(c.emoji)}</div><div class="sub">${t('whatEmoji')}</div></div>
      <div class="timebar"><i data-bar="${state.room.deadline}"></i></div>
      <div class="grid4">${c.options.map((o, i) => `<button class="opt ${o.hidden ? 'gone' : ''} ${a === o.id ? 'picked' : ''}" style="animation-delay:${i * 60}ms" data-act="emoji" data-id="${o.id}" ${a != null || o.hidden ? 'disabled' : ''}>${o.hidden ? '<span class="tag">🔍</span>' : ''}${esc(o.text)}</button>`).join('')}</div>
      ${powerBar()}
      ${a != null ? `<div class="center muted" style="margin-top:14px"><span class="dots">${t('waitOthers')}</span></div>` : ''}
      ${whoRow(c.answered)}
    </div></div></div></div>`;
  }
  function emojiResultView() {
    const c = state.room.current;
    const right = c.options.find(o => o.id === c.correctId);
    return `<div class="screen">${gameTop()}<div class="stage"><div class="scroll"><div class="wrap">
      ${quickDots(c, true)}
      <div class="q-card glass emoji-card"><span class="type-tag emoji">${TYPES.emoji} ${t('type_emoji')}</span><div class="big-emoji">${esc(c.emoji)}</div></div>
      ${quickResult(c, `<div class="verdict t">${esc(right ? right.text : '')}</div>${imgSearch(right ? right.text : '')}`)}
    </div></div></div></div>`;
  }

  // ---------- line them up ----------
  // Tapping, not dragging. Dragging four cards into order on a phone, against
  // a clock, with a thumb, is a worse game than the one being played — so you
  // tap them in order and tap again to take one back.
  function orderView() {
    const c = state.room.current;
    const picked = state.draft.order.filter(id => c.items.some(it => it.id === id));
    const done = c.myOrder != null;
    const seq = done ? c.myOrder : picked;
    const byId = Object.fromEntries(c.items.map(it => [it.id, it]));
    const rank = id => seq.indexOf(id);
    return `<div class="screen">${gameTop()}<div class="stage"><div class="scroll"><div class="wrap">
      ${qCard('order', c.question)}
      <div class="timebar"><i data-bar="${state.room.deadline}"></i></div>
      <div class="order-list">${c.items.map((it, i) => {
        const at = rank(it.id);
        return `<button class="ord ${at >= 0 ? 'picked' : ''}" style="animation-delay:${i * 60}ms" data-act="ordpick" data-id="${esc(it.id)}" ${done ? 'disabled' : ''}>
          <span class="pos">${at >= 0 ? at + 1 : ''}</span><span class="nm">${esc(it.text)}</span>
        </button>`;
      }).join('')}</div>
      ${done
        ? `<div class="center muted" style="margin-top:14px"><span class="dots">${t('waitOthers')}</span></div>`
        : `<div class="row" style="margin-top:14px">
            <button class="btn sm ghost" data-act="ordclear" ${seq.length ? '' : 'disabled'}>${t('clear')}</button>
            <button class="btn mint grow" data-act="ordsend" ${seq.length === c.items.length ? '' : 'disabled'}>${seq.length === c.items.length ? t('lockIn') : t('pickAll', { n: c.items.length - seq.length })}</button>
          </div>`}
      ${whoRow(c.submitted)}
    </div></div></div></div>`;
  }

  function orderResultView() {
    const c = state.room.current, mid = myId();
    const mine = (c.results && c.results[mid]) || null;
    const place = id => (mine ? mine.seq.indexOf(id) : -1);
    return `<div class="screen">${gameTop()}<div class="stage"><div class="scroll"><div class="wrap">
      ${qCard('order', c.question)}
      <div class="order-list">${c.truth.map((it, i) => {
        const at = place(it.id);
        // Green when you had it in exactly this slot, amber when you had it
        // somewhere else — at a glance you can see what you nearly had.
        const cls = at < 0 ? '' : at === i ? 'right' : 'near';
        return `<div class="ord reveal ${cls}" style="animation-delay:${i * 90}ms">
          <span class="pos">${i + 1}</span><span class="nm">${esc(it.text)}</span>
          <span class="val">${fmt(it.v)}</span>${at >= 0 && at !== i ? `<span class="yours">${t('youSaid', { n: at + 1 })}</span>` : ''}
        </div>`;
      }).join('')}</div>
      ${mine ? `<div class="center" style="margin-top:14px;font-weight:800">${mine.pairs === c.truth.length - 1 ? t('perfectOrder') : t('pairsRight', { n: mine.pairs })}</div>` : ''}
    </div></div></div></div>`;
  }

  // ---------- odd one out ----------
  function oddView() {
    const c = state.room.current, a = c.myAnswer;
    return `<div class="screen">${gameTop()}<div class="stage"><div class="scroll"><div class="wrap">
      ${quickDots(c)}
      <div class="q-card glass"><span class="type-tag odd">${TYPES.odd} ${t('type_odd')}</span><div class="q">${t('whichOdd')}</div></div>
      <div class="timebar"><i data-bar="${state.room.deadline}"></i></div>
      <div class="grid4">${c.options.map((o, i) => `<button class="opt ${o.hidden ? 'gone' : ''} ${a === o.id ? 'picked' : ''}" style="animation-delay:${i * 60}ms" data-act="odd" data-id="${o.id}" ${a != null || o.hidden ? 'disabled' : ''}>${o.hidden ? '<span class="tag">🔍</span>' : ''}${esc(o.text)}</button>`).join('')}</div>
      ${powerBar()}
      ${a != null ? `<div class="center muted" style="margin-top:14px"><span class="dots">${t('waitOthers')}</span></div>` : ''}
      ${whoRow(c.answered)}
    </div></div></div></div>`;
  }
  function oddResultView() {
    const c = state.room.current;
    const right = c.options.find(o => o.id === c.correctId);
    // The reason is the payoff: without it a wrong guess just feels unfair.
    return `<div class="screen">${gameTop()}<div class="stage"><div class="scroll"><div class="wrap">
      ${quickDots(c, true)}
      <div class="q-card glass"><span class="type-tag odd">${TYPES.odd} ${t('type_odd')}</span><div class="q">${t('whichOdd')}</div></div>
      ${quickResult(c, `<div class="verdict t">${esc(right ? right.text : '')}</div><div class="why">${esc(c.why || '')}</div>${imgSearch(right ? right.text : '')}`)}
    </div></div></div></div>`;
  }

  // ---------- who's most likely ----------
  function likelyVoteView() {
    const c = state.room.current, v = c.myVote;
    const online = state.room.players.filter(p => p.connected);
    return `<div class="screen">${gameTop()}<div class="stage"><div class="scroll" data-scroll="lk"><div class="wrap">
      ${qCard('likely', c.prompt)}
      <div class="center" style="font-weight:800;margin-top:16px">${v ? t('youPicked', { n: esc(P(v)?.name || '') }) : t('pickPlayer')}</div>
      <div class="players likely-grid">${online.map((p, i) => `
        <button class="pcard ${v === p.id ? 'me' : ''}" style="animation-delay:${i * 50}ms" data-act="likely" data-id="${esc(p.id)}" ${v ? 'disabled' : ''}>${J(p.avatar)}<span class="nm">${esc(p.name)}</span></button>`).join('')}</div>
      ${powerBar()}
      ${v ? `<div class="center muted" style="margin-top:14px"><span class="dots">${t('waitOthers')}</span></div>${whoRow(c.voted)}` : ''}
    </div></div></div></div>`;
  }
  function likelyRevealView() {
    const c = state.room.current, mid = myId();
    const online = state.room.players.filter(p => p.connected || c.tally[p.id]);
    const max = Math.max(1, ...Object.values(c.tally));
    const rows = online.map(p => ({ p, n: c.tally[p.id] || 0 })).sort((a, b) => b.n - a.n).map((r, i) => {
      const voters = Object.entries(c.votes).filter(([, tg]) => tg === r.p.id).map(([vid]) => P(vid)).filter(Boolean);
      const win = c.winners.includes(r.p.id);
      return `<div class="lk-row ${win ? 'win' : ''}" style="animation-delay:${0.3 + i * 0.12}s">
        ${J(r.p.avatar)}<div class="grow"><div class="lk-top"><b>${esc(r.p.name)}${win ? ' 👑' : ''}</b><span>${t('votesN', { n: fmt(r.n) })}</span></div>
        <div class="lk-bar"><i data-w="${(r.n / max) * 100}"></i></div>
        <div class="lk-voters">${voters.map(v => J(v.avatar)).join('')}</div></div></div>`;
    }).join('');
    const names = c.winners.map(id => esc(P(id)?.name || '?')).join(' & ');
    const myV = c.votes[mid];
    return `<div class="screen">${gameTop()}<div class="stage"><div class="scroll" data-scroll="lr"><div class="wrap">
      ${qCard('likely', c.prompt)}
      <div class="lk-winner" id="lk-winner">${c.winners.length ? t('likelyWinner', { n: names }) : t('noVotes')}</div>
      ${myV && c.winners.includes(myV) ? `<div class="center" style="margin-top:6px"><span class="chip" style="background:rgba(79,224,176,.2)">${t('withCrowd')}</span></div>` : ''}
      <div class="lk-list">${rows}</div>
    </div></div></div>${hostNext()}</div>`;
  }
  function mountLikelyReveal() {
    const c = state.room.current, mid = myId();
    sfx.drum();
    later(1100, () => {
      $app.querySelectorAll('.lk-bar i').forEach(el => { el.style.width = el.dataset.w + '%'; });
      document.getElementById('lk-winner')?.classList.add('show');
      sfx.fanfare(); buzz([30, 40, 60]);
      if (c.winners.includes(mid)) { confetti(80); flash(true); unlock('famous'); }
      else if (c.winners.includes(c.votes[mid])) { sfx.coin(); flash(true); }
    });
  }

  // ---------- spy ----------
  function spyClueView() {
    const c = state.room.current;
    const roleCard = c.amSpy
      ? `<div class="q-card glass spy-card spy"><span class="type-tag spy">${TYPES.spy} ${t('type_spy')}</span><div class="spy-role">${t('youAreSpy')}</div><div class="spy-cat">${t('category')}: <b>${esc(c.category)}</b></div><div class="sub">${t('spyHintSpy')}</div></div>`
      : `<div class="q-card glass spy-card"><span class="type-tag spy">${TYPES.spy} ${t('type_spy')}</span><div class="spy-word">${esc(c.word)}</div><div class="sub">${t('spyHintCivilian')}</div></div>`;
    return `<div class="screen">${gameTop()}<div class="stage"><div class="scroll" data-scroll="sp"><div class="wrap">
      ${roleCard}
      ${whoRow(c.submitted)}
      <div class="answer-box">
        ${c.myClue
          ? `<div class="my-answer"><small>${t('yourClue')}</small>${esc(c.myClue)}</div><div class="center muted"><span class="dots">${t('waitOthers')}</span></div>`
          : `<form data-form="spyClue" class="col"><input id="spyclue" class="input" maxlength="24" placeholder="${t('writeClue')}" value="${esc(state.draft.spyClue)}" autocomplete="off" data-autofocus><button class="btn coral block" type="submit">${t('send')}</button></form>`}
      </div>
      ${powerBar()}
    </div></div></div></div>`;
  }

  function spyVoteView() {
    const c = state.room.current, v = c.myVote, mid = myId();
    const online = state.room.players.filter(p => p.connected);
    const clueMap = Object.fromEntries((c.clues || []).map(o => [o.id, o.text]));
    const cluesList = online.map((p, i) => `<div class="spy-clue-row" style="animation-delay:${i * 60}ms">${J(p.avatar)}<b>${esc(p.name)}</b><span>${esc(clueMap[p.id] || '')}</span></div>`).join('');
    const roleLine = c.amSpy ? t('youAreSpy') : `${t('category')}: ${esc(c.category)} • ${t('spyWordIs', { n: esc(c.word) })}`;
    return `<div class="screen">${gameTop()}<div class="stage"><div class="scroll" data-scroll="spv"><div class="wrap">
      <div class="q-card glass spy-card"><span class="type-tag spy">${TYPES.spy} ${t('type_spy')}</span><div class="sub">${roleLine}</div></div>
      <div class="section-title"><span>${t('spyPickSuspect')}</span></div>
      <div class="spy-clues">${cluesList}</div>
      <div class="players likely-grid">${online.map((p, i) => `
        <button class="pcard ${v === p.id ? 'me' : ''}" style="animation-delay:${i * 50}ms" data-act="spyvote" data-id="${esc(p.id)}" ${v || p.id === mid ? 'disabled' : ''}>${J(p.avatar)}<span class="nm">${esc(p.name)}</span></button>`).join('')}</div>
      ${c.amSpy && c.myGuess == null ? `<form data-form="spyGuess" class="col" style="margin-top:14px"><input id="spyguess" class="input" maxlength="40" placeholder="${t('guessWord')}" value="${esc(state.draft.spyGuess)}" autocomplete="off"><button class="btn lilac block" type="submit">${t('spyGuessBtn')}</button></form>` : ''}
      ${c.amSpy && c.myGuess != null ? `<div class="center muted" style="margin-top:10px">${t('guessSent', { n: esc(c.myGuess) })}</div>` : ''}
      ${powerBar()}
      ${v ? `<div class="center muted" style="margin-top:14px"><span class="dots">${t('waitOthers')}</span></div>${whoRow(c.voted)}` : ''}
    </div></div></div></div>`;
  }

  function spyRevealView() {
    const c = state.room.current;
    const spyP = P(c.spyId);
    const online = state.room.players.filter(p => p.connected || c.tally[p.id]);
    const max = Math.max(1, ...Object.values(c.tally));
    const rows = online.map(p => ({ p, n: c.tally[p.id] || 0 })).sort((a, b) => b.n - a.n).map((r, i) => {
      const voters = Object.entries(c.votes || {}).filter(([, tg]) => tg === r.p.id).map(([vid]) => P(vid)).filter(Boolean);
      const isSpy = r.p.id === c.spyId;
      return `<div class="lk-row ${isSpy ? 'spy-row' : ''}" style="animation-delay:${0.3 + i * 0.12}s">
        ${J(r.p.avatar)}<div class="grow"><div class="lk-top"><b>${esc(r.p.name)}${isSpy ? ' 🕵️' : ''}</b><span>${t('votesN', { n: fmt(r.n) })}</span></div>
        <div class="lk-bar"><i data-w="${(r.n / max) * 100}"></i></div>
        <div class="lk-voters">${voters.map(vp => J(vp.avatar)).join('')}</div></div></div>`;
    }).join('');
    return `<div class="screen">${gameTop()}<div class="stage"><div class="scroll" data-scroll="spr"><div class="wrap">
      <div class="q-card glass spy-card"><span class="type-tag spy">${TYPES.spy} ${t('type_spy')}</span><div class="spy-word">${esc(c.word)}</div>${imgSearch(c.word)}</div>
      <div class="lk-winner" id="spy-reveal-line">${spyP ? t('spyWas', { n: esc(spyP.name) }) : ''}</div>
      <div class="center" style="margin-top:6px"><span class="chip" style="background:${c.caught ? 'rgba(79,224,176,.2)' : 'rgba(255,122,133,.2)'}">${c.caught ? t('spyCaught') : t('spyEscaped')}</span></div>
      ${c.guess ? `<div class="center muted" style="margin-top:8px">${t('spyGuessWas', { n: esc(c.guess) })} ${c.guessRight ? '✅' : '❌'}</div>` : ''}
      <div class="lk-list">${rows}</div>
    </div></div></div>${hostNext()}</div>`;
  }
  function mountSpyReveal() {
    const c = state.room.current, mid = myId();
    sfx.drum();
    later(1100, () => {
      $app.querySelectorAll('.lk-bar i').forEach(el => { el.style.width = el.dataset.w + '%'; });
      document.getElementById('spy-reveal-line')?.classList.add('show');
      sfx.fanfare(); buzz([30, 40, 60]);
      if (c.spyId === mid) { if (!c.caught) { confetti(80); flash(true); } else flash(false); }
      else if (c.votes[mid] === c.spyId) { sfx.coin(); flash(true); }
    });
  }

  // ---------- scores ----------
  function scoresView() {
    const s = state.room, mid = myId();
    const ranked = [...s.players].filter(p => p.connected || p.score > 0).sort((a, b) => b.score - a.score);
    const rows = ranked.map((p, i) => {
      const g = s.gains[p.id], d = g ? g.total : 0;
      const pr = s.prevRank[p.id];
      const mv = pr == null ? '' : pr > i ? `<span class="mv up">▲${pr - i}</span>` : pr < i ? `<span class="mv down">▼${i - pr}</span>` : '<span class="mv"></span>';
      return `<div class="brow ${p.id === mid ? 'me' : ''} ${p.team ? 'team-' + p.team : ''}" data-from="${pr == null ? i : pr}" data-to="${i}" data-old="${p.score - d}" data-new="${p.score}">
        <span class="rk">${i === 0 ? '👑' : i + 1}</span>${J(p.avatar)}<span class="nm" ${p.userId ? `data-act="profile" data-uid="${esc(p.userId)}"` : ''}>${esc(p.name)}${p.streak >= 2 ? `<span class="streak">🔥${p.streak}</span>` : ''}</span>
        <span class="delta ${d < 0 ? 'neg' : ''}">${d ? (d > 0 ? '+' : '') + fmt(d) : ''}</span><span class="sc">${fmt(p.score - d)}</span>${mv}
      </div>`;
    }).join('');
    return `<div class="screen">${gameTop()}<div class="stage"><div class="scroll" data-scroll="s"><div class="wrap">
      <h2 class="center" style="margin:18px 0 0;font-size:26px">🏆 ${t('scores')}</h2>
      ${teamBars()}
      <div class="board">${rows}</div>
    </div></div></div>${hostNext()}</div>`;
  }
  function mountScores() {
    const rows = [...$app.querySelectorAll('.brow')];
    const h = rows[0] ? rows[0].offsetHeight + 8 : 60;
    rows.forEach(r => { r.style.transform = `translateY(${(+r.dataset.from - +r.dataset.to) * h}px)`; });
    const s = state.room, mid = myId();
    burst(s.gains[mid]);
    later(1900, () => {
      rows.forEach(r => { r.classList.add('go'); r.style.transform = 'translateY(0)'; });
      const t0 = performance.now();
      const step = tnow => {
        const k = Math.min(1, (tnow - t0) / 1100), e = 1 - Math.pow(1 - k, 3);
        rows.forEach(r => { const a = +r.dataset.old, b = +r.dataset.new; r.querySelector('.sc').textContent = fmt(Math.round(a + (b - a) * e)); });
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
      for (let i = 0; i < 6; i++) later(i * 150, sfx.coin);
    });
    const myRow = rows.find(r => r.classList.contains('me'));
    if (myRow && +myRow.dataset.to === 0 && +myRow.dataset.from !== 0 && +myRow.dataset.new > 0) later(3000, () => announce(t('ann_first')));
  }

  // ---------- final ----------
  function finalView() {
    const s = state.room, mid = myId();
    const ranked = [...s.players].filter(p => p.connected || p.score > 0).sort((a, b) => b.score - a.score);
    const pod = (p, n) => p ? `<div class="pod p${n}">${J(p.avatar)}<span class="nm" ${p.userId ? `data-act="profile" data-uid="${esc(p.userId)}"` : ''}>${esc(p.name)}</span><span class="sc">${fmt(p.score)}</span><div class="blk">${n}</div></div>` : '<div class="pod"></div>';
    const awards = (s.awards || []).map((a, i) => { const p = P(a.pid); return p ? `<div class="award"><div class="flip" style="animation-delay:${1.8 + i * 0.35}s"><div class="face"><span class="e">${AWARD_E[a.key]}</span><span class="t">${t('a_' + a.key)}</span>${J(p.avatar)}<span class="who">${esc(p.name)}</span><span class="n">${t('a_' + a.key + '_d', { n: fmt(a.value) })}</span></div></div></div>` : ''; }).join('');
    const bl = s.bestLie;
    const L = levelInfo(state.xp);
    return `<div class="screen"><div class="topbar">${menuBtn}<div class="mid"><div class="logo sm">${t('appName')}</div></div><div style="width:44px"></div></div>
      <div class="scroll" data-scroll="f"><div class="wrap" style="padding-bottom:16px">
        <h1 class="center" style="margin:6px 0 0;font-size:32px">${t('final')}</h1>
        ${ranked[0] ? `<div class="center muted" style="font-weight:700">${t('winnerIs', { n: esc(ranked[0].name) })}</div>` : ''}
        <div class="podium">${pod(ranked[1], 2)}${pod(ranked[0], 1)}${pod(ranked[2], 3)}</div>
        ${s.teamScores ? `<div class="team-result">${s.teamScores.A === s.teamScores.B ? t('teamTie') : t('teamWins', { n: t('team_' + (s.teamScores.A > s.teamScores.B ? 'A' : 'B')) })}</div>${teamBars()}` : ''}
        ${rivalsCard(s.rivals && s.rivals[mid])}
        ${bl ? `<div class="best-lie glass"><small>😈 ${t('bestLie')}</small><div class="txt">«${esc(bl.text)}»</div><div class="muted">${t('bestLieBy', { n: bl.authors.map(a => esc(P(a)?.name || '?')).join(' & '), f: fmt(bl.fooled) })}</div></div>` : ''}
        ${awards ? `<div class="section-title"><span>🏅 ${t('awards')}</span></div><div class="awards">${awards}</div>` : ''}
        <div class="glass xp-card"><div class="top"><span>${t('level')} <b id="lv">${L.level}</b></span><span class="gain" id="xpg"></span></div><div class="bar"><i id="xpbar" style="width:${(L.into / L.need) * 100}%"></i></div></div>
        <div class="board" style="margin-top:14px">${ranked.slice(3).map((p, i) => `<div class="brow ${p.id === mid ? 'me' : ''}"><span class="rk">${i + 4}</span>${J(p.avatar)}<span class="nm">${esc(p.name)}</span><span class="sc">${fmt(p.score)}</span></div>`).join('')}</div>
      </div></div>
      ${dock(`<div class="row">${isHost() ? `<button class="btn grow" data-act="again">${t('playAgain')}</button>` : ''}<button class="btn ghost grow" data-act="leave">${t('home')}</button></div>`)}
    </div>`;
  }
  function rivalsCard(r) {
    if (!r) return '';
    const cell = (x, title, desc) => { const p = x && P(x.id); return p ? `<div class="rival">${J(p.avatar)}<small>${title}</small><b>${esc(p.name)}</b><span>${t(desc, { n: fmt(x.n) })}</span></div>` : ''; };
    const body = cell(r.nemesis, t('nemesis'), 'nemesisD') + cell(r.victim, t('victim'), 'victimD');
    return body ? `<div class="section-title"><span>${t('rivals')}</span></div><div class="rivals">${body}</div>` : '';
  }

  function mountFinal() {
    const s = state.room, mid = myId();
    sfx.fanfare(); confetti(140); buzz([50, 60, 50, 60, 120]);
    const key = `${s.code}:${s.gameNo}`;
    if (state.recorded.includes(key)) return;
    const mine = s.players.find(p => p.id === mid);
    if (!mine) return;
    const ranked = [...s.players].sort((a, b) => b.score - a.score);
    const won = ranked[0] && ranked[0].id === mid && mine.score > 0;
    const nAwards = (s.awards || []).filter(a => a.pid === mid).length;
    const gainXp = 50 + Math.floor(mine.score / 10) + nAwards * 100 + (won ? 200 : 0);
    const before = levelInfo(state.xp);
    state.xp += gainXp; store.set('xp', state.xp);
    state.recorded = [...state.recorded.slice(-40), key]; store.set('recorded', state.recorded);
    bumpAch('games'); if (won) bumpAch('wins');
    unlock('first_game');
    if (won) unlock('first_win');
    if (state.ach.games >= 10) unlock('games10');
    if (state.ach.wins >= 5) unlock('wins5');
    const after = levelInfo(state.xp);
    later(1200, () => {
      const g = document.getElementById('xpg'), bar = document.getElementById('xpbar'), lv = document.getElementById('lv');
      if (g) g.textContent = `+${fmt(gainXp)} XP`;
      if (after.level > before.level) {
        if (bar) bar.style.width = '100%';
        later(1700, () => {
          if (bar) { bar.style.transition = 'none'; bar.style.width = '0'; void bar.offsetWidth; bar.style.transition = ''; bar.style.width = (after.into / after.need) * 100 + '%'; }
          if (lv) lv.textContent = after.level;
          announce(t('levelUp') + ' ' + after.level); confetti(80);
          const newHats = Object.entries(HAT_LOCK).filter(([, lvl]) => lvl > before.level && lvl <= after.level);
          if (newHats.length) later(2400, () => toast(t('hatUnlocked'), 'ok'));
        });
      } else if (bar) bar.style.width = (after.into / after.need) * 100 + '%';
    });
  }

  function mountHooks() {
    const s = state.room;
    if (!s || state.route.name !== 'room') return;
    ({ spin: mountSpin, bluffReveal: mountBluffReveal, numReveal: mountNumReveal, blitzResult: mountQuickResult, emojiResult: mountQuickResult, oddResult: mountQuickResult, likelyReveal: mountLikelyReveal, spyReveal: mountSpyReveal, scores: mountScores, final: mountFinal }[s.phase] || (() => {}))();
  }

  // ---------- reactions ----------
  const REACTIONS = ['😂', '🔥', '😱', '👏', '🤡', '💀', '😈', '❤️'];
  function renderReactBar() {
    let bar = document.getElementById('react-bar');
    const show = state.room && state.route.name === 'room' && state.code;
    if (!show) { bar && bar.remove(); return; }
    if (!bar) { bar = document.createElement('div'); bar.id = 'react-bar'; bar.className = 'react-bar'; document.body.appendChild(bar); }
    const phrases = STR[state.lang].phrases;
    bar.innerHTML = (state.chatOpen ? `<div class="phrases">${phrases.map((p, i) => `<button data-say="${i}" style="animation-delay:${i * 20}ms">${esc(p)}</button>`).join('')}</div>` : '')
      + (state.reactOpen ? REACTIONS.map((e, i) => `<button class="r" data-react="${e}" style="animation-delay:${i * 25}ms">${e}</button>`).join('') : '')
      + `<button class="react-toggle" data-chat-toggle>${state.chatOpen ? '✕' : '💬'}</button><button class="react-toggle" data-react-toggle>${state.reactOpen ? '✕' : '😀'}</button>`;
  }
  document.addEventListener('click', e => {
    const r = e.target.closest('[data-react]');
    if (r) { socket.emit('react', r.dataset.react); buzz(10); return; }
    const sy = e.target.closest('[data-say]');
    if (sy) { socket.emit('say', +sy.dataset.say); buzz(10); return; }
    if (e.target.closest('[data-chat-toggle]')) { state.chatOpen = !state.chatOpen; state.reactOpen = false; sfx.tap(); renderReactBar(); return; }
    if (e.target.closest('[data-react-toggle]')) { state.reactOpen = !state.reactOpen; state.chatOpen = false; sfx.tap(); renderReactBar(); }
  });

  // ---------- game feel ----------
  // eyes follow the pointer
  let eyeRaf = 0, px = innerWidth / 2, py = innerHeight / 3;
  function lookAll() {
    eyeRaf = 0;
    const svgs = document.querySelectorAll('svg.jelly');
    for (let i = 0; i < svgs.length && i < 60; i++) {
      const s = svgs[i], r = s.getBoundingClientRect();
      if (!r.width || r.bottom < 0 || r.top > innerHeight) continue;
      const dx = px - (r.left + r.width / 2), dy = py - (r.top + r.height * 0.5);
      const d = Math.hypot(dx, dy) || 1, k = Math.min(1, d / 260);
      const look = s.querySelector('.look');
      if (look) look.style.transform = `translate(${(dx / d) * 3.2 * k}px, ${(dy / d) * 2.6 * k}px)`;
    }
  }
  document.addEventListener('pointermove', e => { px = e.clientX; py = e.clientY; if (!eyeRaf) eyeRaf = requestAnimationFrame(lookAll); }, { passive: true });

  // tap a jelly → squish
  document.addEventListener('pointerdown', e => {
    px = e.clientX; py = e.clientY; if (!eyeRaf) eyeRaf = requestAnimationFrame(lookAll);
    const j = e.target.closest && e.target.closest('svg.jelly');
    if (j) { j.classList.remove('squish'); void j.getBoundingClientRect(); j.classList.add('squish'); tone(220 + Math.random() * 120, 0.18, 'sine', 0.06, 0, 2.4); setTimeout(() => j.classList.remove('squish'), 550); }
    // sparks from buttons
    const b = e.target.closest && e.target.closest('.btn, .opt, .pw, .bet, .pcard, .type-tog, .seg button, .icon-btn');
    if (b && !b.disabled) sparks(e.clientX, e.clientY, b.classList.contains('coral') ? '#ff7a85' : null);
  }, { passive: true });

  function sparks(x, y, color) {
    const cols = color ? [color, '#fff'] : ['#ffd65c', '#4fe0b0', '#ff82c4', '#5aaeff', '#fff'];
    for (let i = 0; i < 9; i++) {
      const s = document.createElement('i');
      s.className = 'spark';
      const a = (Math.PI * 2 * i) / 9 + Math.random() * 0.5, dist = 26 + Math.random() * 26;
      s.style.left = x + 'px'; s.style.top = y + 'px'; s.style.background = cols[i % cols.length];
      s.style.setProperty('--x', Math.cos(a) * dist + 'px'); s.style.setProperty('--y', Math.sin(a) * dist + 'px');
      document.body.appendChild(s); setTimeout(() => s.remove(), 650);
    }
  }

  // 3D tilt on answer cards
  document.addEventListener('pointermove', e => {
    const c = e.target.closest && e.target.closest('.opt:not(:disabled), .likely-grid .pcard:not(:disabled)');
    document.querySelectorAll('.tilted').forEach(el => { if (el !== c) { el.classList.remove('tilted'); el.style.transform = ''; } });
    if (!c || e.pointerType === 'touch') return;
    const r = c.getBoundingClientRect();
    const rx = ((e.clientY - r.top) / r.height - 0.5) * -10, ry = ((e.clientX - r.left) / r.width - 0.5) * 12;
    c.classList.add('tilted');
    c.style.transform = `perspective(700px) rotateX(${rx}deg) rotateY(${ry}deg) translateY(-2px)`;
  }, { passive: true });

  // screen-edge flash for personal wins / losses
  function flash(good) {
    const el = document.createElement('div');
    el.className = `flash ${good ? 'good' : 'bad'}`;
    document.body.appendChild(el); setTimeout(() => el.remove(), 750);
  }
  // your answer flies away when sent
  function flyFrom(el, emoji = '✉️') {
    const r = el ? el.getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0 };
    const f = document.createElement('div');
    f.className = 'fly'; f.textContent = emoji;
    f.style.left = r.left + r.width / 2 + 'px'; f.style.top = r.top + r.height / 2 + 'px';
    f.style.setProperty('--dx', (Math.random() * 80 - 40) + 'px');
    document.body.appendChild(f); setTimeout(() => f.remove(), 950);
    tone(600, 0.3, 'sine', 0.05, 0, 2.5);
  }
  // reaction bubble above the sender's avatar
  function bubbleOn(pid, e, isText) {
    const host = $app.querySelector(`.mini[data-pid="${CSS.escape(pid)}"], .pcard[data-pid="${CSS.escape(pid)}"]`);
    if (!host) return;
    const b = document.createElement('span');
    b.className = isText ? 'bubble-r say' : 'bubble-r'; b.textContent = e;
    host.appendChild(b); setTimeout(() => b.remove(), isText ? 2600 : 1900);
  }

  // ---------- timers ----------
  let lastSec = -1;
  function tick() {
    let hurry = false;
    document.querySelectorAll('.timer[data-deadline]').forEach(el => {
      const left = Math.max(0, +el.dataset.deadline - now());
      const sec = Math.ceil(left / 1000);
      el.querySelector('span').textContent = sec;
      el.querySelector('.prog').setAttribute('stroke-dashoffset', 125.66 * (1 - left / state.phaseTotal));
      el.classList.toggle('low', sec <= 5 && sec > 0);
      if (sec <= 5 && sec > 0) hurry = true;
      if (sec <= 5 && sec > 0 && sec !== lastSec) { lastSec = sec; tone(70, 0.12, 'sine', 0.12); tone(62, 0.14, 'sine', 0.1, 0.16); }
    });
    let hv = document.getElementById('hurry');
    if (hurry && !hv) { hv = document.createElement('div'); hv.id = 'hurry'; hv.className = 'hurry'; document.body.appendChild(hv); }
    else if (!hurry && hv) hv.remove();
    document.querySelectorAll('[data-bar]').forEach(el => {
      const left = Math.max(0, +el.dataset.bar - now());
      el.style.transform = `scaleX(${left / state.phaseTotal})`;
    });
    document.querySelectorAll('[data-count]').forEach(el => {
      const left = Math.max(0, +el.dataset.count - now());
      el.textContent = ` ${Math.ceil(left / 1000)}`;
      // safety net: if the server's own timer is late, the host nudges it along
      if (left <= 0 && isHost() && !el.dataset.sent) { el.dataset.sent = '1'; emit('next'); }
    });
  }
  setInterval(tick, 100);

  // ---------- avatar editor ----------
  function openEditor() { state.editor = { av: { ...state.profile.avatar }, tab: 'c' }; drawEditor(); }
  function drawEditor() {
    const ed = state.editor; if (!ed) return;
    const tabs = ['s', 'c', 'e', 'm', 'h'];
    const opts = Array.from({ length: Jelly.count[ed.tab] }, (_, i) => {
      const locked = ed.tab === 'h' && hatLocked(i);
      const inner = ed.tab === 'c' ? `<span class="sw" style="background:${Jelly.COLORS[i]}"></span>` : J({ ...ed.av, [ed.tab]: i });
      return `<button class="${ed.av[ed.tab] === i ? 'on' : ''} ${locked ? 'locked' : ''}" data-eo="${i}">${inner}${locked ? `<span class="lock">🔒${HAT_LOCK[i]}</span>` : ''}</button>`;
    }).join('');
    modal(`<h3>${t('editAvatar')}</h3>
      <div class="editor-preview">${J(ed.av)}</div>
      <div class="tabs">${tabs.map(k => `<button class="${ed.tab === k ? 'on' : ''}" data-et="${k}">${t('tab_' + k)}</button>`).join('')}</div>
      <div class="opts-grid">${opts}</div>
      <div class="row" style="margin-top:14px"><button class="btn ghost grow" data-er>${t('random')}</button><button class="btn mint grow" data-es>${t('save')}</button></div>`,
    m => m.addEventListener('click', e => {
      const o = e.target.closest('[data-eo]'), tb = e.target.closest('[data-et]');
      if (o) {
        const i = +o.dataset.eo;
        if (ed.tab === 'h' && hatLocked(i)) { toast(t('lockedAt', { n: HAT_LOCK[i] }), 'err'); return; }
        ed.av[ed.tab] = i; sfx.tap(); drawEditor();
      } else if (tb) { ed.tab = tb.dataset.et; sfx.tap(); drawEditor(); }
      else if (e.target.closest('[data-er]')) {
        let av; do { av = Jelly.random(); } while (hatLocked(av.h));
        ed.av = av; sfx.pop(); drawEditor();
      } else if (e.target.closest('[data-es]')) {
        state.profile.avatar = ed.av; store.set('profile', state.profile); closeModal(); sfx.send();
        if (state.room && state.code) socket.emit('join', { code: state.code, token: state.tokens[state.code], name: state.profile.name, avatar: state.profile.avatar }, () => {});
        render();
      }
    }));
  }

  function openMenu() {
    const inGame = state.room && state.code && state.room.phase !== 'lobby' && state.room.phase !== 'final';
    modal(`<h3>${t('menu')}</h3><div class="col">
      <button class="btn ghost block" data-m="sound">${t('sound')}: ${state.sound ? t('on') + ' 🔊' : t('off') + ' 🔇'}</button>
      <button class="btn ghost block" data-m="music">${t('music')}: ${state.music ? t('on') + ' 🎵' : t('off')}</button>
      <button class="btn ghost block" data-m="lang">🌐 ${t('uiLang')}</button>
      <button class="btn ghost block" data-m="how">❓ ${t('how')}</button>
      <button class="btn ghost block" data-m="ach">🏅 ${t('achievements')}</button>
      <button class="btn ghost block" data-m="board">🏆 ${t('leaderboard')}</button>
      <button class="btn ghost block" data-m="suggest">💡 ${t('suggestBtn')}</button>
      <button class="btn ghost block" data-m="about">ℹ️ ${t('about')}</button>
      ${state.isAdmin ? `<button class="btn lilac block" data-m="admin">🛡️ ${t('adminPanel')}</button>` : ''}
      ${inGame && isHost() ? `<button class="btn lilac block" data-m="end">🏁 ${t('endGame')}</button>` : ''}
      ${state.code ? `<button class="btn coral block" data-m="leave">🚪 ${t('leave')}</button>` : ''}
    </div>`, m => m.addEventListener('click', e => {
      const b = e.target.closest('[data-m]'); if (!b) return;
      const k = b.dataset.m;
      if (k === 'sound') { state.sound = !state.sound; store.set('sound', state.sound); openMenu(); }
      if (k === 'music') { toggleMusic(); openMenu(); }
      if (k === 'lang') { switchLang(); openMenu(); }
      if (k === 'how') howTo();
      if (k === 'ach') showAchievements();
      if (k === 'board') openLeaderboard();
      if (k === 'suggest') { closeModal(); openSuggest(); }
      if (k === 'about') openAbout();
      if (k === 'admin') { closeModal(); openAdmin(); }
      if (k === 'end') { closeModal(); emit('end'); }
      if (k === 'leave') { closeModal(); confirmBox(t('leave') + '?', leaveRoom); }
    }));
  }
  function howTo() { modal(`<h3>${t('how')}</h3><ol>${STR[state.lang].howSteps.map(s => `<li>${s}</li>`).join('')}</ol><button class="btn block" data-close>${t('close')}</button>`); }
  function switchLang() { state.lang = state.lang === 'ar' ? 'en' : 'ar'; store.set('uiLang', state.lang); state.lastKey = ''; render(); }
  function toggleMusic() { state.music = !state.music; store.set('music', state.music); if (state.music) { ctx(); startMusic(); } }

  // ================= account & social =================
  async function api(path, opts = {}) {
    try {
      const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
      if (state.bearer) headers.authorization = `Bearer ${state.bearer}`;
      const r = await fetch(path, { ...opts, headers });
      const d = await r.json().catch(() => ({}));
      return r.ok ? d : { ...d, status: r.status };
    } catch { return { error: 'network' }; }
  }
  const post = (path, body) => api(path, { method: 'POST', body: JSON.stringify(body || {}) });

  async function loadMe() {
    const r = await api('/api/auth/me');
    state.meKnown = true;
    state.me = r.user || null;
    state.isAdmin = !!r.isAdmin;
    // Discord is the source of truth for who you are; keep the local copy in step
    if (state.me) { state.profile.name = state.me.name; store.set('profile', state.profile); }
    if (r.banned) toast(t('youAreBanned', { r: r.banned }), 'err');
  }

  const signedIn = () => !!state.me;
  function needAccount() {
    if (signedIn()) return true;
    toast(t('signInFirst'), 'err');
    return false;
  }
  const apiErr = d => toast(d.error === 'slow_down' ? t('slowDown') : t('err_bad'), 'err');

  function accountBar() {
    if (!signedIn()) return '';
    return `<div class="account">
      <button class="chip" data-act="profile" data-uid="${esc(state.me.id)}">👤 ${esc(state.me.name)}</button>
      ${state.isAdmin ? `<button class="chip" data-act="admin">🛡️</button>` : ''}
      <button class="chip" data-act="signout">${t('signOut')}</button></div>`;
  }

  // ---------- open rooms ----------
  function lobbyList() {
    const ls = state.lobbies;
    if (ls === null) return '';
    const rows = ls.length ? ls.map(l => `
      <button class="lobby-row" data-act="join-lobby" data-code="${esc(l.code)}">
        ${l.avatar ? J(l.avatar) : ''}
        <div class="grow">
          <b>${esc(l.host || '')}</b>
          <small>${l.phase === 'lobby' ? t('inLobby') : `${t('playing')} · ${l.round}/${l.rounds}`}</small>
        </div>
        <span class="chip">${fmt(l.players)}/12</span>
        <span class="code">${esc(l.code)}</span>
      </button>`).join('') : `<div class="center muted" style="padding:14px;font-size:13px">${t('noRooms')}</div>`;
    return `<div class="section-title"><span>🚪 ${t('openRooms')}</span><button class="chip" data-act="rooms-refresh">↻ ${t('refresh')}</button></div>
      <div class="glass lobby-list">${rows}</div>`;
  }
  async function loadLobbies() {
    const r = await api('/api/lobbies');
    const next = r.lobbies || [];
    // This polls every 15 seconds. Re-rendering unconditionally — and worse,
    // clearing lastKey so the whole screen was rebuilt from scratch with its
    // entrance animations — is what made the home screen visibly redraw
    // itself while nobody was touching it. Only a list that actually changed
    // is worth a repaint, and it is a cheap one now.
    const sig = l => l.map(x => `${x.code}:${x.players}:${x.phase || ''}`).join('|');
    const changed = state.lobbies === null || sig(next) !== sig(state.lobbies);
    state.lobbies = next;
    if (changed && state.route.name === 'home') render();
  }

  // ---------- profile ----------
  async function openProfile(userId) {
    if (!userId) return;
    modal(`<div class="center" style="padding:40px"><div class="spinner"></div></div>`);
    const d = await api('/api/profile/' + encodeURIComponent(userId));
    if (d.error || d.status) { closeModal(); toast(d.status === 503 ? t('err_bad') : t('err_noroom'), 'err'); return; }
    drawProfile(d);
  }

  // Dates come back as ISO strings; only the day matters on a scoreboard.
  const shortDate = v => {
    const d = new Date(v);
    return isNaN(d) ? '' : d.toLocaleDateString(state.lang === 'ar' ? 'ar-SA' : 'en-GB', { day: 'numeric', month: 'short' });
  };
  const medal = n => (n === 1 ? '🥇' : n === 2 ? '🥈' : n === 3 ? '🥉' : '#' + n);

  // The match itself, round by round: every question, every lie somebody
  // wrote, every vote. All of it was on screen during the game — this is the
  // same thing, kept. Rounds start collapsed so the scoreboard stays the first
  // thing you see; opening one is the point of the page.
  function replayHtml(d) {
    if (!d.log || !d.log.length) return '';
    const by = {};
    for (const p of d.players) if (p.pid) by[p.pid] = p;
    const who = pid => by[pid] || null;
    // A player, as a small avatar-and-name pill. `tail` is whatever they did:
    // the option they picked, the number they guessed, their bet.
    const chip = (pid, cls, tail) => {
      const p = who(pid);
      return `<span class="repp ${cls || ''}">${J(p && p.avatar ? p.avatar : {})}${esc(p ? p.name : '—')}${
        tail ? ` <b>${esc(String(tail))}</b>` : ''}</span>`;
    };
    const chips = (ids, cls) => (ids.length ? ids.map(i => chip(i, cls)).join('') : `<span class="by">${t('repNobody')}</span>`);
    const line = (main, note, right, cls) => `<div class="repo ${cls || ''}">
      <span class="txt">${main}</span>${note ? `<span class="by">${note}</span>` : ''}
      ${right ? `<span class="repw">${right}</span>` : ''}</div>`;

    const bluff = r => r.options.map(o => {
      const voters = Object.entries(r.votes || {})
        .filter(([, v]) => v.id === o.id)
        .map(([pid, v]) => chip(pid, o.truth ? 'ok' : 'no', v.bet > 1 ? '×' + v.bet : ''));
      const note = o.truth ? `✅ ${t('repTruth')}`
        : o.house ? t('repHouse')
        : `✍️ ${esc(o.authors.map(a => (who(a) || {}).name || '—').join('، '))}`;
      return line(esc(o.text), note, voters.join(''), o.truth ? 'ok' : '');
    }).join('');

    const number = r => line(fmt(r.answer), t('repAnswer'), '', 'ok') +
      Object.entries(r.guesses || {})
        .sort((a, b) => Math.abs(a[1] - r.answer) - Math.abs(b[1] - r.answer))
        .map(([pid, g]) => line(chip(pid, (r.bulls || []).includes(pid) ? 'ok' : ''), '', `<b>${fmt(g)}</b>${(r.bulls || []).includes(pid) ? ' 🎯' : ''}`))
        .join('');

    const likely = r => line(chips(r.winners || [], 'ok'), t('repMostVotes'), '', 'ok') +
      Object.entries(r.votes || {}).map(([pid, target]) =>
        line(chip(pid), '→', chip(target, (r.winners || []).includes(target) ? 'ok' : ''))).join('');

    const spy = r =>
      line(`🕵️ ${chip(r.spyId)}`, r.caught ? t('repCaught') : t('repEscaped'), '', r.caught ? 'ok' : 'no') +
      Object.entries(r.clues || {}).map(([pid, clue]) =>
        line(chip(pid, pid === r.spyId ? 'no' : ''), '', `<b>${esc(clue)}</b>`)).join('') +
      Object.entries(r.votes || {}).map(([pid, target]) =>
        line(chip(pid), '→', chip(target, target === r.spyId ? 'ok' : ''))).join('') +
      (r.guess ? line(esc(r.guess), t('repSpyGuess'), r.guessRight ? '✅' : '❌', r.guessRight ? 'ok' : '') : '');

    // blitz, emoji and odd are one shape: a few items, one right answer each.
    const quick = (r, type) => r.items.map(it => {
      const said = a => (type === 'blitz' ? (a.v ? t('true') : t('false'))
        : (it.opts.find(o => o.id === a.id) || {}).text || '—');
      const head = type === 'blitz' ? esc(it.text)
        : type === 'emoji' ? `<span style="font-size:22px">${esc(it.e)}</span>`
        : it.opts.map(o => esc(o.text)).join(' · ');
      const right = type === 'blitz' ? (it.truth ? t('true') : t('false'))
        : (it.opts.find(o => o.id === it.correctId) || {}).text || '';
      const answers = Object.entries(it.answers || {})
        .map(([pid, a]) => chip(pid, a.ok ? 'ok' : 'no', said(a)));
      return `<div class="repi">${line(head, '', '', '')}
        ${line(`✅ ${esc(right)}`, type === 'odd' ? esc(it.why) : '', answers.join('') || `<span class="by">${t('repNobody')}</span>`, 'ok')}</div>`;
    }).join('');

    const order = r => {
      const text = {};
      for (const it of r.items) text[it.id] = it;
      const seq = ids => ids.map(id => esc((text[id] || {}).text || '?')).join(' › ');
      return line(seq(r.truth), t('repCorrect'), '', 'ok') +
        r.truth.map((id, i) => line(`${i + 1}. ${esc((text[id] || {}).text || '?')}`, '', `<b>${fmt((text[id] || {}).v)}</b>`)).join('') +
        Object.entries(r.orders || {}).map(([pid, s]) => line(chip(pid), '', `<b>${seq(s)}</b>`)).join('');
    };

    // The question is the summary line, so it is not repeated in the body.
    const bodyFor = r =>
      (r.type === 'spy' ? `<div class="repq">${esc(r.word)} <span class="by">· ${esc(r.cat)}</span></div>` : '') +
      (r.type === 'bluff' ? bluff(r)
        : r.type === 'number' ? number(r)
        : r.type === 'likely' ? likely(r)
        : r.type === 'spy' ? spy(r)
        : r.type === 'order' ? order(r)
        : quick(r, r.type));

    const rounds = d.log.map(r => {
      const pts = Object.entries(r.pts || {}).sort((a, b) => b[1] - a[1])
        .map(([pid, n]) => chip(pid, n > 0 ? 'ok' : 'no', (n > 0 ? '+' : '') + fmt(n)));
      const head = r.type === 'spy' ? t('type_spy') : r.q || t('type_' + r.type);
      return `<details class="rep">
        <summary><span class="rn">${r.n}</span><span>${TYPES[r.type] || ''} ${MODS[r.mod] || ''}</span>
          <span class="rq">${esc(head)}</span></summary>
        <div class="repbody">${bodyFor(r)}
          ${pts.length ? line(`<span class="by">${t('repRoundPts')}</span>`, '', pts.join('')) : ''}</div>
      </details>`;
    }).join('');
    return `<div style="margin-top:14px"><div class="muted" style="font-size:12px;font-weight:800;margin-bottom:4px">${t('repRounds')}</div>${rounds}</div>`;
  }

  // The scoreboard of one finished game. Reachable from a profile and from a
  // /match/<id> link, which is the whole point — it has to stand on its own
  // for someone who was never in the room.
  async function openMatch(id, fromRoute) {
    modal(`<div class="center" style="padding:40px"><div class="spinner"></div></div>`);
    const d = await api('/api/match/' + encodeURIComponent(id));
    if (d.error || d.status) {
      closeModal();
      toast(t('matchGone'), 'err');
      if (fromRoute) navigate('/');
      return;
    }
    const url = `${location.origin}/match/${d.id}`;
    const rows = d.players.map(g => `
      <div class="brow ${g.won ? 'me' : ''}" ${g.userId ? `data-mt-uid="${esc(g.userId)}"` : ''}>
        <span class="rk">${medal(g.place)}</span>${J(g.avatar && g.avatar.s != null ? g.avatar : {})}
        <span class="nm">${esc(g.name || '—')}${g.bot ? ' 🤖' : ''}</span>
        <span class="sc">${fmt(g.score)}</span>
      </div>`).join('');
    modal(`<h3>🏁 ${t('matchResult')}</h3>
      <div class="center muted" style="font-size:12px;margin-bottom:10px">${shortDate(d.finishedAt)} · ${t('roundsN', { n: fmt(d.rounds) })}</div>
      <div style="max-height:56vh;overflow-y:auto">
        <div class="board">${rows}</div>
        ${replayHtml(d)}
      </div>
      <div class="row" style="margin-top:14px">
        <button class="btn sm mint grow" data-mt="share">🔗 ${t('shareMatch')}</button>
        <button class="btn sm ghost grow" data-close>${t('close')}</button>
      </div>`,
    m => m.addEventListener('click', async e => {
      if (e.target.closest('[data-mt="share"]')) {
        if (navigator.share) { try { await navigator.share({ title: 'MAQLAB', url }); return; } catch {} }
        try { await navigator.clipboard.writeText(url); toast(t('copied'), 'ok'); } catch { toast(url); }
        return;
      }
      const r = e.target.closest('[data-mt-uid]');
      if (r) { closeModal(); openProfile(r.dataset.mtUid); }
    }));
    // Closing a match that the URL points at should return home, not leave the
    // address bar pointing at a modal that is no longer open.
    if (fromRoute) {
      const bg = $modal.firstElementChild;
      bg.addEventListener('click', e => { if (e.target === bg || e.target.closest('[data-close]')) navigate('/'); });
    }
  }

  function drawProfile(d) {
    const p = d.profile;
    const games = Number(p.games) || 0;
    const rate = games ? Math.round((Number(p.wins) / games) * 100) : 0;
    const L = levelInfo(Number(p.xp) || 0);
    const tile = (label, value) => `<div class="stat"><b>${value}</b><small>${label}</small></div>`;
    const recent = (d.games || []).slice(0, 7);
    const trend = recent.length
      ? `<div class="trend">${recent.slice().reverse().map(g => `<i class="${g.won ? 'w' : ''}" style="height:${Math.max(8, Math.min(46, (g.score / 4000) * 46))}px" title="${fmt(g.score)}"></i>`).join('')}</div>`
      : `<div class="center muted" style="font-size:12px">${t('noGames')}</div>`;
    const ach = (p.achievements || []).length;
    // Games recorded before match ids existed have nothing to link to, so they
    // stay in the trend bars above and out of this list.
    const history = (d.games || []).filter(g => g.match_id).slice(0, 5).map(g => `
      <div class="mrow" data-match="${esc(g.match_id)}">
        <span class="rk">${medal(g.place)}</span>
        <span class="nm">${g.place === 1 ? t('place1') : t('placeN', { n: g.place })} · ${fmt(g.players)} 👥</span>
        <span class="dt">${shortDate(g.finished_at)}</span>
        <span class="sc">${fmt(g.score)}</span>
      </div>`).join('');

    modal(`
      <div class="prof-head">
        ${J(p.avatar && p.avatar.s != null ? p.avatar : Jelly.random())}
        <div>
          <h3 style="margin:0;text-align:start">${esc(p.name)}</h3>
          <div class="row" style="gap:6px;margin-top:4px">
            <span class="chip">${t('level')} ${L.level}</span>
            ${d.rank ? `<span class="chip gold">#${fmt(d.rank)}</span>` : ''}
            ${p.banned_at ? `<span class="chip bad">${t('ban')}</span>` : ''}
          </div>
        </div>
      </div>
      <div class="stats-grid">
        ${tile(t('winRate'), rate + '%')}
        ${tile(t('totalScore'), fmt(p.total_score))}
        ${tile(t('games'), fmt(games))}
        ${tile(t('wins'), fmt(p.wins))}
        ${tile(t('bestScore'), fmt(p.best_score))}
        ${tile(t('curStreak'), '🔥 ' + fmt(p.win_streak))}
        ${tile(t('bestStreak'), fmt(p.best_win_streak))}
        ${tile(t('achievements'), `${fmt(ach)}/24`)}
      </div>
      <div class="section-title"><span>${t('lastGames')}</span><span class="chip">${t('followers')} ${fmt(d.follows.followers)} · ${t('followingN')} ${fmt(d.follows.following)}</span></div>
      ${trend}
      ${history}
      <div class="row" style="margin-top:16px;flex-wrap:wrap">
        ${d.isMe ? '' : `<button class="btn sm ${d.isFollowing ? 'ghost' : 'mint'} grow" data-pf="follow">${d.isFollowing ? t('unfollow') : t('follow')}</button>`}
        ${d.isMe ? '' : `<button class="btn sm ghost" data-pf="report">🚩 ${t('report')}</button>`}
        ${d.viewerIsAdmin && !d.isMe ? `<button class="btn sm coral" data-pf="${p.banned_at ? 'unban' : 'ban'}">${p.banned_at ? t('unban') : t('ban')}</button>
        <button class="btn sm ghost" data-pf="reset">${t('resetProfile')}</button>` : ''}
        <button class="btn sm ghost grow" data-close>${t('close')}</button>
      </div>`,
    m => m.addEventListener('click', async e => {
      const mt = e.target.closest('[data-match]');
      if (mt) { closeModal(); openMatch(mt.dataset.match); return; }
      const b = e.target.closest('[data-pf]'); if (!b) return;
      const k = b.dataset.pf;
      if (k === 'follow') {
        if (!needAccount()) return;
        const r = await post('/api/follow', { userId: p.user_id, follow: !d.isFollowing });
        if (r.ok) { d.isFollowing = r.following; sfx.tap(); drawProfile(d); }
      } else if (k === 'report') { closeModal(); openReport(p); }
      else if (k === 'ban') { closeModal(); openBan(p); }
      else if (k === 'unban') { await post('/api/admin/action', { action: 'unban', userId: p.user_id }); toast(t('sent'), 'ok'); closeModal(); }
      else if (k === 'reset') {
        closeModal();
        confirmBox(t('confirmReset', { n: p.name }), async () => {
          await post('/api/admin/action', { action: 'reset', userId: p.user_id });
          toast(t('sent'), 'ok');
        });
      }
    }));
  }

  // ---------- leaderboard ----------
  async function openLeaderboard() {
    modal(`<div class="center" style="padding:40px"><div class="spinner"></div></div>`);
    const d = await api('/api/leaderboard');
    if (d.error || d.status) { closeModal(); toast(t('err_bad'), 'err'); return; }
    const rows = d.entries.length ? d.entries.map((e, i) => `
      <div class="brow ${e.user_id === d.meId ? 'me' : ''}">
        <span class="rk">${i === 0 ? '👑' : i + 1}</span>${J(e.avatar && e.avatar.s != null ? e.avatar : {})}
        <span class="nm" data-act="profile" data-uid="${esc(e.user_id)}">${esc(e.name)}</span>
        <span class="sc">${fmt(e.total_score)}</span>
        ${e.user_id === d.meId ? '' : `<button class="flag" data-lb-report="${esc(e.user_id)}" data-lb-name="${esc(e.name)}">🚩</button>`}
      </div>`).join('') : `<div class="center muted" style="padding:20px">${t('nothingHere')}</div>`;
    modal(`<h3>🏆 ${t('leaderboard')}</h3>
      ${d.myRank ? `<div class="center muted" style="font-size:13px;margin-bottom:8px">${t('rank')}: #${fmt(d.myRank)}</div>` : ''}
      <div class="board" data-scroll="lb" style="max-height:58vh;overflow-y:auto">${rows}</div>
      <button class="btn block ghost" data-close style="margin-top:14px">${t('close')}</button>`,
    m => m.addEventListener('click', e => {
      const f = e.target.closest('[data-lb-report]');
      if (f) { closeModal(); openReport({ user_id: f.dataset.lbReport, name: f.dataset.lbName }); return; }
      const n = e.target.closest('[data-act="profile"]');
      if (n) { closeModal(); openProfile(n.dataset.uid); }
    }));
  }

  // ---------- report / suggest ----------
  function openReport(target) {
    if (!needAccount()) return;
    const reasons = [['cheat', 'r_cheat'], ['name', 'r_name'], ['chat', 'r_chat'], ['other', 'r_other']];
    modal(`<h3>🚩 ${t('reportTitle', { n: esc(target.name) })}</h3>
      <div class="lbl" style="font-weight:700;margin-bottom:8px">${t('reportWhy')}</div>
      <div class="types">${reasons.map(([v, k], i) => `<button class="type-tog ${i === 0 ? 'on' : ''}" data-reason="${v}">${t(k)}</button>`).join('')}</div>
      <textarea id="rep-details" class="input" style="height:80px;text-align:start;padding:12px;margin-top:12px" maxlength="500" placeholder="${t('reportDetails')}"></textarea>
      <div class="row" style="margin-top:14px"><button class="btn coral grow" data-send>${t('report')}</button><button class="btn ghost grow" data-close>${t('cancel')}</button></div>`,
    m => {
      let reason = 'cheat';
      m.addEventListener('click', async e => {
        const r = e.target.closest('[data-reason]');
        if (r) { reason = r.dataset.reason; m.querySelectorAll('[data-reason]').forEach(b => b.classList.toggle('on', b === r)); return; }
        if (!e.target.closest('[data-send]')) return;
        const d = await post('/api/report', { userId: target.user_id, reason, details: m.querySelector('#rep-details').value });
        closeModal();
        d.ok ? toast(t('reportSent'), 'ok') : apiErr(d);
      });
    });
  }

  function openBan(target) {
    modal(`<h3>${t('ban')} — ${esc(target.name)}</h3>
      <input id="ban-why" class="input" maxlength="200" placeholder="${t('banWhy')}" style="text-align:start">
      <div class="row" style="margin-top:14px"><button class="btn coral grow" data-send>${t('ban')}</button><button class="btn ghost grow" data-close>${t('cancel')}</button></div>`,
    m => m.addEventListener('click', async e => {
      if (!e.target.closest('[data-send]')) return;
      const d = await post('/api/admin/action', { action: 'ban', userId: target.user_id, reason: m.querySelector('#ban-why').value });
      closeModal();
      d.ok ? toast(t('sent'), 'ok') : apiErr(d);
    }));
  }

  function openSuggest() {
    if (!needAccount()) return;
    modal(`<h3>💡 ${t('suggestBtn')}</h3>
      <textarea id="sug-body" class="input" style="height:120px;text-align:start;padding:12px" maxlength="2000" placeholder="${t('suggestPlaceholder')}"></textarea>
      <div class="row" style="margin-top:14px"><button class="btn mint grow" data-send>${t('send')}</button><button class="btn ghost grow" data-close>${t('cancel')}</button></div>`,
    m => m.addEventListener('click', async e => {
      if (!e.target.closest('[data-send]')) return;
      const d = await post('/api/suggest', { body: m.querySelector('#sug-body').value });
      closeModal();
      d.ok ? toast(t('sent'), 'ok') : apiErr(d);
    }));
  }

  // ---------- admin ----------
  async function openAdmin(tab = 'reports') {
    const d = await api('/api/admin/state');
    if (d.status === 404) { toast(t('err_host'), 'err'); return; }
    const tabs = [['reports', d.reports.length], ['suggestions', d.suggestions.length], ['banned', d.banned.length], ['search', '']];
    const card = (inner, actions) => `<div class="adm-row"><div class="grow">${inner}</div><div class="row">${actions}</div></div>`;
    let body = '';
    if (tab === 'reports') {
      body = d.reports.length ? d.reports.map(r => card(
        `<b data-act="profile" data-uid="${esc(r.reported_id)}">${esc(r.reported_name)}</b>
         <small>${esc(r.reason)}${r.details ? ' — ' + esc(r.details) : ''}</small>
         <small class="muted">${esc(r.reporter_name)}</small>`,
        `<button class="btn sm coral" data-adm="ban" data-id="${esc(r.reported_id)}" data-name="${esc(r.reported_name)}">${t('ban')}</button>
         <button class="btn sm ghost" data-adm="handleReport" data-rid="${r.id}">${t('markDone')}</button>`)).join('') : '';
    } else if (tab === 'suggestions') {
      body = d.suggestions.length ? d.suggestions.map(s => card(
        `<b>${esc(s.name)}</b><small>${esc(s.body)}</small>`,
        `<button class="btn sm ghost" data-adm="handleSuggestion" data-rid="${s.id}">${t('markDone')}</button>`)).join('') : '';
    } else if (tab === 'banned') {
      body = d.banned.length ? d.banned.map(b => card(
        `<b data-act="profile" data-uid="${esc(b.user_id)}">${esc(b.name)}</b><small>${esc(b.ban_reason || '')}</small>`,
        `<button class="btn sm mint" data-adm="unban" data-id="${esc(b.user_id)}">${t('unban')}</button>`)).join('') : '';
    } else {
      body = `<input id="adm-q" class="input" placeholder="${t('searchPlayers')}" style="text-align:start"><div id="adm-results" class="col" style="gap:8px;margin-top:10px"></div>`;
    }
    modal(`<h3>🛡️ ${t('adminPanel')}</h3>
      <div class="tabs">${tabs.map(([k, n]) => `<button class="${tab === k ? 'on' : ''}" data-adm-tab="${k}">${t('tab_' + k)}${n ? ` (${n})` : ''}</button>`).join('')}</div>
      <div class="adm-list">${body || `<div class="center muted" style="padding:20px">${t('nothingHere')}</div>`}</div>
      <button class="btn block ghost" data-close style="margin-top:14px">${t('close')}</button>`,
    m => {
      const q = m.querySelector('#adm-q');
      if (q) {
        let timer = 0;
        q.addEventListener('input', () => {
          clearTimeout(timer);
          timer = setTimeout(async () => {
            const r = await post('/api/admin/action', { action: 'search', term: q.value });
            m.querySelector('#adm-results').innerHTML = (r.results || []).map(u =>
              `<div class="adm-row"><div class="grow"><b data-act="profile" data-uid="${esc(u.user_id)}">${esc(u.name)}</b><small>${fmt(u.games)} ${t('games')} · ${fmt(u.total_score)}</small></div>
               <button class="btn sm ${u.banned_at ? 'mint' : 'coral'}" data-adm="${u.banned_at ? 'unban' : 'ban'}" data-id="${esc(u.user_id)}" data-name="${esc(u.name)}">${u.banned_at ? t('unban') : t('ban')}</button></div>`).join('');
          }, 350);
        });
      }
      m.addEventListener('click', async e => {
        const tb = e.target.closest('[data-adm-tab]');
        if (tb) { openAdmin(tb.dataset.admTab); return; }
        const pr = e.target.closest('[data-act="profile"]');
        if (pr) { closeModal(); openProfile(pr.dataset.uid); return; }
        const b = e.target.closest('[data-adm]'); if (!b) return;
        const act = b.dataset.adm;
        if (act === 'ban') { closeModal(); openBan({ user_id: b.dataset.id, name: b.dataset.name }); return; }
        await post('/api/admin/action', { action: act, userId: b.dataset.id, id: b.dataset.rid ? +b.dataset.rid : undefined });
        openAdmin(tab);
      });
    });
  }

  // ---------- about ----------
  function openAbout() {
    modal(`<div class="center"><div class="logo sm">${t('appName')}</div></div>
      ${STR[state.lang].aboutBody.map(p => `<p>${esc(p)}</p>`).join('')}
      <div class="mode-strip" style="margin:14px 0">${Object.keys(TYPES).map(k => `<span class="chip">${TYPES[k]} ${t('type_' + k)}</span>`).join('')}</div>
      <div class="center muted" style="font-size:12px">${t('aboutMade')} · ${t('version')} 2.0</div>
      <div class="center" style="margin-top:8px;font-size:12px"><a href="/terms" target="_blank" style="color:var(--muted)">${t('terms')}</a> · <a href="/privacy" target="_blank" style="color:var(--muted)">${t('privacy')}</a></div>
      <button class="btn block ghost" data-close style="margin-top:14px">${t('close')}</button>`);
  }

  // ================= actions =================
  function needName() {
    if (!signedIn()) { toast(t('signInFirst'), 'err'); return false; }
    state.profile.name = state.me.name;
    store.set('profile', state.profile);
    return true;
  }
  async function shareLink(native) {
    const url = `${location.origin}/room/${state.room.code}`;
    if (native && navigator.share) { try { await navigator.share({ title: 'MAQLAB', text: state.lang === 'ar' ? 'تعال العب معي مقلب! 😈' : 'Come play MAQLAB with me! 😈', url }); } catch {} return; }
    try { await navigator.clipboard.writeText(url); toast(t('copied'), 'ok'); } catch { toast(url); }
  }
  let lastTyping = 0;
  function sendTyping() { const n = Date.now(); if (n - lastTyping > 1000) { lastTyping = n; socket.emit('typing'); } }

  const actions = {
    menu: openMenu, how: howTo, edit: openEditor, achievements: showAchievements,
    home: () => navigate('/'),
    retry: () => location.reload(),
    signin: () => {
      if (state.inDiscord) { toast(t('discordSignInBusy'), 'err'); return; }
      location.href = '/api/auth/discord/start';
    },
    async signout() { await post('/api/auth/logout'); state.me = null; state.isAdmin = false; state.lastKey = ''; render(); },
    profile: el => openProfile(el.dataset.uid),
    leaderboard: openLeaderboard,
    suggest: openSuggest,
    about: openAbout,
    admin: () => openAdmin(),
    async addbot() { sfx.tap(); const r = await emit('addBot'); if (r && r.error) toast(t('err_full'), 'err'); },
    async unbot(el) { sfx.tap(); await emit('removeBot', el.dataset.id); },
    'rooms-refresh'() { sfx.tap(); loadLobbies(); },
    'join-lobby'(el) {
      if (!needName()) return;
      sfx.send();
      history.pushState(null, '', `/room/${el.dataset.code}`);
      state.route = parseRoute();
      join(el.dataset.code);
    },
    makehost(el, e) {
      e.stopPropagation();
      const p = P(el.dataset.id); if (!p) return;
      confirmBox(t('confirmHost', { n: p.name }), () => emit('makeHost', p.id));
    },
    sound() { state.sound = !state.sound; store.set('sound', state.sound); render(); sfx.tap(); },
    music() { toggleMusic(); render(); },
    lang: switchLang,
    async create() {
      if (!needName()) return;
      sfx.send();
      const r = await emit('create');
      if (r.code) { history.pushState(null, '', `/room/${r.code}`); state.route = parseRoute(); join(r.code); }
    },
    'join-code'() {
      if (!needName()) return;
      const code = state.draft.code.trim().toUpperCase();
      if (!/^[A-Z]{4,5}$/.test(code)) { toast(t('needCode'), 'err'); return; }
      sfx.send(); history.pushState(null, '', `/room/${code}`); state.route = parseRoute(); join(code);
    },
    enter() { if (!needName()) return; sfx.send(); join(state.route.code); },
    'copy-code'() { try { navigator.clipboard.writeText(state.room.code); toast(t('copied'), 'ok'); } catch {} },
    copy: () => shareLink(false),
    share: () => shareLink(true),
    qr() { state.showQR = !state.showQR; render(); },
    set(el) { const k = el.dataset.k; let v = el.dataset.v; if (k === 'rounds') v = +v; sfx.tap(); emit('settings', { [k]: v }); },
    type(el) { sfx.tap(); emit('settings', { toggleType: el.dataset.k }); },
    kick(el, e) { e.stopPropagation(); const p = P(el.dataset.id); if (p) confirmBox(t('confirmKick', { n: p.name }), () => emit('kick', p.id)); },
    poke(el, e) { if (e.target.closest('[data-act="kick"]')) return actions.kick(e.target.closest('[data-act="kick"]'), e); socket.emit('poke', el.dataset.id); buzz(15); },
    start() { sfx.send(); buzz(30); emit('start'); },
    teams(el) { sfx.tap(); emit('settings', { teams: el.dataset.v === 'true' }); },
    public(el) { sfx.tap(); emit('settings', { public: el.dataset.v === 'true' }); },
    team(el) { sfx.join(); socket.emit('team', el.dataset.t); },
    ready() { const r = !(me() && me().ready); if (r) { sfx.win(); buzz([20, 30]); } else sfx.tap(); socket.emit('ready'); },
    pump() {
      socket.emit('pump');
      const size = (state.room.balloon.size || 0) + 1;
      setBalloon(size, true); tone(260 + size * 16, 0.07, 'sine', 0.05); buzz(8);
    },
    laugh(el) {
      if (el.classList.contains('on')) return;
      $app.querySelectorAll('.laugh.on').forEach(b => b.classList.remove('on'));
      el.classList.add('on');
      socket.emit('laugh', el.dataset.id);
      tone(880, 0.08, 'triangle', 0.05); tone(1100, 0.1, 'triangle', 0.05, 0.08); buzz(15);
    },
    bet(el) { state.bet = +el.dataset.b; if (state.bet === 3) { sfx.boing(); buzz(40); } else sfx.tap(); render(); },
    async vote(el) { sfx.send(); buzz(20); await emit('vote', { id: el.dataset.id, bet: state.bet }); },
    async tf(el) { sfx.send(); buzz(20); await emit('blitz', el.dataset.v === '1'); },
    async emoji(el) { sfx.send(); buzz(20); await emit('emoji', el.dataset.id); },
    async odd(el) { sfx.send(); buzz(20); await emit('odd', el.dataset.id); },
    ordpick(el) {
      const id = el.dataset.id, cur = state.draft.order;
      // Tapping something already placed takes it out and closes the gap.
      state.draft.order = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id];
      sfx.tap(); buzz(10); state.lastKey = ''; render();
    },
    ordclear() { state.draft.order = []; sfx.tap(); state.lastKey = ''; render(); },
    async ordsend() {
      const r = await emit('order', state.draft.order);
      if (r && r.error) { toast(t('err_' + r.error), 'err'); return; }
      sfx.send(); buzz(20); state.draft.order = [];
    },
    async likely(el) { sfx.send(); buzz(20); await emit('likely', el.dataset.id); },
    async spyvote(el) { sfx.send(); buzz(20); await emit('spyVote', el.dataset.id); },
    async power(el) {
      const k = el.dataset.k;
      const r = await emit('power', k);
      if (r.ok) { sfx.power(); buzz([20, 40, 20]); toast(k === 'peek' ? t('peekDone') : t('doubleDone'), 'ok'); }
    },
    next() { sfx.tap(); emit('next'); },
    again() { emit('lobby'); },
    leave: leaveRoom,
  };

  $app.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const fn = actions[el.dataset.act];
    if (fn) fn(el, e);
  });
  $app.addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target.dataset.form;
    if (f === 'lie') {
      if (!state.draft.lie.trim()) return toast(t('err_empty'), 'err');
      const inp = document.getElementById('lie');
      const r = await emit('lie', state.draft.lie);
      if (r.ok) { flyFrom(inp); buzz(20); } else document.getElementById('lie')?.classList.add('shake');
    } else if (f === 'guess') {
      if (!state.draft.guess.trim()) return toast(t('err_empty'), 'err');
      const inp = document.getElementById('guess');
      const r = await emit('guess', state.draft.guess);
      if (r.ok) { flyFrom(inp, '🎯'); buzz(20); }
    } else if (f === 'spyClue') {
      if (!state.draft.spyClue.trim()) return toast(t('err_empty'), 'err');
      const inp = document.getElementById('spyclue');
      const r = await emit('spyClue', state.draft.spyClue);
      if (r.ok) { flyFrom(inp); buzz(20); } else document.getElementById('spyclue')?.classList.add('shake');
    } else if (f === 'spyGuess') {
      if (!state.draft.spyGuess.trim()) return;
      const inp = document.getElementById('spyguess');
      const r = await emit('spyGuess', state.draft.spyGuess);
      if (r.ok) { flyFrom(inp, '🕵️'); buzz(20); render(); }
    }
  });
  $app.addEventListener('input', e => {
    const id = e.target.id;
    if (id === 'code') { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, ''); state.draft.code = e.target.value; }
    else if (id === 'lie') { state.draft.lie = e.target.value; sendTyping(); }
    else if (id === 'guess') { state.draft.guess = e.target.value; sendTyping(); }
    else if (id === 'spyclue') { state.draft.spyClue = e.target.value; sendTyping(); }
    else if (id === 'spyguess') { state.draft.spyGuess = e.target.value; }
  });
  $app.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    if (e.target.id === 'code') actions['join-code']();
  });

  // ================= boot =================
  // Inside the Activity the session rides as a bearer token: the iframe is on
  // a discordsays.com proxy origin, where our cookie may never arrive.
  function useBearer(token) {
    state.bearer = token;
    socket.auth = { token };
    if (socket.connected) socket.disconnect();
    socket.connect();
  }

  // Paint the shell straight away — the identity card renders as a skeleton
  // until the server says who we are, so nothing has to be taken back.
  onRoute();
  // The open-rooms list belongs to the home screen, which an Activity never
  // shows, so in Discord it is a request nobody was ever going to read.
  if (!IN_DISCORD) {
    loadLobbies();
    setInterval(() => { if (state.route.name === 'home' && !document.hidden) loadLobbies(); }, 15000);
  }

  getDiscordBootstrap({
    onLeave: () => { if (state.code) leaveRoom(); },
    onStage: name => { state.discordStage = name; },
  }).then(async info => {
    state.discordDone = true;
    state.lastKey = '';
    // Not in Discord: this is an ordinary web visit, so ask who we are.
    if (!info) { await loadMe(); render(); return; }
    if (info.failed) { state.discordError = info.failed; await loadMe(); render(); toast(t('discordFailed', { e: info.failed }), 'err'); return; }

    // The bootstrap already carries the answer /api/auth/me would give, and
    // it was verified against Discord on the server. Asking again here would
    // be one more round trip between the player and their lobby.
    useBearer(info.session);
    state.me = { id: info.user.id, name: info.name };
    state.meKnown = true;
    state.isAdmin = !!info.isAdmin;
    state.profile.name = info.name;
    state.draft.name = info.name;
    store.set('profile', state.profile);
    history.replaceState(null, '', `/room/${info.roomCode}`);
    state.route = parseRoute();
    join(info.roomCode);
  }).catch(async e => { state.discordDone = true; state.discordError = (e && e.message) || 'unexpected'; await loadMe(); state.lastKey = ''; render(); });
})();
