const fs = require('fs');
const path = require('path');

const indexPath = path.resolve('index.html');
const blockPath = path.resolve('scratch/replacement_block.txt');

let indexContent = fs.readFileSync(indexPath, 'utf8');
const replacementBlock = fs.readFileSync(blockPath, 'utf8');

const startMarker = '    // 9. 공식 출처 기반 검증 기체 DB (VERIFIED_DRONE_MODELS)';
const endMarker = '    // 19. 앱 시작 경량 초기화 (자동 WFS/Weather 호출 배제)';

const startIndex = indexContent.indexOf(startMarker);
const endIndex = indexContent.indexOf(endMarker);

if (startIndex === -1 || endIndex === -1) {
  console.error("Markers not found! startIndex:", startIndex, "endIndex:", endIndex);
  process.exit(1);
}

// Backup current index.html first
fs.writeFileSync(path.resolve('scratch/index.html.bak'), indexContent, 'utf8');

const updatedContent = indexContent.slice(0, startIndex) + replacementBlock + indexContent.slice(endIndex);
fs.writeFileSync(indexPath, updatedContent, 'utf8');

console.log("Successfully replaced sections 9 to 18 in index.html!");
