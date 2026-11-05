(function () {
  'use strict';

  var RAW = JSON.parse(document.getElementById('study-data').textContent);
  var BOOK = RAW.chapters ? RAW : { title: (RAW.meta || {}).title, chapters: [RAW] };
  var CH = 0;
  var DATA = BOOK.chapters[0];
  var META = DATA.meta || {};
  var multi = BOOK.chapters.length > 1;

  function keyOf() {
    return 'study:' + (META.title || 'untitled') + (multi ? ':' + CH : '');
  }

  /* ---------------- 持久化 ---------------- */
  function load() {
    try { return JSON.parse(localStorage.getItem(keyOf()) || '{}') || {}; }
    catch (e) { return {}; }
  }
  function save() {
    try { localStorage.setItem(keyOf(), JSON.stringify(S)); } catch (e) { /* 隐私模式静默失败 */ }
  }

  var S = load();
  S.ans = S.ans || {};      // qid -> {v, ok, tries, hint, at}
  S.learn = S.learn || {};  // segId -> {hints, revealed}

  /* ---------------- 工具 ---------------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /** 行内富文本：$$...$$ 块公式，$...$ 行内公式，**...** 加粗，其余转义 */
  function mdInline(s) {
    // 先把加粗换成哨兵，避免 ** 被公式切分切断
    var str = String(s == null ? '' : s)
      .replace(/\*\*([\s\S]+?)\*\*/g, '\u0001$1\u0002');
    var parts = str.split(/(\$\$[^$]+\$\$|\$[^$]+\$)/g);
    var h = '';
    parts.forEach(function (p) {
      if (p.length > 4 && p.slice(0, 2) === '$$' && p.slice(-2) === '$$') {
        h += '<div class="tex-block">' + window.MiniMath.render(p.slice(2, -2)) + '</div>';
      } else if (p.length > 2 && p[0] === '$' && p[p.length - 1] === '$') {
        h += '<span class="imath">' + window.MiniMath.render(p.slice(1, -1)) + '</span>';
      } else {
        h += esc(p)
          .replace(/\u0001/g, '<b>')
          .replace(/\u0002/g, '</b>')
          .replace(/\n/g, '<br>');
      }
    });
    return h;
  }
  function pct(n) { return Math.round(n * 100) + '%'; }

  /* ---------------- 判分（内核在 grade.js） ---------------- */
  var SG = window.StudyGrade;
  function grade(item, v) { return SG.grade(item, v); }

  function whyWrong(item) {
    if (!item.distractors || !item.distractors.length) return '';
    var a = S.ans[item.id];
    var d = item.distractors.filter(function (x) { return x.opt === Number(a && a.v); })[0];
    if (!d) return '';
    var map = { concept: '概念混淆', calc: '计算失误', reading: '审题不清', memory: '记忆模糊' };
    return map[d.mis] || '';
  }

  /* ---------------- 掌握度 ---------------- */
  function mastery() { return SG.mastery(DATA, S.ans); }

  /* ---------------- 讲解视图 ---------------- */
  function checkCard(seg) {
    var ck = seg.checkpoint;
    if (!ck) return '';
    var st = S.learn[seg.id] || { hints: 0, revealed: false };
    var hints = '';
    for (var i = 0; i < st.hints; i++) {
      hints += '<li>' + mdInline(ck.hints[i]) + '</li>';
    }
    var html = '<div class="check" data-seg="' + esc(seg.id) + '">';
    html += '<div class="q">' + mdInline(ck.q) + '</div>';
    if (st.hints > 0) html += '<ul class="hint-list">' + hints + '</ul>';
    html += '<div class="btn-row">';
    if (!st.revealed && st.hints < ck.hints.length) {
      html += '<button class="btn" data-act="hint">' +
        (st.hints === 0 ? '需要一点提示' : '再来一级提示') + '</button>';
    }
    if (!st.revealed) {
      html += '<button class="btn" data-act="reveal">' +
        (st.hints > 0 ? '看看答案' : '我卡住了，直接看答案') + '</button>';
    }
    html += '</div>';
    if (st.revealed) {
      html += '<div class="reveal">' + mdInline(ck.reveal) + '</div>';
    }
    html += '</div>';
    return html;
  }

  function decodeHtml(list) {
    if (!list || !list.length) return '';
    var h = '<dl class="decode">';
    list.forEach(function (d) {
      h += '<dt>' + esc(d.k) + '</dt><dd>' + mdInline(d.v) + '</dd>';
    });
    return h + '</dl>';
  }

  function stepsHtml(steps) {
    if (!steps || !steps.length) return '';
    var h = '<ol class="steps">';
    steps.forEach(function (s) {
      h += '<li><div class="op">' + mdInline(s.op) + '</div>' +
        (s.why ? '<div class="why">' + mdInline(s.why) + '</div>' : '') + '</li>';
    });
    return h + '</ol>';
  }

  function termList(list) {
    if (!list || !list.length) return '';
    var h = '<div class="term-list">';
    list.forEach(function (it) {
      h += '<div class="term-row"><div class="sym">' + mdInline(it.sym) + '</div>' +
        '<div class="desc">' + (it.name ? '<b>' + mdInline(it.name) + '</b>' : '') +
        mdInline(it.role || '') + '</div></div>';
    });
    return h + '</div>';
  }

  function renderBlock(b) {
    switch (b.type) {
      case 'text':
        return '<p class="blk-text">' + mdInline(b.md) + '</p>';

      case 'note':
        return '<div class="blk-note">' + mdInline(b.md) + '</div>';

      case 'figure':
        return '<figure class="blk figure">' +
          '<div class="blk-head"><span class="blk-tag">' + esc(b.label || '图') + '</span>' +
          (b.name ? '<b>' + mdInline(b.name) + '</b>' : '') + '</div>' +
          '<div class="fig">' + b.svg + '</div>' +
          (b.caption ? '<figcaption>' + mdInline(b.caption) + '</figcaption>' : '') +
          (b.note ? '<div class="takeaway"><b>看图要点</b>' + mdInline(b.note) + '</div>' : '') +
          '</figure>';

      case 'terms': {
        return '<div class="blk terms"><div class="blk-head"><span class="blk-tag">' +
          esc(b.label || '拆项') + '</span>' + (b.name ? '<b>' + mdInline(b.name) + '</b>' : '') + '</div>' +
          termList(b.items) + '</div>';
      }

      case 'definition':
      case 'theorem':
      case 'formula': {
        var tag = b.label || (b.type === 'formula' ? '公式' : b.type === 'theorem' ? '定理' : '定义');
        var body = b.tex
          ? '<div class="tex">' + window.MiniMath.render(b.tex) + '</div>'
          : '<div class="stmt">' + mdInline(b.statement || '') + '</div>';
        return '<div class="blk ' + b.type + '">' +
          '<div class="blk-head"><span class="blk-tag">' + esc(tag) + '</span>' +
          (b.name ? '<b>' + mdInline(b.name) + '</b>' : '') + '</div>' +
          body + termList(b.terms) + decodeHtml(b.decode) + '</div>';
      }

      case 'proof':
        return '<div class="blk proof">' +
          '<div class="blk-head"><span class="blk-tag">' + esc(b.label || '证明') + '</span></div>' +
          stepsHtml(b.steps) +
          (b.takeaway ? '<div class="takeaway"><b>可复用的套路</b>' + mdInline(b.takeaway) + '</div>' : '') +
          '</div>';

      case 'example':
        return '<div class="blk example">' +
          '<div class="blk-head"><span class="blk-tag">' + esc(b.label || '例题') + '</span>' +
          (b.name ? '<b>' + mdInline(b.name) + '</b>' : '') + '</div>' +
          '<div class="stmt">' + mdInline(b.stem || '') + '</div>' +
          stepsHtml(b.solution) +
          (b.takeaway ? '<div class="takeaway"><b>这题学到什么</b>' + mdInline(b.takeaway) + '</div>' : '') +
          '</div>';

      case 'table': {
        var t = '<div class="blk table"><div class="blk-head"><span class="blk-tag">' +
          esc(b.label || '表') + '</span>' + (b.name ? '<b>' + mdInline(b.name) + '</b>' : '') + '</div>';
        t += '<table class="formula-table">';
        if (b.head) {
          t += '<thead><tr>';
          b.head.forEach(function (c) { t += '<th>' + mdInline(c) + '</th>'; });
          t += '</tr></thead>';
        }
        t += '<tbody>';
        (b.rows || []).forEach(function (row) {
          t += '<tr>';
          row.forEach(function (c) { t += '<td>' + mdInline(c) + '</td>'; });
          t += '</tr>';
        });
        return t + '</tbody></table></div>';
      }

      default:
        return '';
    }
  }

  function tocHtml() {
    var segs = DATA.segments || [];
    if (segs.length < 4) return '';
    var h = '<nav class="toc">';
    segs.forEach(function (s, i) {
      h += '<a data-target="seg-' + i + '">' + (i + 1) + '. ' + esc(s.title || '') + '</a>';
    });
    return h + '</nav>';
  }

  function renderGuide() {
    var h = '';
    (DATA.segments || []).forEach(function (seg, i) {
      h += '<section class="card" id="seg-' + i + '">';
      h += '<h3><span class="no">' + (i + 1) + '</span>' + esc(seg.title || '') + '</h3>';
      (seg.kp || []).forEach(function (id) {
        var kp = (DATA.points || []).filter(function (p) { return p.id === id; })[0];
        if (kp) h += '<span class="kp-tag">' + esc(kp.title) + '</span>';
      });
      if (seg.blocks && seg.blocks.length) {
        seg.blocks.forEach(function (b) { h += renderBlock(b); });
      } else if (seg.script) {
        h += '<p>' + mdInline(seg.script) + '</p>';
      }
      h += checkCard(seg);
      h += '</section>';
    });
    if (!h) h = '<div class="empty">还没有讲解内容。</div>';
    return h;
  }

  /* ---------------- 题目控件 ---------------- */
  function optionHtml(item, idx, checked, locked, cls) {
    var sel = checked ? ' sel' : '';
    return '<label class="opt' + sel + (locked ? ' locked' : '') + (cls ? ' ' + cls : '') + '"' +
      ' data-opt="' + idx + '">' +
      '<span class="k">' + String.fromCharCode(65 + idx) + '</span>' +
      '<span>' + mdInline(item.options[idx]) + '</span>' +
      '</label>';
  }

  function itemBody(item, a) {
    var locked = !!a;
    var h = '';
    if (item.kind === 'single' || item.kind === 'stepwise' || item.kind === 'findError') {
      h += '<div class="opts" data-kind="' + item.kind + '">';
      item.options.forEach(function (_, i) {
        h += optionHtml(item, i, a && Number(a.v) === i, locked);
      });
      h += '</div>';
    } else if (item.kind === 'judge') {
      h += '<div class="opts" data-kind="judge">';
      [['正确', true], ['错误', false]].forEach(function (p, i) {
        h += '<label class="opt' + (a && a.v === p[1] ? ' sel' : '') + (locked ? ' locked' : '') +
          '" data-opt="' + i + '"><span class="k">' + (i === 0 ? '✓' : '✗') + '</span>' +
          '<span>' + p[0] + '</span></label>';
      });
      h += '</div>';
    } else if (item.kind === 'numeric') {
      h += '<input type="number" step="any" data-kind="numeric" placeholder="输入数值…" ' +
        (locked ? 'value="' + esc(a.v) + '" disabled' : '') + '>';
    } else if (item.kind === 'blank') {
      h += '<input type="text" data-kind="blank" placeholder="填写答案…" ' +
        (locked ? 'value="' + esc(a.v) + '" disabled' : '') + '>';
    } else if (item.kind === 'short') {
      h += '<textarea class="short" data-kind="short" rows="4" placeholder="用自己的话写下来…" ' +
        (locked ? 'disabled' : '') + '>' + (locked ? esc(a.v) : '') + '</textarea>';
    }
    return h;
  }

  function feedbackHtml(item, a) {
    if (!a) return '';
    var cls = a.ok ? 'ok' : 'err';
    var h = '<div class="feedback ' + cls + '">';
    if (a.ok) {
      h += '<div class="head">✓ 正确' + (a.tries > 0 ? '（提示后答对）' : '') + '</div>';
      if (a.tries > 0) h += '<div class="why">这次是靠提示想通的，记得到讲解里回看对应段落。</div>';
    } else {
      h += '<div class="head">✗ 还不对</div>';
      var w = whyWrong(item);
      if (w) h += '<div class="why">错因倾向：<b>' + esc(w) + '</b></div>';
      if (a.tries === 0) h += '<div class="why">再想一次。需要的话点「看提示」。</div>';
      else h += '<div class="why">正确答案已在上方标出。</div>';
    }
    if (item.model && a.ok) h += '<div class="why">参考：' + mdInline(item.model) + '</div>';
    h += '</div>';
    return h;
  }

  function renderQuiz() {
    var h = '';
    var items = DATA.items || [];
    var done = items.filter(function (it) { return S.ans[it.id]; }).length;
    h += '<div class="card" style="display:flex;justify-content:space-between;align-items:center;gap:12px">';
    h += '<div><b>已作答 ' + done + ' / ' + items.length + '</b>';
    if (done === items.length) h += ' · 全部完成，去看学习报告';
    h += '</div>';
    if (done > 0) h += '<button class="btn" data-act="reset">重新开始</button>';
    h += '</div>';

    items.forEach(function (item, i) {
      var a = S.ans[item.id];
      h += '<section class="card" data-q="' + esc(item.id) + '">';
      h += '<div class="qmeta">';
      h += '<span class="pill">第 ' + (i + 1) + ' 题</span>';
      (item.kp || []).forEach(function (id) {
        var kp = (DATA.points || []).filter(function (p) { return p.id === id; })[0];
        if (kp) h += '<span class="pill kind">' + esc(kp.title) + '</span>';
      });
      h += '</div>';
      h += '<div class="stem">' + mdInline(item.stem) + '</div>';
      h += itemBody(item, a);
      h += feedbackHtml(item, a);
      h += '<div class="btn-row" data-row="' + esc(item.id) + '">';
      if (!a) {
        h += '<button class="btn primary" data-act="submit">提交</button>';
      } else if (!a.ok && a.tries === 0) {
        h += '<button class="btn" data-act="hint">看提示</button>';
        h += '<button class="btn primary" data-act="retry">再答一次</button>';
      } else if (!a.ok) {
        h += '<button class="btn" data-act="show">显示答案</button>';
      }
      h += '</div>';
      h += '<div class="hint-slot"></div>';
      h += '</section>';
    });
    return h;
  }

  /* ---------------- 报告 ---------------- */
  function renderReport() {
    var m = mastery();
    var h = '';
    var total = 0, cnt = 0, correct = 0, firstTry = 0;
    (DATA.items || []).forEach(function (it) {
      var a = S.ans[it.id];
      if (!a) return;
      cnt++;
      if (a.ok) { correct++; if (a.tries === 0) firstTry++; }
    });
    total = (DATA.items || []).length;

    h += '<div class="card">';
    h += '<h3>总体</h3>';
    h += '<p>已作答 <b>' + cnt + '</b> / ' + total + ' 题；正确 <b>' + correct + '</b>；' +
      '一次答对 <b>' + firstTry + '</b>。</p>';
    if (cnt) h += '<p class="stat-sub">正确率 ' + pct(correct / cnt) + '，首次正确率 ' + pct(firstTry / cnt) + '。</p>';
    h += '</div>';

    h += '<div class="card"><h3>知识点掌握度</h3>';
    (DATA.points || []).forEach(function (kp) {
      var v = m[kp.id];
      var cls = v == null ? '' : (v < 0.4 ? 'low' : v < 0.75 ? 'mid' : 'high');
      h += '<div class="kp-row">';
      h += '<div class="nm">' + esc(kp.title) + '</div>';
      h += '<div class="bar"><span class="' + cls + '" style="width:' + (v == null ? 0 : Math.round(v * 100)) + '%"></span></div>';
      h += '<div class="v">' + (v == null ? '—' : pct(v)) + '</div>';
      h += '</div>';
    });
    h += '</div>';

    var wrong = (DATA.items || []).filter(function (it) { return S.ans[it.id] && !S.ans[it.id].ok; });
    h += '<div class="card"><h3>待补漏（' + wrong.length + '）</h3>';
    if (!wrong.length) {
      h += '<div class="empty">没有错题。可以去做「检验」里的提示题巩固。</div>';
    } else {
      wrong.forEach(function (it, i) {
        var kp = (DATA.points || []).filter(function (p) { return (it.kp || []).indexOf(p.id) >= 0; })[0];
        h += '<p><b>' + (i + 1) + '.</b> ' + esc(it.stem.split('\n')[0]).slice(0, 60) + '…';
        if (kp) h += ' <span class="kp-tag">' + esc(kp.title) + '</span>';
        h += '</p>';
      });
      h += '<div class="btn-row"><button class="btn primary" data-act="goto-quiz">回到检验重做</button></div>';
    }
    h += '</div>';
    return h;
  }

  /* ---------------- 事件 ---------------- */
  var view = 'guide';
  try {
    var want = new URLSearchParams(location.search).get('view') ||
      (location.hash || '').replace(/^#/, '');
    if (want && ['guide', 'quiz', 'report'].indexOf(want) >= 0) view = want;
  } catch (e) {}

  function renderChapters() {
    var box = document.getElementById('chapters');
    if (!box) return;
    if (!multi) { box.innerHTML = ''; return; }
    var h = '<div class="chapters">';
    BOOK.chapters.forEach(function (c, i) {
      var t = (c.meta || {}).title || ('第 ' + (i + 1) + ' 章');
      h += '<button class="ch' + (i === CH ? ' on' : '') + '" data-ch="' + i + '">' + esc(t) + '</button>';
    });
    box.innerHTML = h + '</div>';
  }

  function switchChapter(i) {
    if (i === CH || !BOOK.chapters[i]) return;
    CH = i;
    DATA = BOOK.chapters[i];
    META = DATA.meta || {};
    S = load();
    S.ans = S.ans || {};
    S.learn = S.learn || {};
    view = 'guide';
    render();
    window.scrollTo(0, 0);
  }

  function render() {
    var main = document.getElementById('main');

    document.getElementById('title').textContent = META.title || '学习页';
    document.getElementById('sub').innerHTML =
      (META.course ? '<span>' + esc(META.course) + '</span>' : '') +
      (META.subject ? '<span>' + esc(META.subject) + '</span>' : '') +
      (multi ? '<span>共 ' + BOOK.chapters.length + ' 章</span>' : '');
    renderChapters();

    if (view === 'guide') main.innerHTML = tocHtml() + renderGuide();
    else if (view === 'quiz') main.innerHTML = renderQuiz();
    else main.innerHTML = renderReport();

    document.querySelectorAll('.tab').forEach(function (t) {
      t.setAttribute('aria-selected', t.dataset.view === view ? 'true' : 'false');
    });
    var badge = document.getElementById('badge-quiz');
    if (badge) {
      var n = (DATA.items || []).filter(function (it) { return S.ans[it.id]; }).length;
      badge.textContent = n ? n : '';
      badge.style.display = n ? '' : 'none';
    }
  }

  document.addEventListener('click', function (e) {
    var tab = e.target.closest && e.target.closest('.tab');
    if (tab) { view = tab.dataset.view; render(); window.scrollTo(0, 0); return; }

    var tocItem = e.target.closest && e.target.closest('.toc a');
    if (tocItem) {
      var target = document.getElementById(tocItem.dataset.target);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    var chBtn = e.target.closest && e.target.closest('.chapters .ch');
    if (chBtn) { switchChapter(Number(chBtn.dataset.ch)); return; }

    var act = e.target.closest && e.target.closest('[data-act]');
    if (act) {
      var a = act.dataset.act;
      if (a === 'goto-quiz') { view = 'quiz'; render(); window.scrollTo(0, 0); return; }
      if (a === 'reset') {
        if (confirm('清空全部作答记录？')) { S.ans = {}; S.learn = {}; save(); render(); }
        return;
      }
      if (a === 'hint' || a === 'reveal') { handleCheck(act, a); return; }
      if (a === 'submit' || a === 'retry' || a === 'show') { handleQuiz(act, a); return; }
    }

    var opt = e.target.closest && e.target.closest('.opt');
    if (opt) {
      var opts = opt.parentElement;
      if (opts.classList.contains('locked')) return;
      opts.querySelectorAll('.opt').forEach(function (o) { o.classList.remove('sel'); });
      opt.classList.add('sel');
      return;
    }
  });

  function handleCheck(el, action) {
    var box = el.closest('.check');
    var segId = box.dataset.seg;
    var st = S.learn[segId] || (S.learn[segId] = { hints: 0, revealed: false });
    if (action === 'hint') st.hints++;
    if (action === 'reveal') st.revealed = true;
    save();
    var seg = (DATA.segments || []).filter(function (s) { return s.id === segId; })[0];
    var fresh = document.createElement('div');
    fresh.innerHTML = checkCard(seg);
    box.replaceWith(fresh.firstElementChild);
  }

  function handleQuiz(el, action) {
    var card = el.closest('[data-q]');
    var qid = card.dataset.q;
    var item = (DATA.items || []).filter(function (it) { return it.id === qid; })[0];
    var cur = S.ans[qid];

    if (action === 'show') {
      cur.ok = false;
      cur.tries = 1;
      revealAnswer(item, card);
      save();
      return;
    }

    if (action === 'retry') {
      // 解除锁定，保留一次机会
      cur.retry = true;
      var body = card.querySelector('.opts, input, textarea');
      if (body) {
        card.querySelectorAll('.opt').forEach(function (o) { o.classList.remove('locked', 'sel'); });
        card.querySelector('.opts') && card.querySelector('.opts').classList.remove('locked');
        if (body.disabled) body.disabled = false;
        if (body.value !== undefined) body.value = '';
        body.focus && body.focus();
      }
      var row = card.querySelector('.btn-row');
      row.innerHTML = '<button class="btn primary" data-act="submit">提交</button>';
      var fb = card.querySelector('.feedback');
      if (fb) fb.remove();
      return;
    }

    // submit
    var v = readValue(card, item);
    if (v === null || v === '') { flashEmpty(card); return; }
    var ok = grade(item, v);
    var tries = cur ? (cur.tries || 0) : 0;
    S.ans[qid] = { v: v, ok: ok, tries: ok ? tries : tries + 1, at: Date.now() };
    save();
    applyResult(card, item, S.ans[qid]);
  }

  function readValue(card, item) {
    if (item.kind === 'single' || item.kind === 'stepwise' || item.kind === 'findError') {
      var sel = card.querySelector('.opt.sel');
      return sel ? Number(sel.dataset.opt) : null;
    }
    if (item.kind === 'judge') {
      var sj = card.querySelector('.opt.sel');
      if (!sj) return null;
      return Number(sj.dataset.opt) === 0;
    }
    var input = card.querySelector('input, textarea');
    if (!input) return null;
    return input.value.trim();
  }

  function flashEmpty(card) {
    var stem = card.querySelector('.stem');
    stem.style.transition = 'color .2s';
    stem.style.color = 'var(--err)';
    setTimeout(function () { stem.style.color = ''; }, 500);
  }

  function applyResult(card, item, a) {
    var opts = card.querySelector('.opts');
    if (opts) {
      card.querySelectorAll('.opt').forEach(function (o, i) {
        o.classList.add('locked');
        o.classList.remove('sel');
        if (item.kind === 'judge') {
          var isTrue = i === 0;
          if (isTrue === item.answer) o.classList.add('ok');
          else if (Number(a.v) === i) o.classList.add('bad');
        } else {
          if (i === Number(item.answer)) o.classList.add('ok');
          else if (Number(a.v) === i) o.classList.add('bad');
        }
      });
    }
    var input = card.querySelector('input, textarea');
    if (input) {
      input.disabled = true;
      input.classList.add(a.ok ? 'ok' : 'bad');
    }
    var fb = card.querySelector('.feedback');
    if (fb) fb.remove();
    card.querySelector('.stem').insertAdjacentHTML('afterend', feedbackHtml(item, a));

    var row = card.querySelector('.btn-row');
    if (a.ok) {
      row.innerHTML = '';
    } else if (a.tries === 1) {
      row.innerHTML = '<button class="btn" data-act="hint">看提示</button>' +
        '<button class="btn primary" data-act="retry">再答一次</button>';
    } else {
      row.innerHTML = '<button class="btn" data-act="show">显示答案</button>';
    }
    updateBadge();
  }

  function revealAnswer(item, card) {
    card.querySelectorAll('.opt').forEach(function (o, i) {
      if (item.kind === 'judge') { if ((i === 0) === item.answer) o.classList.add('ok'); }
      else if (i === Number(item.answer)) o.classList.add('ok');
    });
    var box = card.querySelector('.feedback') || document.createElement('div');
    box.className = 'feedback err';
    var ans = item.kind === 'judge' ? (item.answer ? '正确' : '错误')
      : (item.options ? String.fromCharCode(65 + Number(item.answer)) : item.answer);
    box.innerHTML = '<div class="head">答案是：' + esc(ans) + '</div>' +
      (item.model ? '<div class="why">' + mdInline(item.model) + '</div>' : '');
    if (!box.parentElement) card.querySelector('.stem').insertAdjacentHTML('afterend', box.outerHTML);
    card.querySelector('.btn-row').innerHTML = '';
    updateBadge();
  }

  function updateBadge() {
    var n = (DATA.items || []).filter(function (it) { return S.ans[it.id]; }).length;
    document.getElementById('badge-quiz').textContent = n || '';
  }

  /* ---------------- 进度导出 / 导入（手机端 localStorage 可能不可用时的兜底） ---------------- */
  var ioBox = document.getElementById('io');
  var ioText = document.getElementById('io-text');
  var ioMode = 'export';

  document.getElementById('export').addEventListener('click', function () {
    ioMode = 'export';
    ioText.value = JSON.stringify({ v: 1, chapter: CH, data: S }, null, 1);
    ioBox.hidden = false;
    ioText.focus();
    ioText.select();
  });

  document.getElementById('import').addEventListener('click', function () {
    ioMode = 'import';
    ioText.value = '';
    ioText.placeholder = '把导出的进度 JSON 粘贴到这里';
    ioBox.hidden = false;
    ioText.focus();
  });

  document.getElementById('io-close').addEventListener('click', function () {
    ioBox.hidden = true;
  });

  document.getElementById('io-apply').addEventListener('click', function () {
    if (ioMode !== 'import') { ioBox.hidden = true; return; }
    try {
      var obj = JSON.parse(ioText.value);
      if (obj.chapter != null && multi) { CH = Math.min(obj.chapter, BOOK.chapters.length - 1); DATA = BOOK.chapters[CH]; META = DATA.meta || {}; }
      S = (obj.data || obj);
      S.ans = S.ans || {};
      S.learn = S.learn || {};
      save();
      ioBox.hidden = true;
      render();
    } catch (e) {
      alert('不是合法的进度数据');
    }
  });

  /* ---------------- 启动 ---------------- */
  document.getElementById('clear').addEventListener('click', function () {
    if (!confirm('清空本章的全部作答记录？')) return;
    try { localStorage.removeItem(keyOf()); } catch (e) {}
    S = { ans: {}, learn: {} };
    render();
  });

  render();
})();
