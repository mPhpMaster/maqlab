// Discord Activity bootstrap. A no-op everywhere except when launched inside
// Discord's iframe (signalled by a `frame_id` query param Discord injects).
// Normal web visitors never pay for any of this — getDiscordBootstrap()
// resolves to null immediately for them.

// Served from our own origin on purpose. Inside the Activity iframe Discord
// only allows requests to the mapped domain, so a direct import from a CDN is
// blocked and the whole bootstrap dies before it starts — which is what left
// players staring at "signing you in". The bundle is self-contained.
const SDK_URL = '/vendor/embedded-app-sdk.js';

// A step that never settles is worse than one that fails: the player just
// watches a message forever and nothing reaches the server logs. Every stage
// is named and capped, so a hang becomes a reportable error.
const STAGE_TIMEOUT_MS = 20000;
const stage = (name, p, report) => {
  report && report(name);
  return Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`timed out at: ${name}`)), STAGE_TIMEOUT_MS)),
  ]);
};

export async function getDiscordBootstrap({ onLeave, onStage } = {}) {
  const params = new URLSearchParams(location.search);
  if (!params.has('frame_id')) return null;

  try {
    // Our config and the SDK bundle have nothing to say to each other, so
    // they load side by side instead of one after the other.
    const [{ clientId }, { DiscordSDK }] = await stage('start', Promise.all([
      fetch('/api/discord/config').then(r => r.json()),
      import(/* webpackIgnore: true */ SDK_URL),
    ]), onStage);
    if (!clientId) return null;

    const discordSdk = new DiscordSDK(clientId);
    await stage('ready', discordSdk.ready(), onStage);

    // The room is keyed by the activity instance and nothing else, so it has
    // no reason to queue behind signing in. Started now, collected at the end:
    // by then it has almost always already arrived.
    const roomP = fetch('/api/discord/room', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instanceId: discordSdk.instanceId }),
    }).then(r => r.json());

    const { code } = await stage('authorize', discordSdk.commands.authorize({
      client_id: clientId,
      response_type: 'code',
      state: '',
      prompt: 'none',
      scope: ['identify'],
    }), onStage);

    // The server exchanges the code, checks who it belongs to with Discord,
    // and hands back a session of ours. Without that session the player is a
    // stranger to the game even though Discord knows exactly who they are.
    const { access_token, session, user, isAdmin } = await stage('token', fetch('/api/discord/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    }).then(r => r.json()), onStage);
    if (!access_token || !session) return null;

    // The server already told us the authoritative name, trimmed by code point
    // so an emoji in a Discord name is never cut in half.
    const raw = (user && user.name) || 'Player';
    const name = [...raw.replace(/\s+/g, ' ').trim()].slice(0, 14).join('').trim() || 'Player';

    // Leaving the voice channel should leave the lobby too, otherwise the
    // player sits in the room as a ghost until the iframe finally dies.
    // Discord hands every client the full participant list, but we only ever
    // act on our OWN absence from it — a client that could evict other people
    // would be a griefing tool, and the host already has a kick button.
    //
    // None of this is needed to get into the room, so it settles in the
    // background rather than holding the player on a loading screen.
    if (user && user.id && onLeave) {
      discordSdk.commands.authenticate({ access_token })
        .then(() => discordSdk.subscribe('ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE', ({ participants }) => {
          if (Array.isArray(participants) && !participants.some(u => u && u.id === user.id)) onLeave();
        }))
        // Older Discord clients do not emit this; the socket disconnect that
        // follows when the window closes still cleans the player up.
        .catch(e => console.warn('participant updates unavailable', e && e.message));
    }

    const { code: roomCode } = await stage('room', roomP, onStage);
    if (!roomCode) return null;

    return { name, roomCode, session, user, isAdmin };
  } catch (e) {
    // Inside the iframe there is no web flow to fall back to, so say what
    // broke instead of leaving the player on a screen that never resolves.
    console.error('Discord Activity bootstrap failed', e);
    return { failed: (e && e.message) || 'unknown error' };
  }
}
