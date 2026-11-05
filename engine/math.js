/**
 * 轻量公式渲染器 —— 只做高数页面真正用得上的那几个结构。
 *
 * 支持：^{} _{} \frac{}{} \sqrt{} \left( \right) \, \sin\cos\ln … 
 * 不追求 TeX 兼容，追求「零依赖 + 体积小 + 够用」。
 */
(function (global) {
  'use strict';

  var FN = ['sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'ln', 'log', 'lg',
    'lim', 'arcsin', 'arccos', 'arctan', 'arccot', 'sh', 'ch', 'th',
    'arsh', 'arch', 'arth', 'max', 'min', 'exp'];

  function esc(s) {
    return String(s).replace(/[&<>]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c];
    });
  }

  /** 从 i 开始读一个参数：{...} 或单个字符 */
  function arg(s, i) {
    while (s[i] === ' ') i++;
    if (s[i] === '{') {
      var depth = 0, start = i + 1;
      for (; i < s.length; i++) {
        if (s[i] === '{') depth++;
        else if (s[i] === '}') {
          depth--;
          if (depth === 0) return { body: s.slice(start, i), end: i + 1 };
        }
      }
      return { body: s.slice(start), end: s.length };
    }
    return { body: s[i] || '', end: i + 1 };
  }

  var GREEK = {
    alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', Delta: 'Δ', epsilon: 'ε',
    varepsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ', lambda: 'λ', mu: 'μ',
    nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', phi: 'φ',
    varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω', Omega: 'Ω', Gamma: 'Γ',
    Lambda: 'Λ', Sigma: 'Σ', Phi: 'Φ', Psi: 'Ψ'
  };

  function render(s) {
    var out = '';
    for (var i = 0; i < s.length;) {
      var c = s[i];

      if (c === '\\') {
        var m = /^\\([a-zA-Z]+)/.exec(s.slice(i));
        if (m) {
          var cmd = m[1];
          i += m[0].length;

          if (cmd === 'frac') {
            var a = arg(s, i); i = a.end;
            var b = arg(s, i); i = b.end;
            out += '<span class="frac"><span class="num">' + render(a.body) +
              '</span><span class="den">' + render(b.body) + '</span></span>';
            continue;
          }
          if (cmd === 'sqrt') {
            var r = arg(s, i); i = r.end;
            out += '<span class="sqrt">' + render(r.body) + '</span>';
            continue;
          }
          if (cmd === 'operatorname') {
            var o = arg(s, i); i = o.end;
            out += '<span class="fn">' + esc(o.body) + '</span>';
            continue;
          }
          if (cmd === 'text' || cmd === 'mathrm') {
            var t = arg(s, i); i = t.end;
            out += '<span class="txt">' + esc(t.body) + '</span>';
            continue;
          }
          if (cmd === 'limits' || cmd === 'displaystyle') { continue; }
          if (cmd === 'left' || cmd === 'right') {
            // 只吃掉括号记号，括号本身按普通字符输出
            if (/^[()\[\]|.]/.test(s[i] || '')) { out += esc(s[i]); i++; }
            continue;
          }
          if (cmd === 'cdot') { out += '·'; continue; }
          if (cmd === 'times') { out += '×'; continue; }
          if (cmd === 'pm') { out += '±'; continue; }
          if (cmd === 'to') { out += '→'; continue; }
          if (cmd === 'infty') { out += '∞'; continue; }
          if (cmd === 'approx') { out += '≈'; continue; }
          if (cmd === 'neq') { out += '≠'; continue; }
          if (cmd === 'leq') { out += '≤'; continue; }
          if (cmd === 'geq') { out += '≥'; continue; }
          if (cmd === 'quad' || cmd === 'qquad') { out += '<span class="tsp"></span>'; continue; }
          if (cmd === ',' || cmd === ';' || cmd === ' ') { out += '<span class="tsp-sm"></span>'; continue; }
          if (FN.indexOf(cmd) >= 0) { out += '<span class="fn">' + cmd + '</span>'; continue; }
          if (GREEK[cmd]) { out += GREEK[cmd]; continue; }

          out += esc(cmd);
          continue;
        }
        i++;
        out += esc(c);
        continue;
      }

      if (c === '^' || c === '_') {
        var g = arg(s, i + 1); i = g.end;
        out += (c === '^' ? '<sup>' : '<sub>') + render(g.body) +
          (c === '^' ? '</sup>' : '</sub>');
        continue;
      }

      if (c === '{' || c === '}') { i++; continue; }

      out += esc(c);
      i++;
    }
    return out;
  }

  global.MiniMath = { render: render, esc: esc };
})(typeof window !== 'undefined' ? window : globalThis);
