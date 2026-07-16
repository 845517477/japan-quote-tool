const fs = require('fs');
const path = require('path');

const dir = __dirname;
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const jsonRaw = fs.readFileSync(path.join(dir, 'hs_data.json'), 'utf8');

// Validate JSON
const data = JSON.parse(jsonRaw);
const jsonStr = JSON.stringify(data);

// 1) Replace the empty declaration with embedded data
const declRe = /var hsData = \{\};/;
if (!declRe.test(html)) {
  console.error('ERROR: var hsData = {}; not found');
  process.exit(1);
}
let out = html.replace(declRe, 'var hsData = ' + jsonStr + ';');

// 2) Remove the loadHsData() fetch function + call and replace with a no-op
const fnRe = /function loadHsData\(\)\s*\{[\s\S]*?loadHsData\(\);/;
if (!fnRe.test(out)) {
  console.error('ERROR: loadHsData block not found');
  process.exit(1);
}
out = out.replace(fnRe, '// HS data is embedded inline; no network load needed (offline standalone build)');

// 3) Sanity: no remaining fetch('/hs_data') reference
if (/fetch\(['"]hs_data\.json['"]\)/.test(out)) {
  console.error('ERROR: stray hs_data.json fetch still present');
  process.exit(1);
}

const outPath = path.join(dir, 'standalone_offline.html');
fs.writeFileSync(outPath, out, 'utf8');
console.log('Wrote', outPath, '(' + out.length + ' chars)');
console.log('Embedded HS records (top-level codes):', Object.keys(data).length);
