/**
 * _obfuscate.js - 商业敏感数值混淆工具
 * 把 calc() 里的关键固定数值（运费率、手续费、税率、汇率等）编码为乱码字符串
 * 运行时通过 d(key) 函数自动还原
 */
const fs = require('fs');
const path = require('path');

const KEY = 0x5A; // XOR key（1字节，0-255均可）

// 把数值用 base64 + XOR 双重编码
function encode(val) {
  // 浮点数 → JSON字符串 → Buffer → base64
  const b64 = Buffer.from(JSON.stringify(val)).toString('base64');
  // XOR 混淆
  let xored = '';
  for (let i = 0; i < b64.length; i++) {
    xored += String.fromCharCode(b64.charCodeAt(i) ^ KEY);
  }
  return Buffer.from(xored).toString('base64');
}

function decode(encoded) {
  const xored = Buffer.from(encoded, 'base64').toString('binary');
  let b64 = '';
  for (let i = 0; i < xored.length; i++) {
    b64 += String.fromCharCode(xored.charCodeAt(i) ^ KEY);
  }
  return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
}

// === 预先生成所有编码值 ===
const secrets = {
  // 汇率
  CNY_TO_JPY: encode(23.8794),
  USD_TO_CNY: encode(1 / 0.1472),
  // 税率
  SERVICE_FEE_RATE: encode(0.03),       // 手续费 3%
  CONSUMPTION_TAX: encode(0.078),       // 消费税 7.8%
  LOCAL_TAX_RATIO: encode(22 / 78),     // 地方消费税比例
  // 运费（元/kg）
  MODE_RATES: encode([7, 12.5, 16]),    // 售价模式
  COST_RATES: encode([6, 10, 13.5]),   // 成本模式
  // 超长超重加成（元/kg）
  OVERSIZE_RATES: encode([0.5, 1.5, 2.5]),
};

// 输出解码函数 + 预定义常量
const injection = `
// === 运行时解码（商业敏感值已混淆）===
var _k = ${KEY};
function d(s) {
  var x = '';
  var b = Buffer.from(s, 'base64').toString('binary');
  for (var i = 0; i < b.length; i++) x += String.fromCharCode(b.charCodeAt(i) ^ _k);
  return JSON.parse(Buffer.from(x, 'base64').toString('utf8'));
}
var CNY_TO_JPY    = d('${secrets.CNY_TO_JPY}');
var USD_TO_CNY    = d('${secrets.USD_TO_CNY}');
var SERVICE_FEE_RATE = d('${secrets.SERVICE_FEE_RATE}');
var CONSUMPTION_TAX  = d('${secrets.CONSUMPTION_TAX}');
var LOCAL_TAX_RATIO  = d('${secrets.LOCAL_TAX_RATIO}');
var MODE_RATES       = d('${secrets.MODE_RATES}');
var COST_RATES       = d('${secrets.COST_RATES}');
var OVERSIZE_RATES   = d('${secrets.OVERSIZE_RATES}');
`;

// === 读取并修改 index.html ===
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

// 1. 把汇率声明改为注释（改为运行时注入）
let out = html
  .replace(
    "// 转换公式：JPY→CNY = JPY / 23.8794，USD→CNY = 6.793（1/0.1472）\nvar RATES = { CNY: 23.8794 };",
    "// [混淆保护] RATES 由 d() 注入，见下方 injection"
  )
  // 2. calc() 中的固定税率替换为 d() 调用
  .replace(/\* 0\.03(?!\d)/g, '* SERVICE_FEE_RATE')         // * 0.03
  .replace(/0\.078(?!\d)/g, 'CONSUMPTION_TAX')              // 0.078
  .replace(/\(22 \/ 78\)/g, 'LOCAL_TAX_RATIO')              // (22/78)
  // 3. 运费数组改为引用
  .replace(/var costRates = \[6, 10, 13\.5\];/, 'var costRates = COST_RATES;')
  .replace(/var costRates = COST_RATES;/g, 'var costRates = COST_RATES;')
  // 4. calc() 中的 CNY_TO_JPY / USD_TO_CNY 引用已在 calc() 内定义，跳过
  // 5. calc() 里重新定义的 CNY_TO_JPY / USD_TO_CNY 变量名冲突 → 注释掉（已在全局注入）
  .replace(
    /  var CNY_TO_JPY = 23\.8794;\n  var USD_TO_CNY = 1 \/ 0\.1472;/,
    '  // [混淆保护] CNY_TO_JPY / USD_TO_CNY 已全局注入'
  )
  // 6. 超长超重加成（后续如需添加）

// 6. 在 <script> 标签开头插入解码逻辑（紧接第一个 <script> 之后）
out = out.replace(/(<script>)/, '$1\n' + injection);

// 7. 安全增强：禁止右键、F12、Ctrl+U 查看源代码
const antiTheft = `
// === 防复制保护 ===
document.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('keydown', e => {
  if (e.ctrlKey && (e.key === 'u' || e.key === 'U')) e.preventDefault();
  if (e.key === 'F12') e.preventDefault();
});
// 防开发者工具检测（简单版）
(function() {
  var _w = window.innerWidth, _h = window.innerHeight;
  setInterval(function() {
    if (window.innerWidth !== _w || window.innerHeight !== _h) {
      document.body.innerHTML = '<p style="text-align:center;margin-top:40vh;font-size:24px;color:#999">请使用正常浏览器访问</p>';
    }
  }, 1000);
})();
`;

out = out.replace('</body>', antiTheft + '</body>');

// 验证语法
const scripts = out.match(/<script>([\s\S]*?)<\/script>/g) || [];
const jsAll = scripts.map(s => s.replace(/<\/?script>/g, '')).join('\n');
try {
  new Function(jsAll);
  console.log('JS syntax OK');
} catch(e) {
  console.error('JS ERR:', e.message);
  process.exit(1);
}

// 写文件
const outPath = path.join(__dirname, 'index.html');
fs.writeFileSync(outPath, out, 'utf8');
console.log('Done. Written to', outPath);

// 打印摘要
console.log('\n--- 已混淆的敏感值 ---');
console.log('汇率 CNY→JPY:', secrets.CNY_TO_JPY.substring(0, 20) + '...');
console.log('手续费率:', secrets.SERVICE_FEE_RATE);
console.log('消费税率:', secrets.CONSUMPTION_TAX);
console.log('地方消费税率:', secrets.LOCAL_TAX_RATIO);
console.log('运费售价:', secrets.MODE_RATES);
console.log('运费成本:', secrets.COST_RATES);
console.log('\n混淆后源码示例（以汇率为例）：');
console.log('原文: var RATES = { CNY: 23.8794 };');
console.log('混淆: CNY_TO_JPY = d(\'' + secrets.CNY_TO_JPY + '\');');
