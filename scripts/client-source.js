// The client's source as one text: public/app.js and every module in
// public/js/. Tests read the code to check it against itself, and it used to
// be a single file, so this is what "app.js" means to them now.
const fs = require('fs');
const path = require('path');

const PUB = path.join(__dirname, '..', 'public');
module.exports = () => ['app.js', ...fs.readdirSync(path.join(PUB, 'js')).filter(f => f.endsWith('.js')).sort().map(f => `js/${f}`)]
  .map(f => fs.readFileSync(path.join(PUB, f), 'utf8'))
  .join('\n');
