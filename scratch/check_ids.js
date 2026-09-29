const fs = require('fs');
const content = fs.readFileSync('index.html', 'utf8');
const idRegex = /\bid=["']([^"']+)["']/g;
const ids = {};
let match;
const duplicates = [];
while ((match = idRegex.exec(content)) !== null) {
  const id = match[1];
  if (ids[id]) {
    duplicates.push(id);
  } else {
    ids[id] = 1;
  }
}
console.log('Total unique IDs:', Object.keys(ids).length);
console.log('Duplicates (' + duplicates.length + '):', duplicates);
if (duplicates.length > 0) process.exit(1);
