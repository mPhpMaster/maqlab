// The server's source as one text: server.js and every module in server/.
// Tests and the round report read the code to check it against itself, and
// it used to be a single file, so this is what "server.js" means to them now.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
module.exports = () => ['server.js', ...fs.readdirSync(path.join(ROOT, 'server')).filter(f => f.endsWith('.js')).sort().map(f => `server/${f}`)]
  .map(f => fs.readFileSync(path.join(ROOT, f), 'utf8'))
  .join('\n');
