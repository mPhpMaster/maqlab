// A signed session for tests. Playing requires a Discord sign-in and there is
// no other way in, so a test that joins a room needs a token the server will
// accept. It is minted with the same secret the server uses, which only works
// when both run in one process or share SESSION_SECRET.
const auth = require('../../auth');

const session = (id = 'test-1', name = 'Tester') => auth.mint({ id, name });

// The two places the server reads a session from: the socket handshake (as the
// Discord Activity sends it) and a request's headers.
const socketAuth = (id, name) => ({ token: session(id, name) });
const bearer = (id, name) => ({ authorization: `Bearer ${session(id, name)}` });

module.exports = { session, socketAuth, bearer };
