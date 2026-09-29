const fs = require('fs');
const content = fs.readFileSync('index.html', 'utf8');
const lines = content.split('\n');
lines.forEach((l, i) => {
  if (l.includes('permitReview') || l.includes('permitEval') || l.includes('renderPermitReview') || l.includes('reviewCard') || l.includes('종합 검토')) {
    if (i > 1850) {
      console.log((i+1) + ': ' + l.trim());
    }
  }
});
