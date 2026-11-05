#!/usr/bin/env node
/**
 * 把 content.json 渲染成单文件可互动 HTML。
 *
 *   node engine/render.mjs <content.json | manifest.json> [输出路径]
 *
 * manifest 形态（多章合并成一本，适合一次发给手机）：
 *   { "title": "高等数学 上册", "chapters": [ { "file": "ch1.json" }, { "file": "ch2.json" } ] }
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

function die(msg) {
  console.error('render: ' + msg);
  process.exit(1);
}

const [, , input, outArg] = process.argv;
if (!input) die('用法: node engine/render.mjs <content.json> [输出路径]');

const absIn = path.resolve(input);
if (!fs.existsSync(absIn)) die('找不到输入文件: ' + absIn);

let data;
try {
  data = JSON.parse(fs.readFileSync(absIn, 'utf8'));
} catch (e) {
  die('JSON 解析失败: ' + e.message);
}

/* ---------- manifest：多章合并 ---------- */
let book;
if (Array.isArray(data.chapters) && data.chapters.every((c) => c && typeof c.file === 'string')) {
  const dir = path.dirname(absIn);
  book = {
    title: data.title || '学习页',
    chapters: data.chapters.map((c) => {
      const f = path.resolve(dir, c.file);
      if (!fs.existsSync(f)) die('找不到章节文件: ' + f);
      try {
        return JSON.parse(fs.readFileSync(f, 'utf8'));
      } catch (e) {
        die('章节 ' + c.file + ' 解析失败: ' + e.message);
      }
    })
  };
} else {
  book = { title: (data.meta || {}).title || '学习页', chapters: [data] };
}

const chapters = book.chapters;

/* ---------- 结构校验 ---------- */
const problems = [];
chapters.forEach((ch, ci) => {
  const tag = chapters.length > 1 ? `章 ${ci + 1}（${(ch.meta || {}).title || '未命名'}）` : '内容';
  if (!ch.meta || !ch.meta.title) problems.push(`${tag}: meta.title 缺失`);
  if (!Array.isArray(ch.points)) problems.push(`${tag}: points 不是数组`);
  if (!Array.isArray(ch.items)) problems.push(`${tag}: items 不是数组`);
  (ch.items || []).forEach((it, i) => {
    if (!it.id) problems.push(`${tag} items[${i}].id 缺失`);
    if (it.kind !== 'short' && it.answer === undefined) problems.push(`${tag} items[${i}] (${it.id}) 缺 answer`);
    if (['single', 'stepwise', 'findError'].includes(it.kind) && !Array.isArray(it.options)) {
      problems.push(`${tag} items[${i}] (${it.id}) 缺 options`);
    }
  });
});
if (problems.length) die('内容有误:\n  - ' + problems.join('\n  - '));

/* ---------- 解释质量体检（只警告，不阻断） ---------- */
const FILLER = /(这是[^，。]{0,10}(起点|基础|关键|核心|重点)|显然|显而易见|证毕|不难看出|相信大家|如前所述|众所周知)/;

/** 只取汉字，用来判断 why 是不是在复述 op。 */
const bigrams = (s) => {
  const t = String(s).replace(/\s/g, '');
  const r = new Set();
  for (let i = 0; i < t.length - 1; i++) r.add(t.slice(i, i + 2));
  return r;
};

/**
 * op 里的二元组有多少被 why 原样搬走。
 * 实测：真实内容最高 0.78（公式型解释会引用公式）；逐字复述接近 1.0 —— 阈值取 0.88。
 */
function restated(op, why) {
  const A = bigrams(op);
  const B = bigrams(why);
  if (!A.size) return false;
  let hit = 0;
  for (const g of A) if (B.has(g)) hit++;
  return hit / A.size > 0.88;
}

const thin = [];
for (const seg of chapters.flatMap((c) => c.segments || [])) {
  for (const b of seg.blocks || []) {
    const steps = b.type === 'proof' ? b.steps : b.type === 'example' ? b.solution : null;
    if (!steps) continue;
    steps.forEach((s, i) => {
      const w = (s.why || '').trim();
      const where = `${seg.id} · ${b.label || b.type} 第 ${i + 1} 步`;
      if (!w) thin.push(`${where}：没有 why`);
      else if (w.length < 14) thin.push(`${where}：why 太短（${w.length} 字）→ ${w}`);
      else if (FILLER.test(w)) thin.push(`${where}：why 像套话 → ${w}`);
      else if (restated(s.op, w)) thin.push(`${where}：why 基本是 op 的同义重复 → ${w}`);
    });
  }
  (seg.blocks || []).forEach((b) => {
    if (b.type === 'terms' && !(b.items || []).length) thin.push(`${seg.id}：terms 块为空`);
    if (b.type === 'figure' && !b.svg) thin.push(`${seg.id}：figure 没有 svg`);
  });
}

/* ---------- 组装 ---------- */
const css = fs.readFileSync(path.join(HERE, 'app.css'), 'utf8');
const gradeJs = fs.readFileSync(path.join(HERE, 'grade.js'), 'utf8');
const mathJs = fs.readFileSync(path.join(HERE, 'math.js'), 'utf8');
const js = fs.readFileSync(path.join(HERE, 'app.js'), 'utf8');
const shell = fs.readFileSync(path.join(HERE, 'shell.html'), 'utf8');

const title = String(book.title);
const payload = chapters.length > 1 ? book : book.chapters[0];

const json = JSON.stringify(payload)
  .replace(/</g, '\\u003c')
  .replace(/\u2028/g, '\\u2028')
  .replace(/\u2029/g, '\\u2029');

const sum = (k) => chapters.reduce((n, c) => n + (c[k] || []).length, 0);
const footer = [
  chapters.length > 1 ? `共 ${chapters.length} 章` : (chapters[0].meta || {}).course,
  '进度保存在本机浏览器'
].filter(Boolean).join(' · ');

const html = shell
  .replaceAll('{{TITLE}}', title.replace(/[<>&]/g, ''))
  .replace('{{CSS}}', () => css)
  .replace('{{JS}}', () => gradeJs + '\n' + mathJs + '\n' + js)
  .replace('{{DATA}}', () => json)
  .replace('{{FOOTER}}', footer.replace(/[<>&]/g, ''));

const out = path.resolve(outArg || path.join(process.cwd(), 'study.html'));
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html, 'utf8');

const kb = (Buffer.byteLength(html) / 1024).toFixed(1);
console.log(`✓ ${out}`);
console.log(`  ${kb} KB · 知识点 ${sum('points')} · 讲解段 ${sum('segments')} · 题目 ${sum('items')}` +
  (chapters.length > 1 ? ` · 章节 ${chapters.length}` : ''));
if (thin.length) {
  console.log(`\n⚠ 解释质量体检：${thin.length} 处可疑`);
  thin.slice(0, 12).forEach((t) => console.log('  - ' + t));
  if (thin.length > 12) console.log(`  … 还有 ${thin.length - 12} 处`);
}
