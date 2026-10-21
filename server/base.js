// Libraries, the HTTP and socket servers, and the constants every other part reads.
// Split out of server.js unchanged; see server/main.js for the order things start in.

import fs from 'fs';
import path from 'path';
import http from 'http';
import crypto from 'crypto';
import express from 'express';
import QRCode from 'qrcode';
import { Server } from 'socket.io';
import content from '../content.js';
// Totalled once at boot: it is the one number that moves when the banks
// change, and nothing else a deploy of pure content would reveal.
export const contentCount = Object.values(content).reduce((n, b) => n + (Array.isArray(b) ? b.length : 0), 0);
import db from '../db.js';
import auth from '../auth.js';
import achievements from '../achievements.js';
import textModule from '../text.js';
export const { matchAnswerCase } = textModule;
import hostq from '../hostq.js';
import card from '../card.js';
import seen from '../seen.js';
import plan from '../plan.js';
import bots from '../bots.js';
import replay from '../replay.js';
import persist from '../persist.js';
import progress from '../progress.js';
import { fileURLToPath } from 'url';
import { connected } from './helpers.js';

// The repository root: the modules live one level down, in server/.
export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export { fs, path, http, crypto, express, QRCode, Server, content, db, auth, achievements, hostq, card, seen, plan, bots, replay, persist, progress };

export const PORT = process.env.PORT || 3000;
export const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || '';
export const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || '';
export const app = express();
export const server = http.createServer(app);
// 64KB is far above any legitimate payload here (a lie is capped at 50
// characters) and well below what it takes to hurt the process.
export const io = new Server(server, { maxHttpBufferSize: 64 * 1024 });

export const MAX_PLAYERS = 12;
// Rooms held at once. A room is a few hundred KB at most, so this is a small
// share of the free plan's 512 MB, and it is far above any real evening; a
// room with nobody in it is reaped after five minutes anyway.
export const MAX_ROOMS = 300;
export const roomsFull = () => rooms.size >= MAX_ROOMS;
// The per-socket flood guard: a refill rate, a burst, and how many dropped
// packets in a row before the socket is cut off.
export const EVENT_RATE = 20;
export const EVENT_BURST = 40;
export const FLOOD_DISCONNECT = 200;
export const OBJECT_PAYLOADS = new Set(['join', 'settings', 'vote', 'two']);
// Every event that is an answer or a power, which a watcher may not send.
export const ANSWER_EVENTS = new Set(['lie', 'vote', 'guess', 'blitz', 'emoji', 'odd', 'order', 'likely', 'power', 'spyClue', 'spyVote', 'spyGuess',
  'minor', 'higher', 'miss', 'two', 'twoGuess', 'name', 'many', 'manyGuess', 'stuck']);
export const GHOST_MS = 25 * 1000; // grace for a lobby refresh before the seat is freed
export const ROOM_TTL_MS = 30 * 60 * 1000;
export const ITEMS_PER_QUICK_ROUND = 3; // blitz & emoji rounds have 3 quick items
export const REACTIONS = ['😂', '🔥', '😱', '👏', '🤡', '💀', '😈', '❤️'];
export const TYPES = ['bluff', 'number', 'blitz', 'likely', 'emoji', 'odd', 'order', 'spy', 'many', 'name', 'two', 'minor', 'higher', 'missing'];
export const ACTIVE = ['write', 'vote', 'guess', 'blitz', 'likelyVote', 'emoji', 'odd', 'order', 'spyClue', 'spyVote', 'manyAsk', 'manyGuess', 'nameWrite', 'twoWrite', 'twoGuess', 'minorPick', 'higherPick', 'missPick'];
export const PHRASES = 12; // number of preset taunts the client knows

export const T = {
  chill: { spin: 6, write: 70, vote: 35, guess: 35, blitz: 10, blitzResult: 3.5, numReveal: 9, scores: 12, likelyVote: 30, likelyReveal: 9, emoji: 15, emojiResult: 3.5, odd: 18, oddResult: 4.5, order: 50, orderResult: 11, spyClue: 50, spyVote: 30, spyReveal: 10, manyAsk: 22, manyGuess: 26, manyReveal: 11, nameWrite: 45, nameReveal: 12, twoWrite: 95, twoGuess: 24, twoResult: 7, minorPick: 22, minorReveal: 10, higherPick: 20, higherReveal: 9, missWatch: 7, missPick: 16, missReveal: 8 },
  normal: { spin: 6, write: 45, vote: 25, guess: 25, blitz: 8, blitzResult: 3, numReveal: 8, scores: 10, likelyVote: 20, likelyReveal: 8, emoji: 10, emojiResult: 3, odd: 13, oddResult: 4, order: 38, orderResult: 10, spyClue: 35, spyVote: 20, spyReveal: 9, manyAsk: 16, manyGuess: 20, manyReveal: 9, nameWrite: 32, nameReveal: 10, twoWrite: 80, twoGuess: 18, twoResult: 6, minorPick: 16, minorReveal: 9, higherPick: 15, higherReveal: 8, missWatch: 6, missPick: 12, missReveal: 7 },
  fast: { spin: 5.5, write: 30, vote: 15, guess: 15, blitz: 5, blitzResult: 2.5, numReveal: 7, scores: 8, likelyVote: 14, likelyReveal: 7, emoji: 7, emojiResult: 2.5, odd: 9, oddResult: 3, order: 24, orderResult: 8, spyClue: 22, spyVote: 13, spyReveal: 7, manyAsk: 11, manyGuess: 14, manyReveal: 7, nameWrite: 22, nameReveal: 8, twoWrite: 60, twoGuess: 13, twoResult: 5, minorPick: 11, minorReveal: 7, higherPick: 10, higherReveal: 7, missWatch: 5, missPick: 9, missReveal: 6 },
};
export const MODS = [
  { id: 'normal', w: 50, mult: 1 },
  { id: 'double', w: 20, mult: 2 },
  { id: 'speed', w: 15, mult: 1.5 },
  { id: 'jackpot', w: 15, mult: 1 },
];

// How many people a mode needs to make sense. Voting on "who among us" with
// two players is not a vote, and a spy round needs a spy plus a few civilians.
// "How many of us" needs a group worth counting: with two people the
// answer is nearly given away by your own.
// Name Something scores you for everyone who wrote what you wrote, so alone
// there is nobody to agree with.
// Four for Name Something, not three: measured against the real bank, three
// players leave 38% of rounds with nobody matching anybody at all. And that
// measurement is generous — it assumes everyone reaches for one of the few
// obvious answers, which real players do not. At four it drops to 10%.
// Two Truths needs a writer plus people to fool; at two it is one person
// guessing one person, with no crowd to hide the lie in.
// The minority needs a crowd to be a minority of: with two players every
// split is even, and an even split pays nobody.
export const MIN_PLAYERS = { likely: 3, spy: 4, many: 3, name: 4, two: 3, minor: 3 };
// The plan is drawn once at kickoff, but people leave mid-game. Before a round
// starts, deal with a mode the room has shrunk below.
//
// This used to pick a random playable mode instead, which quietly threw away
// the one guarantee the planner exists to give: measured over 20,000 games,
// a room of two played some mode five times while others never came up at
// all. plan.pickRound trades the round with a later one in the same plan, so
// nothing is invented and no count moves. Only when no later round fits
// either is the list genuinely exhausted, and then the repeat is the mode
// that has been waiting longest.
//
// The chosen type is written back, because room.plan doubles as the record of
// what this game actually played.
export function roundType(room) {
  const i = room.round - 1;
  const n = connected(room).length;
  const ok = t => !!room.settings.types[t] && n >= (MIN_PLAYERS[t] || 1);
  // Falling back on 'bluff' is how an unchecked mode got played: a host who
  // leaves only Name Something on and plays with two people cannot have it,
  // and the round became a Bluff they had switched off. The last resort is
  // one of their own choices, undersized, which is at least the game they
  // asked for — and the lobby now says which modes need a bigger table.
  const chosen = TYPES.filter(t => room.settings.types[t]);
  const got = plan.pickRound(room.plan, i, ok)
    || plan.leastPlayed(room.plan.slice(0, i), TYPES.filter(ok))
    || plan.leastPlayed(room.plan.slice(0, i), chosen)
    || 'bluff';
  room.plan[i] = got;
  return got;
}

export const rooms = new Map();

// Failed joins per IP. Codes are ~8M now, but this makes sweeping them pointless
// rather than merely slow, and costs a legitimate player nothing.
export const joinFails = new Map();
export const JOIN_WINDOW_MS = 60 * 1000;
export const JOIN_MAX_FAILS = 20;
export function joinBlocked(ip) {
  const rec = joinFails.get(ip);
  if (!rec) return false;
  if (Date.now() - rec.since > JOIN_WINDOW_MS) { joinFails.delete(ip); return false; }
  return rec.n >= JOIN_MAX_FAILS;
}
export function noteJoinFail(ip) {
  const rec = joinFails.get(ip);
  if (!rec || Date.now() - rec.since > JOIN_WINDOW_MS) joinFails.set(ip, { n: 1, since: Date.now() });
  else rec.n += 1;
}
export const discordInstanceRooms = new Map(); // Discord Activity instanceId -> room code, so a whole voice channel lands in one room
