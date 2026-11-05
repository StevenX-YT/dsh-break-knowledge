#!/usr/bin/env node
/** 截页面指定区域，用来放大检查公式排版。 node engine/clip.mjs <html> <y> <h> [out] */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const EDGE = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find((p) => fs.existsSync(p));
const [html, y = '0', h = '1200', out = 'clip.png'] = process.argv.slice(2);
const target = 'file:///' + path.resolve(html).replace(/\\/g, '/');
const PORT = 9700 + Math.floor(Math.random() * 100);
const profile = 'D:\\dsh-data\\cache\\edge-clip-' + Date.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const child = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run',
  '--hide-scrollbars', '--force-device-scale-factor=2',
  `--user-data-dir=${profile}`, `--remote-debugging-port=${PORT}`,
  '--window-size=1000,1400', 'about:blank'], { stdio: 'ignore' });

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
  throw new Error('devtools');
}
function call(method, params = {}) {
  const i = ++id;
  return new Promise((res, rej) => { pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
}
try {
  ws = new WebSocket(await connect());
  await new Promise((r, j) => { ws.addEventListener('open', r, { once: true }); ws.addEventListener('error', j, { once: true }); });
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id); pending.delete(m.id);
      m.error ? rej(new Error(m.error.message)) : res(m.result);
    }
  });
  await call('Page.enable');
  await call('Runtime.enable');
  if (process.env.MOBILE) {
    await call('Emulation.setDeviceMetricsOverride', {
      width: 390, height: 1400, deviceScaleFactor: 2, mobile: true
    });
  }
  await call('Page.navigate', { url: target });
  await sleep(1500);
  const r = await call('Page.captureScreenshot', {
    format: 'png', captureBeyondViewport: true,
    clip: { x: 0, y: Number(y), width: 1000, height: Number(h), scale: 2 }
  });
  fs.writeFileSync(path.resolve(out), Buffer.from(r.data, 'base64'));
  console.log('✓ ' + path.resolve(out));
} finally {
  try { ws?.close(); } catch {}
  try { child.kill(); } catch {}
  await sleep(300);
  try { spawn('taskkill', ['/F', '/T', '/PID', String(child.pid)], { stdio: 'ignore' }); } catch {}
  setTimeout(() => { try { fs.rmSync(profile, { recursive: true, force: true }); } catch {} }, 1200);
}
