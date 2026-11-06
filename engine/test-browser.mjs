#!/usr/bin/env node
/**
 * 端到端冒烟：真开一个无头 Edge，按学生路径点一遍。
 * 断言从页面内嵌内容里读，所以换任何内容都能跑。
 *
 *   node engine/test-browser.mjs [要测的 HTML]
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const EDGE_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser'
];
const EDGE = EDGE_CANDIDATES.find((p) => fs.existsSync(p));
if (!EDGE) { console.error('找不到 Edge/Chrome，跳过浏览器测试'); process.exit(2); }

const target = 'file:///' + path.resolve(process.argv[2] || 'out/demo.html').replace(/\\/g, '/');
const PORT = 9333 + Math.floor(Math.random() * 200);
const profile = path.join(os.tmpdir(), 'edge-study-' + Date.now());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const child = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-extensions', '--disable-background-networking',
  `--user-data-dir=${profile}`, `--remote-debugging-port=${PORT}`, 'about:blank'
], { stdio: 'ignore' });

let ws, nextId = 0;
const pending = new Map();

async function connect() {
  for (let i = 0; i < 80; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(200);
  }
  throw new Error('DevTools 端口没有响应');
}
function call(method, params = {}) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evalJs(expression) {
  const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
  if (r.exceptionDetails) {
    throw new Error('页面异常: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  }
  return r.result.value;
}
const results = [];
function check(name, value, detail) {
  const ok = !!value;
  results.push({ name, ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? '  (' + detail + ')' : ''}`);
}
async function waitFor(expr, timeout = 10000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    try { if (await evalJs(expr)) return true; } catch {}
    await sleep(200);
  }
  return false;
}
async function go(url) {
  await call('Page.navigate', { url });
  if (!await waitFor(`document.readyState === 'complete' && !!document.getElementById('title')`)) {
    throw new Error('页面没有就绪: ' + url);
  }
  await sleep(150);
}

try {
  ws = new WebSocket(await connect());
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', rej, { once: true });
  });
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? reject(new Error(m.error.message)) : resolve(m.result);
    }
  });

  await call('Page.enable');
  await call('Runtime.enable');
  await go(target);

  const RAW = await evalJs(`JSON.parse(document.getElementById('study-data').textContent)`);
  const D = RAW.chapters ? RAW.chapters[0] : RAW;
  const nSeg = D.segments.length;
  const nCheck = D.segments.filter((s) => s.checkpoint).length;
  const nItems = D.items.length;
  const single = D.items.find((i) => i.kind === 'single');
  const judge = D.items.find((i) => i.kind === 'judge');
  const num = D.items.find((i) => i.kind === 'numeric' && typeof i.answer === 'number');
  const blank = D.items.find((i) => i.kind === 'blank');
  console.log(`内容：${nSeg} 段 / ${nItems} 题\n`);

  /* ---- 0. 基础 ---- */
  check('页面加载出标题', await evalJs(`document.getElementById('title').textContent.length > 0`));
  check('localStorage 可用', await evalJs(`(()=>{try{localStorage.setItem('__t','1');localStorage.removeItem('__t');return true}catch(e){return false}})()`));
  check(`讲解视图渲染 ${nCheck} 个检查点`,
    (await evalJs(`document.querySelectorAll('#main .check').length`)) === nCheck);

  /* ---- 1. 提示逐级展开 ---- */
  await evalJs(`document.querySelector('#main .check [data-act="hint"]').click()`);
  check('点提示后出现 1 条提示',
    (await evalJs(`document.querySelectorAll('#main .check .hint-list li').length`)) === 1);
  await evalJs(`document.querySelector('#main .check [data-act="hint"]')?.click()`);
  check('再点一次出现 2 条提示',
    (await evalJs(`document.querySelectorAll('#main .check .hint-list li').length`)) === 2);
  await evalJs(`document.querySelector('#main .check [data-act="reveal"]').click()`);
  check('揭示后显示答案', await evalJs(`!!document.querySelector('#main .check .reveal')`));

  /* ---- 2. 检验页 ---- */
  await evalJs(`document.querySelector('.tab[data-view="quiz"]').click()`);
  check(`检验页渲染 ${nItems} 题`,
    (await evalJs(`document.querySelectorAll('[data-q]').length`)) === nItems);

  /* ---- 3. 单选答对 ---- */
  await evalJs(`(()=>{
    const c = document.querySelector('[data-q="${single.id}"]');
    c.querySelectorAll('.opt')[${single.answer}].click();
    c.querySelector('[data-act="submit"]').click();
  })()`);
  check('单选选对 → 绿色反馈',
    await evalJs(`!!document.querySelector('[data-q="${single.id}"] .feedback.ok')`));
  check('答对后无重试按钮',
    await evalJs(`!document.querySelector('[data-q="${single.id}"] [data-act="retry"]')`));

  /* ---- 4. 判断答错 → 再答 ---- */
  const wrongJudge = judge.answer === true ? 1 : 0;
  await evalJs(`(()=>{
    const c = document.querySelector('[data-q="${judge.id}"]');
    c.querySelectorAll('.opt')[${wrongJudge}].click();
    c.querySelector('[data-act="submit"]').click();
  })()`);
  check('判断答错 → 红色反馈',
    await evalJs(`!!document.querySelector('[data-q="${judge.id}"] .feedback.err')`));
  check('答错一次 → 出现「再答一次」',
    await evalJs(`!!document.querySelector('[data-q="${judge.id}"] [data-act="retry"]')`));

  await evalJs(`document.querySelector('[data-q="${judge.id}"] [data-act="retry"]').click()`);
  check('重试后控件解锁',
    await evalJs(`!document.querySelector('[data-q="${judge.id}"] .opts').classList.contains('locked')`));
  await evalJs(`(()=>{
    const c = document.querySelector('[data-q="${judge.id}"]');
    c.querySelectorAll('.opt')[${judge.answer === true ? 0 : 1}].click();
    c.querySelector('[data-act="submit"]').click();
  })()`);
  check('重试答对 → 绿色反馈',
    await evalJs(`!!document.querySelector('[data-q="${judge.id}"] .feedback.ok')`));

  /* ---- 5. 数值题 ---- */
  if (num) {
    await evalJs(`(()=>{
      const c = document.querySelector('[data-q="${num.id}"]');
      const i = c.querySelector('input[data-kind="numeric"]');
      i.value = '${num.answer}'; i.dispatchEvent(new Event('input', {bubbles:true}));
      c.querySelector('[data-act="submit"]').click();
    })()`);
    check('数值题答对', await evalJs(`!!document.querySelector('[data-q="${num.id}"] .feedback.ok')`));
  }

  /* ---- 6. 填空题 ---- */
  if (blank) {
    const ans = Array.isArray(blank.answer) ? blank.answer[0] : blank.answer;
    const variant = ' ' + ans.toUpperCase().replace(/\(/g, '（').replace(/\)/g, '）') + ' ';
    await evalJs(`(()=>{
      const c = document.querySelector('[data-q="${blank.id}"]');
      const i = c.querySelector('input[data-kind="blank"]');
      i.value = ${JSON.stringify(variant)};
      i.dispatchEvent(new Event('input', {bubbles:true}));
      c.querySelector('[data-act="submit"]').click();
    })()`);
    check('填空题容忍全角与空格',
      await evalJs(`!!document.querySelector('[data-q="${blank.id}"] .feedback.ok')`));
  }

  /* ---- 7. 空提交被拦 ---- */
  const other = D.items.find((i) => !['single', 'judge', 'numeric', 'blank'].includes(i.kind));
  if (other) {
    await evalJs(`document.querySelector('[data-q="${other.id}"] [data-act="submit"]')?.click()`);
    check('未作答时提交不记录',
      await evalJs(`!document.querySelector('[data-q="${other.id}"] .feedback')`));
  }

  /* ---- 8. 报告页 ---- */
  const answered = await evalJs(`document.querySelectorAll('[data-q] .feedback').length`);
  await evalJs(`document.querySelector('.tab[data-view="report"]').click()`);
  check('报告页渲染知识点条',
    (await evalJs(`document.querySelectorAll('.kp-row').length`)) === D.points.length);
  check('报告页统计到已答题目',
    await evalJs(`document.querySelector('#main .card').textContent.includes('已作答')`));

  /* ---- 9. 刷新后进度仍在 ---- */
  await go(target);
  await evalJs(`document.querySelector('.tab[data-view="quiz"]').click()`);
  check('刷新后作答记录仍在',
    (await evalJs(`document.querySelectorAll('[data-q] .feedback').length`)) === answered);

  /* ---- 10. 章节切换（多章时） ---- */
  if (RAW.chapters && RAW.chapters.length > 1) {
    await evalJs(`document.querySelector('.chapters .ch[data-ch="1"]').click()`);
    await sleep(150);
    check('切到第 2 章 → 标题变化',
      (await evalJs(`document.getElementById('title').textContent`)) === RAW.chapters[1].meta.title);
    await evalJs(`document.querySelector('.tab[data-view="quiz"]').click()`);
    await sleep(120);
    check('切到第 2 章 → 题目数正确',
      (await evalJs(`document.querySelectorAll('[data-q]').length`)) === RAW.chapters[1].items.length);
    check('切到第 2 章 → 进度独立（未作答）',
      (await evalJs(`document.querySelectorAll('[data-q] .feedback').length`)) === 0);
    await evalJs(`document.querySelector('.chapters .ch[data-ch="0"]').click()`);
    await sleep(150);
    await evalJs(`document.querySelector('.tab[data-view="quiz"]').click()`);
    await sleep(120);
    check('切回第 1 章 → 答题记录还在',
      (await evalJs(`document.querySelectorAll('[data-q] .feedback').length`)) > 0);
  }

  /* ---- 11. 导出进度 ---- */
  await evalJs(`document.getElementById('export').click()`);
  const exported = await evalJs(`document.getElementById('io-text').value`);
  check('导出进度 → 得到 JSON', exported.length > 20 && exported.includes('"data"'));
  await evalJs(`document.getElementById('io-close').click()`);

  /* ---- 12. 清空 ---- */
  await evalJs(`localStorage.clear()`);
  await go(target);
  await evalJs(`document.querySelector('.tab[data-view="quiz"]').click()`);
  check('清空后回到未作答',
    (await evalJs(`document.querySelectorAll('[data-q] .feedback').length`)) === 0);

  /* ---- 13. 导入进度（恢复） ---- */
  await evalJs(`document.getElementById('import').click()`);
  await evalJs(`document.getElementById('io-text').value = ${JSON.stringify(exported)}`);
  await evalJs(`document.getElementById('io-apply').click()`);
  await evalJs(`document.querySelector('.tab[data-view="quiz"]').click()`);
  check('导入进度 → 作答记录恢复',
    (await evalJs(`document.querySelectorAll('[data-q] .feedback').length`)) > 0);

} catch (e) {
  console.error('\n执行失败:', e.message);
  results.push({ name: '执行异常', ok: false, detail: e.message });
} finally {
  try { ws && ws.close(); } catch {}
  try { child.kill(); } catch {}
  await sleep(400);
  try { spawn('taskkill', ['/F', '/T', '/PID', String(child.pid)], { stdio: 'ignore' }); } catch {}
  setTimeout(() => { try { fs.rmSync(profile, { recursive: true, force: true }); } catch {} }, 1500);
}

const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length} 通过 / ${results.length} 项`);
if (bad.length) {
  console.log('失败项：');
  bad.forEach((b) => console.log('  ✗ ' + b.name + (b.detail ? ' — ' + b.detail : '')));
  process.exit(1);
}
console.log('浏览器端全部通过 ✓');
