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
    const { clientId } = await stage('config', fetch('/api/discord/config').then(r => r.json()), onStage);
    if (!clientId) return null;

    const { DiscordSDK } = await stage('sdk', import(/* webpackIgnore: true */ SDK_URL), onStage);
    const discordSdk = new DiscordSDK(clientId);
    await stage('ready', discordSdk.ready(), onStage);

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
    const { access_token, session, user } = await stage('token', fetch('/api/discord/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    }).then(r => r.json()), onStage);
    if (!access_token || !session) return null;

    const auth = await stage('authenticate', discordSdk.commands.authenticate({ access_token }), onStage);
    // The server already told us the authoritative name; the SDK call is what
    // actually opens the Activity, and its user object is only a fallback.
    // Trimmed by code point, so an emoji in a Discord name is never cut in half.
    const raw = user?.name || auth?.user?.global_name || auth?.user?.username || 'Player';
    const name = [...raw.replace(/\s+/g, ' ').trim()].slice(0, 14).join('').trim() || 'Player';

    // Leaving the voice channel should leave the lobby too, otherwise the
    // player sits in the room as a ghost until the iframe finally dies.
    // Discord hands every client the full participant list, but we only ever
    // act on our OWN absence from it — a client that could evict other people
    // would be a griefing tool, and the host already has a kick button.
    const meId = (user && user.id) || (auth && auth.user && auth.user.id);
    if (meId && onLeave) {
      try {
        await discordSdk.subscribe('ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE', ({ participants }) => {
          if (Array.isArray(participants) && !participants.some(u => u && u.id === meId)) onLeave();
        });
      } catch (e) {
        // Older Discord clients do not emit this; the socket disconnect that
        // follows when the window closes still cleans the player up.
        console.warn('participants updates unavailable', e && e.message);
      }
    }

    const { code: roomCode } = await stage('room', fetch('/api/discord/room', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instanceId: discordSdk.instanceId }),
    }).then(r => r.json()), onStage);
    if (!roomCode) return null;

    return { name, roomCode, session };
  } catch (e) {
    // Inside the iframe there is no web flow to fall back to, so say what
    // broke instead of leaving the player on a screen that never resolves.
    console.error('Discord Activity bootstrap failed', e);
    return { failed: (e && e.message) || 'unknown error' };
  }
}
