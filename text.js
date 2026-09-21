// Text rules that have to hold identically in the game and in its tests.
// server.js opens a listener the moment it is required, so anything a test
// needs to check directly has to live outside it.

// Every authored answer in the English bank starts with a capital, so a lie
// typed in lower case announces itself as a lie before anyone has thought
// about it. Only the case of the first letter is touched — the words stay
// exactly as the player wrote them — and Arabic has no case to match.
//
// iPhone and eBay are spelled that way on purpose. Capitalising them would be
// a louder tell than the one being removed, so a first word that already
// carries a capital of its own is left alone.
const matchAnswerCase = (text, lang) => {
  if (lang !== 'en') return text;
  if (/\p{Lu}/u.test(String(text).split(' ')[0].slice(1))) return text;
  return String(text).replace(/^\p{Ll}/u, c => c.toUpperCase());
};

module.exports = { matchAnswerCase };
