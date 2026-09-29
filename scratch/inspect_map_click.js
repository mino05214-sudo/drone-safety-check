const fs = require('fs');
const content = fs.readFileSync('index.html', 'utf8');
const lines = content.split('\n');
lines.forEach((l, i) => {
  if (l.includes("map.on('click'") || 
      l.includes('onEachFeature') || 
      l.includes('bubblingMouseEvents') || 
      l.includes('stopPropagation') || 
      l.includes('handleMapClick') ||
      l.includes('executePendingLocationJudge') ||
      l.includes('locActionBtnArea')) {
    console.log((i + 1) + ': ' + l.trim());
  }
});
