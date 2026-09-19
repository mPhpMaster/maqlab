// Discord Activity bootstrap. A no-op everywhere except when launched inside
// Discord's iframe (signalled by a `frame_id` query param Discord injects).
// Normal web visitors never pay for any of this — getDiscordBootstrap()
// resolves to null immediately for them.

const SDK_URL = 'https://cdn.jsdelivr.net/npm/@discord/embedded-app-sdk@2.5.0/+esm';

export async function getDiscordBootstrap() {
  const params = new URLSearchParams(location.search);
  if (!params.has('frame_id')) return null;

  try {
    const { clientId } = await fetch('/api/discord/config').then(r => r.json());
    if (!clientId) return null;

    const { DiscordSDK } = await import(/* webpackIgnore: true */ SDK_URL);
    const discordSdk = new DiscordSDK(clientId);
    await discordSdk.ready();

    const { code } = await discordSdk.commands.authorize({
      client_id: clientId,
      response_type: 'code',
      state: '',
      prompt: 'none',
      scope: ['identify'],
    });

    const { access_token } = await fetch('/api/discord/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    }).then(r => r.json());
    if (!access_token) return null;

    const auth = await discordSdk.commands.authenticate({ access_token });
    const name = (auth?.user?.global_name || auth?.user?.username || 'Player').slice(0, 14);

    const { code: roomCode } = await fetch('/api/discord/room', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instanceId: discordSdk.instanceId }),
    }).then(r => r.json());
    if (!roomCode) return null;

    return { name, roomCode };
  } catch (e) {
    console.error('Discord Activity bootstrap failed, falling back to normal web flow', e);
    return null;
  }
}
