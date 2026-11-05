import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const target = 'file:///' + path.resolve(process.argv[2]).replace(/\\/g, '/');
const W = Number(process.argv[3] || 390);
const PORT = 9800 + Math.floor(Math.random() * 90);
const profile = 'D:\\dsh-data\\cache\\edge-diag-' + Date.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const child = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run',
  `--user-data-dir=${profile}`, `--remote-debugging-port=${PORT}`,
  `--window-size=${W},900`, 'about:blank'], { stdio: 'ignore' });

let ws, id = 0; const pending = new Map();
async function connect() {
  for (let i = 0; i < 80; i++) {
    try {
      const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const p = l.find((t) => t.type === 'page');
      if (p) return p.webSocketDebuggerUrl;
    } catch {}
    await sleep(200);
  }
  throw new Error('no devtools');
}
function call(method, params = {}) {
  const i = ++id;
  return new Promise((res, rej) => { pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
}
async function ev(expr) {
  const r = await call('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
  return r.result.value;
}
try {
  ws = new WebSocket(await connect());
  await new Promise((r, j) => { ws.addEventListener('open', r, { once: true }); ws.addEventListener('error', j, { once: true }); });
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); }
  });
  await call('Page.enable'); await call('Runtime.enable');
  await call('Page.navigate', { url: target });
  await sleep(1600);

  const info = await ev(`(() => {
    const out = { innerWidth: innerWidth, bodyScroll: document.body.scrollWidth, docScroll: document.documentElement.scrollWidth, wide: [] };
    document.querySelectorAll('*').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.right > innerWidth + 1 && r.width > 40) {
        out.wide.push({ tag: el.tagName, cls: (el.className || '').toString().slice(0, 40), w: Math.round(r.width), right: Math.round(r.right) });
      }
    });
    out.wide = out.wide.slice(0, 12);
    return out;
  })()`);
  console.log(JSON.stringify(info, null, 2));
} catch (e) {
  console.error('失败:', e.message);
} finally {
  try { ws?.close(); } catch {}
  try { child.kill(); } catch {}
  await sleep(300);
  try { spawn('taskkill', ['/F', '/T', '/PID', String(child.pid)], { stdio: 'ignore' }); } catch {}
  setTimeout(() => { try { fs.rmSync(profile, { recursive: true, force: true }); } catch {} }, 1200);
}
