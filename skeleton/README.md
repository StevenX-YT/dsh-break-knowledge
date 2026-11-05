# 章节骨架（skeleton）

写 `content.json` 时不必从空白开始：先按本节的内容形态选一份骨架，把 `TODO:` 换成实际内容，
再用 `engine/render.mjs` 渲染自检。骨架只保留结构，不含任何真实题目内容。

- `theorem-track.json` —— 定理型：定理 → 证明 → 例题 → 公式表
- `concept-track.json` —— 概念型：定义 → 性质/判据 → 例题 → 易错

两份骨架都是可直接渲染的完整 `content.json`（占位符不触发结构错误，也不触发解释质量体检）。

## 怎么选

看这一节的**主线动作**：是"证明一条法则、再拿它算题"，还是"把一堆现象收进一个定义、再辨析边界"。

| 你手里的材料 | 选这份 | 两份样本的对应证据 |
|---|---|---|
| 有一条或多条要证的定理，证明步骤 ≥ 4 步 | theorem-track | 高数 P73–78：2 个 theorem 块、2 段 proof（10 步 / 4 步） |
| 证明之后紧跟大量计算练习 | theorem-track | 高数：8 个 example 块，横跨 4 个 segment |
| 末尾有汇总公式表 | theorem-track | 高数：1 个 table 块（23 行，3 列） |
| 本节主体是一个定义，剩下都是它的推论与边界情形 | concept-track | 线代 demo：1 个 definition、1 个 formula |
| 证明只有一小段，甚至没有 | concept-track | 线代 demo：只有 1 段 proof（7 步），例题也只有 1 个 |
| 大量篇幅在辨析"哪种说法是错的" | concept-track | 线代 demo：note 块 6 个，其中 3 个专门写易错 |

两份样本的规模，可作篇幅参照：

| | 知识点 points | 讲解段 segments | 题目 items | why 条数 | 例题 | 定理 | 表格 | 图 |
|---|---|---|---|---|---|---|---|---|
| 高数 P73–78（定理型） | 7 | 9 | 12 | 44 | 8 | 2 | 1 | 2 |
| 线代 demo（概念型） | 4 | 6 | 9 | 15 | 1 | 2 | 0 | 0 |

差异在**例题密度**：定理型靠"同一招式在不同结构上重复"撑起理解（两层 / 带根号 / 三层 / 内层还是乘积），
概念型靠"定义 + 反例辨析"撑起理解（零向量算不算、λ=0 意味着什么、有重根是否就不可对角化），例题只留一个代表性的。
两条线的段落骨架分别对应这两种撑法。

## 怎么填（按这个顺序，别倒过来）

1. `meta`：`title` 用教材小节名；`course` / `subject` / `source` 写清版次与页码范围。
2. `points`：先定 2–3 个（样本是 7 / 4 个）。`id` 会被 `segments[].kp` 和 `items[].kp` 引用；
   掌握度按 `kp` 聚合（`engine/grade.js` 的 `mastery`），所以每个 kp 至少要挂一道题。
3. `segments`：逐段填 `blocks`。段的划分照骨架里的标题走，标题本身就是"这段要回答的问题"。
4. `checkpoint`：每段一个，`hints` 恰好 3 级 —— 两份样本 15 个 checkpoint 全部是 3 条，没有例外。
5. `items`：骨架给了 7 种题型各一道；样本里两份内容都覆盖了全部 7 种
   （single / judge / blank / numeric / stepwise / findError / short）。
6. `why`：按 `why-guide.md` 写。这是骨架里唯一"填了等于没填"的字段。

## 各 block 的必填字段

渲染器只强制检查 `meta.title`、`points` 是数组、`items` 是数组、`items[].id`、
非 `short` 题必须有 `answer`、`single|stepwise|findError` 必须有 `options`（见 `engine/render.mjs` 的结构校验）。
其余字段缺了不报错，但页面上那一块就消失了 —— 所以骨架里全部写全。

| block | 必填 | 样本里的用法 |
|---|---|---|
| `text` | `md` | 动机、铺垫、变形说明；支持 `$公式$` 与 `**加粗**` |
| `note` | `md` | 收口、考场提示、易错条目；概念型样本里 6 个 note 有 3 个是易错 |
| `definition` / `theorem` | `label` `name` `statement`、`terms[]`、`decode[]` | `decode` 回答"这话什么意思/为什么这样写/几何上什么样" |
| `formula` | `label` `name` `tex` | 用内置迷你渲染器支持的记号；`decode` 写"怎么来的/什么时候用/能推广吗" |
| `proof` | `steps[{op, why}]`、`takeaway` | 两份样本所有 proof 都有 takeaway（0 例外） |
| `example` | `stem` `solution[{op, why}]`、`takeaway` | 两份样本所有 example 都有 takeaway（0 例外） |
| `terms` | `items[{sym, name, role}]` | `role` 以「：」开头，写"它是什么量的什么率" |
| `table` | `head[]` `rows[][]` | 高数公式总表：3 列，含"记忆点"列 |
| `figure` | `svg` `caption` `note` | 只画盒子 + 箭头；缺 `svg` 会被体检报出来 |

## 占位符替换规则

- `TODO:` 后面那句话是**指令**，不是要保留的文案。例如 `"TODO: 说清它把哪一类原来算不出的题变成能算的"`，
  填成"它把嵌套求导拆成逐层求导再相乘"。
- 骨架里的 `role` 都以「：」开头、`hints` 都是三级递进，这两处格式别改，改的是内容。
- 骨架的 `example` 只留了一个位置，实际写几个看题型：定理型样本 8 个，概念型样本 1 个。

## 自检

```
node engine/render.mjs skeleton/theorem-track.json D:\dsh-data\cache\test.html
```

判定标准：打印 `✓ 输出路径` 且**没有**"解释质量体检"段落。有体检提示就回去改对应步骤的 why，
体检只查 why 太短（< 14 字）和套话词，查不出"复述步骤"这类问题 —— 后者要靠 `why-guide.md` 的自查清单。

## 边界

`samples/`、`engine/`、`plugin/` 下的文件不动；骨架只引用它们的字段约定，不复制它们的正文。
