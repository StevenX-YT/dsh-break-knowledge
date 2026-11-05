import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RENDER = path.join(HERE, 'engine', 'render.mjs');

/** 学习页所在目录。默认是开发目录，可用 STUDY_ROOT 覆盖。 */
const STUDY_ROOT = process.env.STUDY_ROOT || 'D:\\dsh-data\\projects\\study-html-plugin\\out';

/** 列出目录下的学习页（只认直接子文件，限制在 STUDY_ROOT 内）。 */
function listPages() {
  let names = [];
  try {
    names = fs.readdirSync(STUDY_ROOT).filter((n) => n.toLowerCase().endsWith('.html'));
  } catch {
    return [];
  }
  return names
    .map((n) => {
      const p = path.join(STUDY_ROOT, n);
      const st = fs.statSync(p);
      return { name: n, path: p, sizeKB: Math.round(st.size / 102.4) / 10, mtime: st.mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);
}

/** 只允许打开 STUDY_ROOT 下的 .html，防止面板变成任意文件启动器。 */
function safePath(p) {
  const abs = path.resolve(String(p || ''));
  const root = path.resolve(STUDY_ROOT);
  if (!abs.startsWith(root + path.sep)) throw new Error('路径不在学习页目录内');
  if (!abs.toLowerCase().endsWith('.html')) throw new Error('只允许打开 .html');
  if (!fs.existsSync(abs)) throw new Error('文件不存在');
  return abs;
}

/** 跑一次渲染脚本，拿它的 stdout。失败时把 stderr 原样抛出去。 */
function runRender(contentPath, outPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.DSH_NODE || 'node', [RENDER, contentPath, outPath], {
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(err.trim() || ('render 退出码 ' + code)));
    });
  });
}

export const inject = ['tools', 'webServer'];

export function apply(ctx) {
  /* ---------- 面板数据接口 ---------- */
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/study/api/list',
    handler(req, res) {
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.setHeader('cache-control', 'no-store');
      res.end(JSON.stringify({ root: STUDY_ROOT, items: listPages() }));
    }
  }));

  /* ---------- 用系统默认浏览器打开（桌面端） ---------- */
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/study/api/open',
    async handler(req, res) {
      let body = '';
      for await (const chunk of req) body += chunk;
      try {
        const target = safePath(JSON.parse(body || '{}').path);
        if (process.platform === 'win32') {
          spawn('cmd', ['/c', 'start', '', target], { detached: true, stdio: 'ignore' }).unref();
        } else {
          spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [target], { detached: true, stdio: 'ignore' }).unref();
        }
        res.setHeader('content-type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ ok: true, path: target }));
      } catch (e) {
        res.statusCode = 400;
        res.setHeader('content-type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ ok: false, error: String(e.message || e) }));
      }
    }
  }));

  ctx.tools.register({
    name: 'study_render',
    description:
      '把学习内容 JSON 渲染成单文件、零依赖的可互动 HTML 学习页（讲解 / 检验 / 报告三视图，含判分与进度记录）。' +
      '内容 JSON 需含 meta、points、segments、items；渲染前会做结构校验，字段缺失会直接报错并指出位置。',
    parameters: {
      type: 'object',
      properties: {
        content: { type: 'string', description: '内容 JSON 的绝对路径' },
        out: { type: 'string', description: '输出 HTML 路径；省略则与 JSON 同目录同名' }
      },
      required: ['content']
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '生成的 HTML 路径' },
          sizeKB: { type: 'number' },
          points: { type: 'integer' },
          segments: { type: 'integer' },
          items: { type: 'integer' }
        },
        required: ['path', 'sizeKB', 'points', 'segments', 'items']
      },
      render: (args, value) => [{
        type: 'text',
        text: `学习页已生成：${value.path}\n${value.sizeKB} KB · ${value.points} 知识点 · ${value.segments} 讲解段 · ${value.items} 道题`
      }]
    },
    timeoutMs: 60000,
    async execute(args) {
      const content = path.resolve(String(args.content));
      if (!fs.existsSync(content)) throw new Error('找不到内容文件：' + content);

      const out = args.out
        ? path.resolve(String(args.out))
        : content.replace(/\.json$/i, '') + '.html';

      await runRender(content, out);

      const data = JSON.parse(fs.readFileSync(content, 'utf8'));
      return {
        path: out,
        sizeKB: Math.round(fs.statSync(out).size / 102.4) / 10,
        points: (data.points || []).length,
        segments: (data.segments || []).length,
        items: (data.items || []).length
      };
    }
  });
}
