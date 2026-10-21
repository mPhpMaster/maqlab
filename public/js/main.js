// The page. Every module in js/ only declares things; what each one sets
// running (listeners, socket handlers, timers, the first screen) is started
// here, in the order it ran in when this was one file.
import { initState } from './state.js';
import { initCore } from './core.js';
import { initRoundsB } from './rounds-b.js';
import { initExtras } from './extras.js';
import { initActions } from './actions.js';
import { initBoot } from './boot.js';

initState();
initCore();
initRoundsB();
initExtras();
initActions();
initBoot();
