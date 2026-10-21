// The page's entry point. The code is in js/, one module per part, and
// js/main.js starts them in order. The server adds the current ?v= stamp to
// every import it sends, so Discord's proxy cannot serve a stale module next
// to a fresh one.
import './js/main.js';
