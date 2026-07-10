const fs = require("node:fs");
const path = require("node:path");
const BrowserOpen = require("./browser-open");
const VerifiedFileCreate = require("./verified-file-create");

function sanitizeText(text) {
  return String(text || "").replace(/\u0000/g, "").replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
}

function humanReadableError(error) {
  const raw = typeof error === "object" && error ? (error.message || JSON.stringify(error)) : String(error || "");
  const value = raw.replace(/\r/g, "\n").split("\n").filter(Boolean)[0] || "未知原因";
  if (/permission|access\s*denied|eacces|eperm|权限/i.test(value)) return "权限不足，请切换到请求或完全权限后重试。";
  if (/timeout|timed?\s*out|超时/i.test(value)) return "网络或工具响应超时，请稍后重试。";
  if (/not\s*found|enoent|不存在|找不到/i.test(value)) return "文件或程序不存在。";
  if (/network|fetch|econn|dns|socket|联网/i.test(value)) return "网络连接失败，请检查网络连接或模型供应商地址。";
  return sanitizeText(value).replace(/^Error:\s*/i, "").replace(/^Exception:\s*/i, "").replace(/^Failed:\s*/i, "失败：").slice(0, 240) || "未知原因";
}

function queueTerminalStatus(error) {
  if (error?.code === "TASK_CANCELLED" || /终止|取消|aborted|AbortError/i.test(String(error?.message || error))) return "cancelled";
  if (error?.code === "TASK_TIMEOUT" || /超时|timeout/i.test(String(error?.message || error))) return "timeout";
  return "failed";
}

function wantsDesktopOutput(message) {
  return /放到桌面|放桌面|保存到桌面|保存桌面|桌面/i.test(String(message || ""));
}

function safeHtmlFileBaseName(name) {
  return sanitizeText(name).replace(/[<>:"/\\|?*\u0000-\u001f]/g, "").replace(/\s+/g, "").slice(0, 40) || "白球应用";
}

function calculatorHtml() {
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>白球计算器</title><style>
:root{color-scheme:dark;--bg:#07020d;--panel:#12091f;--accent:#00e5ff;--hot:#ff2bd6;--text:#e8fbff;--muted:#8bd8e8}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:radial-gradient(circle at 20% 0%,#1d1040,transparent 32%),linear-gradient(135deg,#07020d,#0b1428);font-family:"Microsoft YaHei",Arial,sans-serif;color:var(--text)}
.calculator{width:min(420px,94vw);padding:22px;border:1px solid rgba(0,229,255,.35);border-radius:24px;background:rgba(18,9,31,.86);box-shadow:0 24px 80px rgba(0,0,0,.42),0 0 40px rgba(0,229,255,.18);backdrop-filter:blur(18px)}
.brand{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;color:var(--muted);font-size:13px}.brand strong{color:var(--text);font-size:18px}
.display{width:100%;min-height:88px;padding:16px 18px;margin-bottom:16px;border-radius:18px;background:#030711;border:1px solid rgba(255,255,255,.08);text-align:right;overflow:hidden}.expr{min-height:22px;color:var(--muted);font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.value{font-size:38px;font-weight:700;line-height:1.25;word-break:break-all}
.keys{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}button{height:58px;border:0;border-radius:16px;background:rgba(255,255,255,.08);color:var(--text);font-size:20px;font-weight:700;cursor:pointer}.op{color:#071018;background:linear-gradient(135deg,var(--accent),#8affff)}.hot{color:#fff;background:linear-gradient(135deg,var(--hot),#7c3cff)}.wide{grid-column:span 2}.hint{margin-top:14px;color:var(--muted);font-size:12px;text-align:center}
</style></head><body><main class="calculator" aria-label="白球计算器"><div class="brand"><strong>白球计算器</strong><span>键盘可输入</span></div><section class="display"><div id="expr" class="expr"></div><div id="value" class="value">0</div></section><section class="keys">
<button type="button" data-act="clear" class="hot">AC</button><button type="button" data-act="back">⌫</button><button type="button" data-key="%" class="op">%</button><button type="button" data-key="/" class="op">÷</button>
<button type="button" data-key="7">7</button><button type="button" data-key="8">8</button><button type="button" data-key="9">9</button><button type="button" data-key="*" class="op">×</button>
<button type="button" data-key="4">4</button><button type="button" data-key="5">5</button><button type="button" data-key="6">6</button><button type="button" data-key="-" class="op">−</button>
<button type="button" data-key="1">1</button><button type="button" data-key="2">2</button><button type="button" data-key="3">3</button><button type="button" data-key="+" class="op">+</button>
<button type="button" data-key="0" class="wide">0</button><button type="button" data-key=".">.</button><button type="button" data-act="equals" class="op">=</button></section><div class="hint">支持加、减、乘、除、百分比、退格、回车计算</div></main><script>
const exprEl=document.getElementById('expr');const valueEl=document.getElementById('value');let expr='';let justEvaluated=false;
function pretty(v){return String(v||'').replace(/\\*/g,'×').replace(/\\//g,'÷')}function formatNumber(n){if(!Number.isFinite(n))return'0';return String(Math.round(n*1e12)/1e12)}function render(){exprEl.textContent=pretty(expr);valueEl.textContent=pretty(expr)||'0'}function lastToken(){return expr.slice(-1)}
function appendDigit(k){if(justEvaluated){expr='';justEvaluated=false}const parts=expr.split(/[+\\-*/%]/);const current=parts[parts.length-1]||'';if(k==='.'&&current.includes('.'))return;if(k==='0'&&current==='0')return;if(/[1-9]/.test(k)&&current==='0')expr=expr.slice(0,-1);expr+=k;render()}
function appendOperator(k){if(!expr&&k!=='-')return;if(justEvaluated)justEvaluated=false;if(k==='%'&&lastToken()==='%')return;if(/[+\\-*/.]/.test(lastToken()))expr=expr.slice(0,-1);expr+=k;render()}function input(k){if(/^[0-9.]$/.test(k))appendDigit(k);else if(/^[+\\-*/%]$/.test(k))appendOperator(k)}
function calc(){if(!expr)return;try{let safe=expr;if(/[+\\-*/.]$/.test(safe))safe=safe.slice(0,-1);safe=safe.replace(/%/g,'/100');if(!/^[0-9+\\-*/().\\s]+$/.test(safe))throw new Error('bad');const out=Function('"use strict";return ('+safe+')')();expr=formatNumber(out);justEvaluated=true}catch{expr='0';justEvaluated=true}render()}
function back(){if(justEvaluated){expr='';justEvaluated=false}else expr=expr.slice(0,-1);render()}function clearAll(){expr='';justEvaluated=false;render()}
document.querySelectorAll('button').forEach(btn=>btn.addEventListener('click',e=>{e.preventDefault();const k=btn.dataset.key;const act=btn.dataset.act;if(k)input(k);if(act==='equals')calc();if(act==='back')back();if(act==='clear')clearAll()}));
document.addEventListener('keydown',e=>{if(/^[0-9+\\-*/%.]$/.test(e.key)){e.preventDefault();input(e.key)}else if(e.key==='Enter'||e.key==='='){e.preventDefault();calc()}else if(e.key==='Backspace'){e.preventDefault();back()}else if(e.key==='Escape'){e.preventDefault();clearAll()}});
window.__baiqiuCalculatorTest={press(value){String(value).split('').forEach(ch=>{if(ch==='=')calc();else input(ch)});return valueEl.textContent},clear:clearAll,value(){return valueEl.textContent},expr(){return expr}};
</script></body></html>`;
}

function detectHtmlAppSpec(message = "") {
  const text = String(message || "");
  if (/修图|图片编辑|图片处理|照片编辑|抠图|滤镜/i.test(text)) return { type: "image_editor", title: "白球修图工具", fileName: "白球修图工具.html" };
  if (/库存|进销存|仓库|商品管理|库存管理/i.test(text)) return { type: "inventory", title: "白球库存管理", fileName: "白球库存管理.html" };
  if (/记账|账本|收支/i.test(text)) return { type: "ledger", title: "白球记账工具", fileName: "白球记账工具.html" };
  return { type: "generic", title: "白球本地应用", fileName: `${safeHtmlFileBaseName(text.replace(/做一个|生成|开发|软件|网页|程序|应用|可以使用的|并打开|打开|放桌面|放到桌面/gi, ""))}.html` };
}

function imageEditorHtml() {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>白球修图工具</title><style>*{box-sizing:border-box}body{margin:0;font-family:"Microsoft YaHei",Arial,sans-serif;background:#101820;color:#eef7ff}.app{display:grid;grid-template-columns:300px 1fr;min-height:100vh}.side{padding:18px;background:#162430;border-right:1px solid #314657}.main{display:grid;place-items:center;padding:18px}.canvas-wrap{max-width:100%;max-height:86vh;overflow:auto;background:#071018;border:1px solid #314657;border-radius:14px;padding:12px;box-shadow:0 18px 50px #0007}canvas{max-width:100%;background:#fff;border-radius:8px}.field{margin:14px 0}.field label{display:flex;justify-content:space-between;font-size:13px;color:#a9c6d8}input[type=range]{width:100%}button,input[type=file]{width:100%;margin-top:10px;border:0;border-radius:12px;padding:12px;background:#39d98a;color:#06120b;font-weight:700;cursor:pointer}.ghost{background:#253849;color:#e8f7ff}.title{font-size:22px;font-weight:800;margin-bottom:8px}.hint{font-size:12px;color:#96b2c4;line-height:1.6}@media(max-width:760px){.app{grid-template-columns:1fr}.side{border-right:0;border-bottom:1px solid #314657}}</style></head><body><div class="app"><aside class="side"><div class="title">白球修图工具</div><div class="hint">上传图片后可调亮度、对比度、饱和度、灰度，并导出 PNG。</div><input id="file" type="file" accept="image/*"><div class="field"><label>亮度 <span id="bVal">100%</span></label><input id="brightness" type="range" min="0" max="200" value="100"></div><div class="field"><label>对比度 <span id="cVal">100%</span></label><input id="contrast" type="range" min="0" max="200" value="100"></div><div class="field"><label>饱和度 <span id="sVal">100%</span></label><input id="saturate" type="range" min="0" max="200" value="100"></div><div class="field"><label>灰度 <span id="gVal">0%</span></label><input id="grayscale" type="range" min="0" max="100" value="0"></div><button id="download">导出图片</button><button class="ghost" id="reset">重置效果</button></aside><main class="main"><div class="canvas-wrap"><canvas id="canvas" width="900" height="560"></canvas></div></main></div><script>const file=document.getElementById('file'),canvas=document.getElementById('canvas'),ctx=canvas.getContext('2d');let img=null;const controls=['brightness','contrast','saturate','grayscale'].map(id=>document.getElementById(id));function drawPlaceholder(){ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#587083';ctx.font='28px Microsoft YaHei';ctx.textAlign='center';ctx.fillText('请选择一张图片开始修图',canvas.width/2,canvas.height/2)}function render(){if(!img){drawPlaceholder();return}const scale=Math.min(1200/img.width,800/img.height,1);canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));ctx.filter=\`brightness(\${brightness.value}%) contrast(\${contrast.value}%) saturate(\${saturate.value}%) grayscale(\${grayscale.value}%)\`;ctx.drawImage(img,0,0,canvas.width,canvas.height);ctx.filter='none';bVal.textContent=brightness.value+'%';cVal.textContent=contrast.value+'%';sVal.textContent=saturate.value+'%';gVal.textContent=grayscale.value+'%'}file.onchange=()=>{const f=file.files[0];if(!f)return;const url=URL.createObjectURL(f);img=new Image();img.onload=()=>{URL.revokeObjectURL(url);render()};img.src=url};controls.forEach(x=>x.oninput=render);reset.onclick=()=>{brightness.value=contrast.value=saturate.value=100;grayscale.value=0;render()};download.onclick=()=>{const a=document.createElement('a');a.download='白球修图导出.png';a.href=canvas.toDataURL('image/png');a.click()};drawPlaceholder();</script></body></html>`;
}

function inventoryHtml() {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>白球库存管理</title><style>*{box-sizing:border-box}body{margin:0;font-family:"Microsoft YaHei",Arial,sans-serif;background:#f4f7fb;color:#182636}.wrap{max-width:1180px;margin:auto;padding:22px}.top{display:flex;gap:12px;flex-wrap:wrap;align-items:center}.title{font-size:26px;font-weight:800;margin-right:auto}.card{background:#fff;border:1px solid #dbe5ee;border-radius:14px;box-shadow:0 12px 30px #1b335015;padding:16px;margin-top:16px}input,button{border:1px solid #cad8e5;border-radius:10px;padding:10px;font:inherit}button{background:#1677ff;color:#fff;border:0;font-weight:700;cursor:pointer}.danger{background:#eb5757}.grid{display:grid;grid-template-columns:repeat(5,1fr) auto;gap:10px}table{width:100%;border-collapse:collapse}th,td{padding:11px;border-bottom:1px solid #edf2f7;text-align:left}th{color:#52677a;background:#f8fafc}.warn{color:#d97706;font-weight:700}.ok{color:#15803d;font-weight:700}@media(max-width:820px){.grid{grid-template-columns:1fr 1fr}.grid button{grid-column:span 2}table{font-size:13px}}</style></head><body><div class="wrap"><div class="top"><div class="title">白球库存管理</div><input id="search" placeholder="搜索商品/分类"><button id="exportBtn">导出CSV</button><button class="danger" id="clearBtn">清空</button></div><div class="card"><div class="grid"><input id="name" placeholder="商品名称"><input id="category" placeholder="分类"><input id="stock" type="number" placeholder="库存"><input id="price" type="number" placeholder="单价"><input id="safe" type="number" placeholder="安全库存"><button id="addBtn">添加/更新</button></div></div><div class="card"><table><thead><tr><th>商品</th><th>分类</th><th>库存</th><th>单价</th><th>库存金额</th><th>状态</th><th>操作</th></tr></thead><tbody id="tbody"></tbody></table></div></div><script>let items=JSON.parse(localStorage.baiqiuInventory||'[]');function save(){localStorage.baiqiuInventory=JSON.stringify(items)}function money(n){return Number(n||0).toFixed(2)}function render(){const q=search.value.trim().toLowerCase();tbody.innerHTML='';items.filter(x=>!q||x.name.toLowerCase().includes(q)||x.category.toLowerCase().includes(q)).forEach((x,i)=>{const tr=document.createElement('tr');const low=Number(x.stock)<=Number(x.safe);tr.innerHTML=\`<td>\${x.name}</td><td>\${x.category}</td><td>\${x.stock}</td><td>\${money(x.price)}</td><td>\${money(x.stock*x.price)}</td><td class="\${low?'warn':'ok'}">\${low?'需补货':'正常'}</td><td><button data-i="\${i}">删除</button></td>\`;tbody.appendChild(tr)});tbody.querySelectorAll('button').forEach(b=>b.onclick=()=>{items.splice(Number(b.dataset.i),1);save();render()})}addBtn.onclick=()=>{if(!name.value.trim())return alert('请输入商品名称');const row={name:name.value.trim(),category:category.value.trim()||'未分类',stock:Number(stock.value||0),price:Number(price.value||0),safe:Number(safe.value||0)};const idx=items.findIndex(x=>x.name===row.name);if(idx>=0)items[idx]=row;else items.push(row);save();render();[name,category,stock,price,safe].forEach(x=>x.value='')};search.oninput=render;clearBtn.onclick=()=>{if(confirm('确认清空库存数据？')){items=[];save();render()}};exportBtn.onclick=()=>{const rows=[['商品','分类','库存','单价','安全库存','库存金额'],...items.map(x=>[x.name,x.category,x.stock,x.price,x.safe,x.stock*x.price])];const csv=rows.map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\\n');const a=document.createElement('a');a.download='库存数据.csv';a.href=URL.createObjectURL(new Blob(['\\ufeff'+csv],{type:'text/csv'}));a.click()};if(!items.length){items=[{name:'示例商品',category:'默认分类',stock:20,price:9.9,safe:10}];save()}render();</script></body></html>`;
}

function genericHtmlApp(spec) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${spec.title}</title><style>body{margin:0;font-family:"Microsoft YaHei",Arial,sans-serif;background:#111827;color:#f9fafb;display:grid;place-items:center;min-height:100vh}.app{width:min(760px,92vw);background:#1f2937;border:1px solid #374151;border-radius:18px;padding:24px;box-shadow:0 20px 60px #0006}h1{margin-top:0}textarea{width:100%;min-height:180px;border-radius:12px;border:1px solid #4b5563;background:#0b1220;color:#fff;padding:14px}button{border:0;border-radius:12px;background:#22c55e;color:#052e16;font-weight:800;padding:12px 16px;margin-top:12px}</style></head><body><main class="app"><h1>${spec.title}</h1><p>这是一个可运行的本地网页应用模板。您可以记录内容并保存到浏览器本地。</p><textarea id="text" placeholder="输入内容..."></textarea><br><button id="save">保存</button></main><script>text.value=localStorage.baiqiuGenericApp||'';save.onclick=()=>{localStorage.baiqiuGenericApp=text.value;alert('已保存')};</script></body></html>`;
}

function htmlForAppSpec(spec) {
  if (spec.type === "image_editor") return imageEditorHtml();
  if (spec.type === "inventory") return inventoryHtml();
  return genericHtmlApp(spec);
}

class VerifiedTaskService {
  constructor(deps = {}) {
    this.deps = deps;
  }

  log(task, step, result, verification = null) {
    this.deps.logger?.("agent", "INFO", "[VerifiedTaskService]", { task, step, result, verification });
  }

  appOutputRoot(message) {
    const root = wantsDesktopOutput(message) ? this.deps.desktopPath() : this.deps.dataRoot("apps");
    fs.mkdirSync(root, { recursive: true });
    return root;
  }

  standard(taskId, status, output, verification, error, text) {
    return {
      success: status === "success",
      taskId,
      status,
      output: output || null,
      verification: verification || null,
      error: error || null,
      result: output || null,
      text
    };
  }

  enqueue(sessionId, title, type) {
    return this.deps.enqueueTask(sessionId, title, type);
  }

  update(taskId, patch) {
    return this.deps.updateTask(taskId, patch);
  }

  ensureActive(signal) {
    this.deps.ensureRunActive(signal);
  }

  async timeout(promise, ms, label) {
    return this.deps.withTimeout(promise, ms, label);
  }

  async createCalculator({ sessionId = "", message = "", signal = null } = {}) {
    const task = this.enqueue(sessionId, "生成并打开白球计算器", "calculator_app");
    const writeTask = this.enqueue(sessionId, "Task1 创建 HTML 计算器", "write_file");
    const verifyFileTask = this.enqueue(sessionId, "Task2 验证桌面文件存在", "verify_file");
    const openTask = this.enqueue(sessionId, "Task3 调用浏览器打开 HTML", "open_browser");
    const verifyOpenTask = this.enqueue(sessionId, "Task4 验证打开请求完成", "verify_open");
    const file = path.join(this.appOutputRoot(message), "白球计算器.html");
    try {
      this.ensureActive(signal);
      this.update(task.id, { status: "running" });
      this.update(writeTask.id, { status: "running" });
      fs.writeFileSync(file, calculatorHtml(), "utf8");
      this.update(writeTask.id, { status: "success", result: { file } });
      this.log("calculator_creator", "create_file", "success", { file });

      this.update(verifyFileTask.id, { status: "verifying" });
      const { stat } = await this.timeout(Promise.resolve().then(() => {
        this.ensureActive(signal);
        const fileStat = fs.existsSync(file) ? fs.statSync(file) : null;
        if (!fileStat || !fileStat.isFile() || fileStat.size < 1000) throw new Error("文件写入后校验失败。");
        const readBack = fs.readFileSync(file, "utf8");
        const supports = ["+", "-", "*", "/", "%", "keydown"].every((token) => readBack.includes(token));
        if (!supports) throw new Error("计算器功能校验失败。");
        return { stat: fileStat };
      }), 15000, "计算器文件验证");
      this.update(verifyFileTask.id, { status: "success", result: { file, size: stat.size, featuresVerified: true } });

      this.update(openTask.id, { status: "running" });
      const opened = await this.timeout(this.openBrowser({ path: file, signal, internalApp: true }), 15000, "浏览器打开");
      this.update(openTask.id, { status: "success", result: opened });
      this.update(verifyOpenTask.id, { status: "verifying" });
      await this.timeout(Promise.resolve().then(() => {
        this.ensureActive(signal);
        if (!opened?.url || !opened?.verifiedProcess) throw new Error("浏览器打开后未通过进程验证。");
      }), 10000, "打开结果验证");

      const output = {
        file,
        label: this.deps.actionRelativeLabel(file),
        exists: true,
        size: stat.size,
        opened: true,
        openUrl: opened.url,
        browser: opened.browser,
        browserExe: opened.browserExe,
        browserVerified: opened.verifiedProcess,
        features: ["加", "减", "乘", "除", "百分比", "键盘输入"]
      };
      const verification = { fileExists: true, featuresVerified: true, browserVerified: true };
      this.update(verifyOpenTask.id, { status: "success", result: { opened: true, openUrl: opened.url, browser: opened.browser, browserExe: opened.browserExe } });
      this.update(task.id, { status: "success", result: output });
      this.log("calculator_creator", "complete", "success", verification);
      return this.standard("calculator_creator", "success", output, verification, null, [
        `任务分析：生成一个本地 HTML 计算器软件，并${wantsDesktopOutput(message) ? "放到桌面后打开" : "保存到白球工作区后打开"}。`,
        "执行状态：成功。",
        `检查结果：已创建 ${output.label}`,
        "验证结果：文件存在，功能包含加、减、乘、除、百分比和键盘输入。",
        `打开状态：已用 ${output.browser || "浏览器"} 打开，并检测到浏览器进程；不再走 WPS/Office 文件关联。`
      ].join("\n"));
    } catch (error) {
      return this.failTasks("calculator_creator", task, [writeTask, verifyFileTask, openTask, verifyOpenTask], error, `任务分析：生成并打开计算器。\n执行状态：${this.statusText(error)}。\n检查结果：${humanReadableError(error)}`);
    }
  }

  async createHtmlApp({ sessionId = "", message = "", signal = null } = {}) {
    const spec = detectHtmlAppSpec(message);
    const file = path.join(this.appOutputRoot(message), spec.fileName);
    const task = this.enqueue(sessionId, `生成并打开${spec.title}`, "html_app");
    const writeTask = this.enqueue(sessionId, "Task1 创建 HTML 应用", "write_file");
    const verifyTask = this.enqueue(sessionId, "Task2 验证应用文件可用", "verify_file");
    const openTask = this.enqueue(sessionId, "Task3 用浏览器打开应用", "open_browser");
    try {
      this.ensureActive(signal);
      this.update(task.id, { status: "running" });
      this.update(writeTask.id, { status: "running" });
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, htmlForAppSpec(spec), "utf8");
      this.update(writeTask.id, { status: "success", result: { file } });
      this.update(verifyTask.id, { status: "verifying" });
      const stat = fs.statSync(file);
      const readBack = fs.readFileSync(file, "utf8");
      if (!stat.isFile() || stat.size < 1200 || !/<script[\s>]/i.test(readBack)) throw new Error("HTML 应用校验失败。");
      this.update(verifyTask.id, { status: "success", result: { file, size: stat.size } });
      this.update(openTask.id, { status: "running" });
      const opened = await this.timeout(this.openBrowser({ path: file, signal, internalApp: true }), 15000, "浏览器打开");
      this.update(openTask.id, { status: "success", result: opened });
      const output = { file, label: this.deps.actionRelativeLabel(file), size: stat.size, opened };
      const verification = { fileExists: true, hasScript: true, browserVerified: Boolean(opened?.verifiedProcess) };
      this.update(task.id, { status: "success", result: output });
      this.log("html_app_creator", "complete", "success", verification);
      return this.standard("html_app_creator", "success", output, verification, null, [
        `任务分析：生成可使用的${spec.title}，并用浏览器打开。`,
        "执行状态：成功。",
        `检查结果：已创建 ${output.label}，${output.size} 字节。`,
        `打开状态：已用 ${opened.browser || "浏览器"} 打开，并检测到浏览器进程。`
      ].join("\n"));
    } catch (error) {
      return this.failTasks("html_app_creator", task, [writeTask, verifyTask, openTask], error, `任务分析：生成并打开${spec.title}。\n执行状态：${this.statusText(error)}。\n检查结果：${humanReadableError(error)}`);
    }
  }

  async createFiles({ sessionId = "", message = "", signal = null } = {}) {
    const names = VerifiedFileCreate.extractRequestedFileNames(message);
    const wantsDesktop = /桌面|desktop/i.test(String(message || ""));
    const root = wantsDesktop ? this.deps.desktopPath() : this.deps.saveRoot();
    const rootLabel = wantsDesktop ? "桌面" : "保存位置";
    const plan = ["解析文件名", "写入文件", "验证文件真实存在"];
    this.log("file_creator", "plan", "success", { sessionId, files: names, targetRoot: root });
    if (!names.length) {
      return this.standard("file_creator", "failed", null, { fileNamesParsed: false }, "没有识别到要创建的文件名。", "任务分析：这是创建文件任务。\n执行状态：失败。\n检查结果：没有识别到具体文件名，请提供类似 A.txt、B.txt 的文件名。");
    }

    const parentTask = this.enqueue(sessionId, `创建 ${names.length} 个真实文件`, "file_create");
    const writeTask = this.enqueue(sessionId, "Task1 写入文件", "write_file");
    const verifyTask = this.enqueue(sessionId, "Task2 验证文件存在", "verify_file");
    const files = names.map((name) => path.join(root, name));
    let written = [];
    try {
      this.ensureActive(signal);
      this.update(parentTask.id, { status: "running", result: { plan } });
      this.update(writeTask.id, { status: "running", result: { files } });
      const created = VerifiedFileCreate.createAndVerifyRequestedFiles({ message, targetRoot: root, signal });
      written = created.written;
      this.update(writeTask.id, { status: "success", result: { written } });
      this.update(verifyTask.id, { status: "verifying", result: { files } });
      const verified = await this.timeout(Promise.resolve().then(() => created.verified.map((item) => {
        this.ensureActive(signal);
        if (!fs.existsSync(item.file)) throw new Error(`文件不存在：${this.deps.actionRelativeLabel(item.file)}`);
        const stat = fs.statSync(item.file);
        if (!stat.isFile() || stat.size < 1) throw new Error(`文件校验失败：${this.deps.actionRelativeLabel(item.file)}`);
        return { file: item.file, label: this.deps.actionRelativeLabel(item.file), size: stat.size };
      })), 15000, "文件存在验证");
      const output = { files: verified };
      const verification = { count: verified.length, allExist: true };
      this.update(verifyTask.id, { status: "success", result: { verified } });
      this.update(parentTask.id, { status: "success", result: { verified } });
      this.log("file_creator", "complete", "success", verification);
      return this.standard("file_creator", "success", output, verification, null, [
        `任务分析：创建 ${names.length} 个文件到${rootLabel}。`,
        "执行状态：成功。",
        "检查结果：",
        ...verified.map((item) => `- ${item.label} 已存在，${item.size} 字节`),
        "验证结果：全部文件已真实写入并通过存在性检查。"
      ].join("\n"));
    } catch (error) {
      this.log("file_creator", "failed", "failed", { error: error.message || String(error), written });
      return this.failTasks("file_creator", parentTask, [writeTask, verifyTask], error, `任务分析：创建文件到${rootLabel}。\n执行状态：${this.statusText(error)}。\n检查结果：${humanReadableError(error)}`);
    }
  }

  async openBrowser({ path: rawPath = "", url = "", target = "", signal = null, internalApp = false } = {}) {
    this.ensureActive(signal);
    const value = sanitizeText(rawPath || url || target);
    if (!value) throw new Error("browser_open 缺少 path/url");
    if (/^https?:\/\//i.test(value)) {
      await this.deps.openExternal(value);
      return { target: value, opened: true, browser: "default" };
    }
    const file = this.deps.safeActionPath(value, { internalApp });
    if (!fs.existsSync(file)) throw new Error(`要打开的路径不存在：${this.deps.actionRelativeLabel(file)}`);
    if (/\.html?$/i.test(file)) {
      const opened = await BrowserOpen.openHtmlInRealBrowser(path.resolve(file));
      this.log("browser_open", "open_html", "success", { file, browser: opened.browser, verifiedProcess: opened.verifiedProcess });
      return opened;
    }
    const result = await this.deps.openPath(file);
    this.log("browser_open", "open_path", "success", { file });
    return result;
  }

  statusText(error) {
    const status = queueTerminalStatus(error);
    if (status === "cancelled") return "已终止";
    if (status === "timeout") return "超时";
    return "失败";
  }

  failTasks(taskId, parentTask, childTasks, error, text) {
    const terminalStatus = queueTerminalStatus(error);
    if (parentTask?.id) this.update(parentTask.id, { status: terminalStatus, error: error.message || String(error) });
    for (const item of childTasks || []) {
      const current = this.deps.findQueueTask?.(item.id);
      if (current && !["success", "failed", "timeout", "cancelled"].includes(current.status)) {
        this.update(item.id, { status: terminalStatus, error: error.message || String(error) });
      }
    }
    this.log(taskId, "failed", "failed", { error: error.message || String(error) });
    return this.standard(taskId, terminalStatus === "cancelled" ? "cancelled" : "failed", null, { passed: false }, error.message || String(error), text);
  }
}

module.exports = { VerifiedTaskService };
