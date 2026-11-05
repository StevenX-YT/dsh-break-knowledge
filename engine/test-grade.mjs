#!/usr/bin/env node
/**
 * 判分内核测试：node engine/test-grade.mjs
 * 只测纯函数，不碰 DOM。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// grade.js 是 IIFE，import 即执行并挂到 globalThis
await import(pathToFileURL(path.join(HERE, 'grade.js')).href);
const SG = globalThis.StudyGrade;

const data = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'samples', 'demo-content.json'), 'utf8'));
const byId = Object.fromEntries(data.items.map((it) => [it.id, it]));

let pass = 0;
const fails = [];

function t(name, fn) {
  try {
    const ok = fn();
    if (ok) { pass++; }
    else fails.push(name);
  } catch (e) {
    fails.push(name + ' — ' + e.message);
  }
}

/* ---- 单选 ---- */
t('q1 正确项', () => SG.grade(byId.q1, 1) === true);
t('q1 错误项', () => SG.grade(byId.q1, 0) === false);
t('q1 未选', () => SG.grade(byId.q1, null) === false);

/* ---- 判断 ---- */
t('q2 对', () => SG.grade(byId.q2, true) === true);
t('q2 错', () => SG.grade(byId.q2, false) === false);
t('q2 字符串 true', () => SG.grade(byId.q2, 'true') === true);

/* ---- 数值 ---- */
t('q3 精确命中', () => SG.grade(byId.q3, 1) === true);
t('q3 浮点命中', () => SG.grade(byId.q3, '1.0') === true);
t('q3 容差外', () => SG.grade(byId.q3, 1.4) === false);
t('q3 非数字', () => SG.grade(byId.q3, 'abc') === false);
t('q3 空', () => SG.grade(byId.q3, '') === false);

/* ---- 填空（多答案 / 全半角 / 大小写 / 空格） ---- */
t('q4 标准', () => SG.grade(byId.q4, 'tr(A)') === true);
t('q4 中文别名', () => SG.grade(byId.q4, '迹') === true);
t('q4 大小写空格', () => SG.grade(byId.q4, '  TR(A) ') === true);
t('q4 全角括号', () => SG.grade(byId.q4, 'tr（A）') === true);
t('q4 错误答案', () => SG.grade(byId.q4, 'λ') === false);
t('q4 空', () => SG.grade(byId.q4, '   ') === false);

/* ---- 分步 / 找错（按单选处理） ---- */
t('q5 正确', () => SG.grade(byId.q5, 1) === true);
t('q6 正确', () => SG.grade(byId.q6, 1) === true);

/* ---- 简答（关键词覆盖） ---- */
t('q7 命中半数以上', () =>
  SG.grade(byId.q7, '不同特征值对应的特征向量线性无关，n 个就够张成空间') === true);
t('q7 全不沾边', () => SG.grade(byId.q7, '因为矩阵是对称的') === false);

/* ---- 掌握度 ---- */
t('掌握度：答对给满分', () => {
  const m = SG.mastery(
    { points: [{ id: 'k1' }], items: [{ id: 'a', kp: ['k1'] }] },
    { a: { ok: true, tries: 0 } }
  );
  return m.k1 === 1;
});
t('掌握度：提示后答对打折', () => {
  const m = SG.mastery(
    { points: [{ id: 'k1' }], items: [{ id: 'a', kp: ['k1'] }] },
    { a: { ok: true, tries: 2 } }
  );
  return m.k1 === 0.7;
});
t('掌握度：未答的知识点为 null', () => {
  const m = SG.mastery({ points: [{ id: 'k2' }], items: [] }, {});
  return m.k2 === null;
});
t('掌握度：未答的题不计入分母', () => {
  const m = SG.mastery(
    { points: [{ id: 'k1' }], items: [{ id: 'a', kp: ['k1'] }, { id: 'b', kp: ['k1'] }] },
    { a: { ok: true, tries: 0 } }
  );
  return m.k1 === 1;
});
t('掌握度：答错拉低', () => {
  const m = SG.mastery(
    { points: [{ id: 'k1' }], items: [{ id: 'a', kp: ['k1'] }, { id: 'b', kp: ['k1'] }] },
    { a: { ok: true, tries: 0 }, b: { ok: false, tries: 2 } }
  );
  return m.k1 === 0.5;
});

/* ---- 归一化 ---- */
t('norm 全角转半角', () => SG.norm('ＡＢＣ') === 'abc');
t('norm 去标点空白', () => SG.norm(' a，b 。 c ') === 'abc');

console.log(`\n${pass} 通过 / ${pass + fails.length} 项`);
if (fails.length) {
  console.log('失败：');
  fails.forEach((f) => console.log('  ✗ ' + f));
  process.exit(1);
}
console.log('全部通过 ✓');
