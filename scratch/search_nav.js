const fs = require('fs');
const lines = fs.readFileSync('index.html', 'utf8').split('\n');
lines.forEach((l, i) => {
  if (l.includes('<nav') || l.includes('id="view-') || l.includes('class="nav-btn') || l.includes('switchTab(')) {
    console.log((i + 1) + ': ' + l.trim());
  }
});
