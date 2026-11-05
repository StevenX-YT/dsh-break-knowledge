#!/usr/bin/env node
/**
 * 生成预览截图（讲解 / 检验 / 有数据的报告页）。
 *   node engine/shots.mjs [html路径]
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const EDGE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
].find((p) => fs.existsSync(p));
if (!EDGE) { console.error('没有 Edge/Chrome'); process.exit(2); }

const file = path.resolve(process.argv[2] || 'out/demo.html');
const target = 'file:///' + file.replace(/\\/g, '/');
const outDir = path.dirname(file);
const PORT = 9600 + Math.floor(Math.random() * 100);
const profile = 'D:\\dsh-data\\cache\\edge-shots-' + Date.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const child = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', '--force-device-scale-factor=2',
  `--user-data-dir=${profile}`, `--remote-debugging-port=${PORT}`,
  '--window-size=1000,1400', 'about:blank'
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
  throw new Error('DevTools 未就绪');
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
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}
async function waitFor(expr, timeout = 10000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    try { if (await evalJs(expr)) return true; } catch {}
    await sleep(200);
  }
  return false;
}
async function shot(name) {
  const r = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  const p = path.join(outDir, name);
  fs.writeFileSync(p, Buffer.from(r.data, 'base64'));
  console.log('✓ ' + p);
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
  await call('Page.navigate', { url: target });
  await waitFor(`document.readyState === 'complete' && !!document.getElementById('title')`);
  await sleep(250);

  await shot('shot-guide.png');

  await evalJs(`document.querySelector('.tab[data-view="quiz"]').click()`);
  await sleep(150);
  await evalJs(`document.querySelectorAll('#main [data-q]').forEach(()=>{}), document.querySelector('[data-q="q1"] .opt:nth-child(2)').click(), document.querySelector('[data-q="q1"] [data-act="submit"]').click()`);
  await sleep(120);
  await evalJs(`(()=>{const c=document.querySelector('[data-q="q2"]');c.querySelectorAll('.opt')[1].click();c.querySelector('[data-act="submit"]').click();})()`);
  await sleep(120);
  await evalJs(`(()=>{const c=document.querySelector('[data-q="q3"]');const i=c.querySelector('input');i.value='1';c.querySelector('[data-act="submit"]').click();})()`);
  await sleep(120);
  await evalJs(`(()=>{const c=document.querySelector('[data-q="q4"]');const i=c.querySelector('input');i.value='trace';c.querySelector('[data-act="submit"]').click();})()`);
  await sleep(120);
  await evalJs(`(()=>{const c=document.querySelector('[data-q="q5"]');c.querySelectorAll('.opt')[1].click();c.querySelector('[data-act="submit"]').click();})()`);
  await sleep(200);
  await shot('shot-quiz.png');

  await evalJs(`document.querySelector('.tab[data-view="report"]').click()`);
  await sleep(300);
  await shot('shot-report.png');

  await evalJs(`localStorage.clear()`);
} catch (e) {
  console.error('失败:', e.message);
  process.exitCode = 1;
} finally {
  try { ws?.close(); } catch {}
  try { child.kill(); } catch {}
  await sleep(300);
  try { spawn('taskkill', ['/F', '/T', '/PID', String(child.pid)], { stdio: 'ignore' }); } catch {}
  setTimeout(() => { try { fs.rmSync(profile, { recursive: true, force: true }); } catch {} }, 1200);
}
