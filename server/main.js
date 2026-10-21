// The game server. Each module in this folder only declares things: the
// routes, the socket handlers, the timers and listening are set up by these
// calls, in this order, so the order Express registers middleware and routes
// in is written here rather than left to which module happens to load first.
// (Error handling has to come after every route, and the body parser before.)
import { attachSockets } from './sockets.js';
import { registerPages } from './http-pages.js';
import { registerAccounts } from './http-accounts.js';
import { registerAdmin } from './http-admin.js';
import { start } from './boot.js';

attachSockets();
registerPages();
registerAccounts();
registerAdmin();
start();
