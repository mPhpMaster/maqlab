// The whole schema, as the database ends up with it: every migration in order.
const fs = require('node:fs');
const path = require('node:path');

const dir = path.join(__dirname, '..', '..', 'db', 'migrations');
module.exports = () => fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort()
  .map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
