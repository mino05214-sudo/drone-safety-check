const fs = require('fs');
const content = fs.readFileSync('index.html', 'utf8');
const lines = content.split('\n');
lines.forEach((l, i) => {
  if (l.includes('종합') || l.includes('검토') || l.includes('승인 준비 완료') || l.includes('충족')) {
    if (i > 1500 && i < 1850) {
      console.log((i+1) + ': ' + l.trim());
    }
  }
});
