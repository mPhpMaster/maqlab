# assets

Files the **server** needs at runtime, as opposed to `public/`, which is what
browsers fetch.

## Cairo-Bold.ttf

Cairo Bold, from Google Fonts, under the SIL Open Font License 1.1 — which is
why it can be committed and shipped rather than fetched at boot.

It is here for one job: drawing the share image for a finished match
(`card.js`). The browser loads its fonts from a CDN, but the rasteriser runs on
the server, and Render's container has no Arabic font at all — without this
file every Arabic name on the card renders as empty boxes.

One file covers both scripts, and it is the same family the legal pages
already use for Arabic.
