const fs = require('fs');
const path = require('path');
const dir = __dirname;
const file = path.join(dir, 'index.html');

const buf = fs.readFileSync(file);
let text;
if (buf[0] === 0xFF && buf[1] === 0xFE) {
  // UTF-16LE with BOM
  text = buf.slice(2).toString('utf16le');
  console.log('Detected UTF-16LE (BOM), converting to UTF-8');
} else if (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
  // UTF-8 with BOM
  text = buf.slice(3).toString('utf8');
  console.log('Detected UTF-8 BOM, stripping');
} else {
  text = buf.toString('utf8');
  console.log('No BOM, assuming UTF-8');
}

// Write as clean UTF-8 (no BOM) — matches <meta charset="UTF-8">
fs.writeFileSync(file, text, 'utf8');
console.log('Wrote UTF-8 index.html:', text.length, 'chars');

// sanity: confirm key markers survived
console.log('has currency fix:', /货值币种统一转换/.test(text));
console.log('has hsData decl:', /var hsData = \{\};/.test(text));
console.log('has loadHsData:', /function loadHsData/.test(text));
