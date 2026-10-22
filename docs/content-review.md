# Reviewing new questions

`npm run check:new` catches what a machine can: duplicates, a broken schema, and answers that give themselves away by length. It cannot tell whether a question is true, whether the Arabic sounds like a person wrote it, or whether a round is fun. Read every new entry against this list before it ships.

## Every entry, both languages

- **True.** The answer is correct today, and will still be correct next year. Prefer facts that do not move (the height of a mountain, not a population or a record that can be beaten). Numbers questions say their unit and what is being counted.
- **One answer.** Nobody who knows the subject could argue for a second one. For Odd One Out, only one item is out, and the reason (`why`) names the rule. For Line Them Up, no two values are close enough to argue about.
- **Same question in both languages.** The Arabic is the same question, not a translation of the words. If a fact only works in one language (a pun, a local brand), it does not go in.
- **Natural Arabic.** Read it aloud. It should sound like the rest of the game, not like a translation. Digits are always 0-9, never Arabic-Indic numerals.
- **Natural English.** The game's first language. Short sentences, no idioms a non-native player would trip on.
- **Fair for the table.** Nothing that needs one country's school curriculum, nothing about real private people, nothing a Discord server for teenagers should not show (Discord's minimum age is 13).
- **Right difficulty.** Most players should know it or be able to reason towards it. A question nobody can answer is a skipped round; one everybody knows is a dead round.

## Per mode

| Mode | Also check |
|---|---|
| The Bluff | The true answer sounds no more or less likely than a good lie. No answer a player could guess from the question's wording. |
| Closest Number | The number is exact and sourced. The range of reasonable guesses is wide enough for "closest" to mean something. |
| True or False | Roughly half true. The false ones are believable. |
| Emoji Decode | The emoji read left to right in both languages. Every wrong option is plausible. |
| Odd One Out | All four are from one category the player can find. It is also used by What Went Missing, so the items read well on their own. |
| Line Them Up | Values differ enough to order by reasoning, and the question says which way (largest first). |
| Who's Most Likely / How Many of Us | About the people in the room, never about one person. Nothing embarrassing to answer in public. |
| Name Something | Has a few obvious answers, so people can agree. |
| The Spy | The category is broad enough that the spy can bluff, the word specific enough that a good clue exists. |
| The Minority / Which is Bigger | The two sides are genuinely close, or genuinely surprising. |

## After it ships

Run `node --env-file-if-exists=.env scripts/round-report.js --since <date>` a week later. A new bank or a batch of new questions that raises a mode's skip rate, or makes its clock run out more often, is the place to look first.
