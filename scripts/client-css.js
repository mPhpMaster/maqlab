// The page's styles as one text: style.css and every stylesheet in css/, in
// the order the page links them. Tests read the rules to check them, and it
// used to be a single file.
const fs = require('fs');
const path = require('path');

const PUB = path.join(__dirname, '..', 'public');
const html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8');
module.exports = () => [...html.matchAll(/<link rel="stylesheet" href="\/([\w/-]+\.css)">/g)]
  .map(m => fs.readFileSync(path.join(PUB, m[1]), 'utf8'))
  .join('\n');
