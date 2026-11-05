# 学习助手插件 · 方案 v2

> 已定：**路线 C（动态家教）** · **大学专业课** · **产物两个都要**（独立 HTML + 插件内学习端）
> 目标：上传课本正文图片 → 解析整理 → 引导式问答讲解 → 问答检验 → 查缺补漏。

---

## 1. 关键结构判断：一份内容，两种封装

“独立文件带走”和“动态家教”在技术上天然冲突：`file://` 打开的页面拿不到本机模型。
所以不是二选一，而是**同一份内容，两种封装**：

| | 独立文件版 | 插件内版 |
|---|---|---|
| 打开方式 | 双击 HTML | DSH 面板 / 会话视图 |
| 判分、讲解、错题、复习 | ✅ 全本地 | ✅ 全本地 |
| 「问老师」（追问/变式题） | ❌ 无 | ✅ 走主会话模型 |
| 进度存储 | localStorage + 导出 JSON | Host 档案（跨设备可见） |

实现上只写**一份 HTML 引擎**：页面启动时探测 `window.__STUDY_HOST__`，
有就走 Host API，没有就退回本地题库。导出物只是把引擎和静态数据打成一个文件。

**这意味着：90% 的价值在静态部分（判分/讲解/闭环），动态只做点睛。**

---

## 2. 核心体验设计：双层反馈

动态家教的死穴是延迟 —— 每次答题都等模型 5-15 秒，没人受得了。所以拆两层：

```
学生作答
 ├─ 即时层（本地 JS，<50ms）  判分 · 错因标签 · 提示阶梯 · 掌握度更新
 └─ 深度层（模型，按需触发）  讲为什么 · 变式题 · 换个角度解释
```

**触发规则**（不是每次都用模型）：

| 场景 | 行为 |
|---|---|
| 答对 | 只给即时反馈，不调模型 |
| 答错第一次 | 给错因标签 + 回跳讲解锚点（本地） |
| 答错第二次 | 自动请求模型：针对这个错误模式解释 |
| 主动点「问老师」 | 请求模型 |
| 连续错 3 题 | 生成 2 道变式题（结果缓存复用） |

这样模型的调用量降到答题次数的 10% 以下，延迟可接受，成本可控。

---

## 3. 动态能力的边界（什么实时、什么预生成）

| 能力 | 策略 | 原因 |
|---|---|---|
| 讲解正文 | 预生成，全量落盘 | 稳定、可审查、可导出 |
| 基础题库 | 预生成（每知识点 3-5 题） | 覆盖 + 一致性 |
| 变式题 | 预生成 2 套 + 触发式实时补充 | 实时慢且不稳，作补充 |
| 追问解释 | 实时 | 价值最高，无法预生成 |
| 错因诊断 | 本地规则 + 模型补充 | 规则命中 80% |
| 学习报告 | 本地生成 | 纯统计 |

---

## 4. 大学专业课的五个定制点

1. **术语密度**：每章自动抽 30-80 个术语，独立术语表（可搜索、可卡片式记忆），讲解里首次出现的术语自动加链接。
2. **知识依赖图**：不只是树，是 DAG。前置知识没掌握会提示“建议先学 X”，**可以做可视化**（本地 SVG，不依赖库）。
3. **跳过已会**：开头做 5 题诊断，已掌握的知识点折叠，不重复讲。
4. **考前冲刺模式**：只刷错题 + 高频考点 + 易混对比，压缩到 20 分钟。
5. **公式**：理工科必然有。单文件内联 KaTeX（约 400KB）；非理工科自动跳过，减小体积。

---

## 5. 插件落点（DSH 侧）

| 能力 | 扩展点 | 已核实 |
|---|---|---|
| 学习界面 | `conversation.view`（注册一个「学习」视图 tab） | ✅ slot 存在 |
| 快捷入口 | `sidebar.panellist`（侧栏图标） | ✅ |
| 生成进度 | `conversation.chat.node` 自定义行 或 面板内进度条 | ✅ 需注册事件定义 |
| 成品预览 | `ctx.webServer.register('/study/<id>')` 路由 | ✅ 服务存在 |
| 档案 | `ctx.storage` / 工作区 JSON | ✅ |
| 问老师 | 主会话 `agent.followup()` + 读会话事件 | ⚠️ 需开发时确认细节 |

**图片输入通路（已实测）**：
用户在对话里贴图 → Agent 用 `read_image` 拿到 normalized host 路径（如 `.dsh\attachments\v1\objects\...`）
→ 交给 OCR/切图脚本。面板侧只做「选工作区文件 + 看进度 + 开成品」，不自建上传控件。

---

## 6. 数据模型（一份，两种封装共用）

```jsonc
{
  "meta": { "subject": "...", "course": "...", "sources": ["p12-14"] },
  "glossary": [{ "t": "边际效用", "d": "...", "en": "marginal utility" }],
  "points": [{
    "id": "kp3", "title": "...", "type": "concept|formula|procedure|fact",
    "def": "...", "why": "...", "examples": [], "pitfalls": [],
    "prereq": ["kp1"], "term": ["t7"], "examWeight": 0.8
  }],
  "segments": [{ "id": "s4", "kp": ["kp3"], "script": "...", "checkpoint": {...} }],
  "items": [{
    "id": "q12", "kp": ["kp3"], "kind": "single|multi|judge|blank|numeric|order|match|hotspot|stepwise|findError|short",
    "stem": "...", "options": [], "answer": ..., "tolerance": null,
    "hint": ["方向提示", "局部提示", "半答案"],
    "distractors": [{ "opt": "B", "mis": "concept" }],
    "variants": ["q12v1", "q12v2"]
  }],
  "reviews": [{ "item": "q12", "box": 2, "due": "2026-11-09" }]
}
```

`distractors.mis` 就是错因标签：`concept`（概念不清）/ `calc`（计算失误）/ `reading`（审题错误）/ `memory`（记忆遗忘）。

---

## 7. 管线（一键 = 后台跑完）

```
① 摄取  分块(2×3) → OCR + 模型视觉 → 交叉校验 → page.json
② 建模  知识点 DAG + 术语表 + 讲解分段
③ 出题  每知识点 3-5 题，覆盖 概念/应用/易错，附干扰项错因
④ 变式  每知识点预生成 2 套
⑤ 渲染  单文件 HTML（数据内嵌 + KaTeX 内联）
⑥ 封装  导出文件 / 插件内视图
```

每页约 40-90 秒（OCR 5s + 模型转录 + 出题）。整章 20 页 → 15-30 分钟，必须后台任务 + 进度条。

---

## 8. 里程碑（6-9 天）

| 阶段 | 内容 | 工作量 |
|---|---|---|
| M1 | 摄取 + 建模 + 静态 HTML 引擎（讲解/作答/判分） | 2 天 |
| M2 | 闭环：掌握度、错题本、复习队列、术语表、知识 DAG | 2 天 |
| M3 | 插件化：conversation.view 视图、侧栏入口、/study 路由、档案 | 2-3 天 |
| M4 | 问老师（动态）、变式题、导出、考前冲刺、打印卷 | 1-2 天 |

**M1 结束就能出样张**，可以拿一页真实教材验内容质量。

### 进度

- [x] **M1-a 内核**（2026-11-05）：单文件 HTML 引擎跑通
  - `engine/` 下 render.mjs · app.js · grade.js · math.js · app.css · shell.html
  - 讲解（三级提示）、检验（6 种题型）、报告（掌握度 + 待补漏）
  - 测试：判分单测 28 项 + 无头浏览器端到端 20 项（数据驱动），全通过
- [x] **M1-b 真实教材端到端**（2026-11-05）：高数 P73–78 六页 → 一个学习页
  - 7 知识点 · 9 讲解段 · 12 题 · 76.6 KB
  - 内容块：定义/定理/公式/证明/例题/注意/表格
  - 自研迷你公式渲染器（`math.js`）：`\frac \sqrt ^{} _{} \varphi \Delta` 等，零外部依赖
- [ ] M1-c 插件壳（Host 工具 + 面板）
- [ ] M2 摄取管线自动化（图片 → content.json，现在这一步还是手工）

---

## 9. 风险

| 风险 | 规避 |
|---|---|
| 动态请求延迟高 | 双层反馈，模型只在必要时触发 |
| 变式题质量不稳 | 预生成为主，实时为辅，结果缓存并标注「未审核」 |
| 整章处理超时 | 后台任务 + 分页产出，先出可用版本再补 |
| 教材图糊 | 分块放大 + 双通道交叉校验 + `uncertain` 标记 |
| 模型超纲发挥 | 讲解只允许基于 page.json，越界标「延伸」 |
| 单文件过大 | 只内嵌关键插图；公式 KaTeX 按科目开关 |

---

## Plan Verification

- **Mode**: fact-check (fallback — logicprobe plugin not installed)
- **Claims checked**: 7 confirmed, 0 refuted, 2 unverified (deferred to M1)
  - `read_image` 返回 host 绝对路径 → 本会话实测（s1.png → `.dsh\attachments\v1\objects\ad\ad43…`）→ confirmed
  - rapidocr-onnxruntime 1.4.4 可推理（init 1.44s / infer 5.11s / 60 行）→ 本机 python 实测 → confirmed
  - 模型可读中文教材图 → `read_image` 后能逐字复述图中文字 → confirmed
  - `attachments.readImageRequest` / `imageHostPath` 存在 → `cordis_inspect_query(Service, attachments)` → confirmed
  - `conversation.view` slot 是「Registered Conversation target Views, rendered one at a time」→ `Slots.listSubTree` → confirmed
  - `sidebar.panellist` 为 list slot → `Slots.listSubTree` → confirmed
  - `webServer.register(route)` 存在 → `Service` 目录 → confirmed
  - ⚠️ `agent.followup()` 用于学习端「问老师」→ practices.md 提及 `agent.followup()` 会唤醒 agent，但具体事件读取路径未在本次核实 → **unverified，M3 前先验证**
  - ⚠️ 单文件内联 KaTeX 体积、`file://` 下 localStorage 行为 → 外部事实，M1 实测
- **Escalation**: model verification NOT run (requires logicprobe plugin)
