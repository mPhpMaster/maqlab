// Starting up: the Discord Activity bootstrap and the first screen.
// Split out of app.js unchanged (and still indented as it was); js/main.js runs the parts in order.
// Imported by URL rather than by name so the ?v= stamp on this module rides
// along to the next one, as it did from app.js.
const { getDiscordBootstrap } = await import('../discord.js' + new URL(import.meta.url).search);
import { IN_DISCORD, store } from './base.js';
import { state, t, toast } from './state.js';
import { join, leaveRoom, onRoute, parseRoute, render, socket } from './core.js';
import { afterSignIn, loadLobbies, loadMe } from './extras.js';

  // ================= boot =================
  // Inside the Activity the session rides as a bearer token: the iframe is on
  // a discordsays.com proxy origin, where our cookie may never arrive.
  export function useBearer(token) {
    state.bearer = token;
    socket.auth = { token };
    if (socket.connected) socket.disconnect();
    socket.connect();
  }

  // What this part sets running, called once by main.js in order.
  export function initBoot() {

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
    if (!info) { await loadMe(); render(); afterSignIn(); return; }
    if (info.failed) { state.discordError = info.failed; await loadMe(); render(); toast(t('discordFailed', { e: info.failed }), 'err'); return; }

    // The bootstrap already carries the answer /api/auth/me would give, and
    // it was verified against Discord on the server. Asking again here would
    // be one more round trip between the player and their lobby.
    useBearer(info.session);
    // Only Discord can open an outbound link from inside its own iframe.
    state.openLink = info.openLink || null;
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
  }
