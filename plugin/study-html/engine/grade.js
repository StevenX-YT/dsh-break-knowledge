/**
 * 判分内核 —— 浏览器与 Node 共用。
 * 挂到 globalThis.StudyGrade，供 app.js 与测试脚本使用。
 */
(function (global) {
  'use strict';

  function norm(s) {
    return String(s == null ? '' : s)
      .replace(/[\uff01-\uff5e]/g, function (c) {        // 全角 → 半角
        return String.fromCharCode(c.charCodeAt(0) - 0xfee0);
      })
      .replace(/\u3000/g, ' ')
      .toLowerCase()
      .replace(/[\s,，。;；:：、()（）\[\]【】"'“”‘’]/g, '');
  }

  function grade(item, v) {
    switch (item.kind) {
      case 'single':
      case 'stepwise':
      case 'findError':
        return v !== null && v !== undefined && v !== '' && Number(v) === Number(item.answer);

      case 'judge':
        if (v === null || v === undefined || v === '') return false;
        return (v === true || v === 'true') === (item.answer === true);

      case 'numeric': {
        if (v === null || v === '') return false;
        var n = Number(v);
        if (!isFinite(n)) return false;
        return Math.abs(n - Number(item.answer)) <= (item.tolerance == null ? 1e-6 : item.tolerance);
      }

      case 'blank': {
        var want = Array.isArray(item.answer) ? item.answer : [item.answer];
        var got = norm(v);
        return got.length > 0 && want.some(function (w) { return norm(w) === got; });
      }

      case 'short': {
        var kws = item.keywords || [];
        if (!kws.length) return norm(v).length > 10;
        var hit = kws.filter(function (k) { return norm(v).indexOf(norm(k)) >= 0; }).length;
        return hit >= Math.max(2, Math.ceil(kws.length * 0.5));
      }

      default:
        return false;
    }
  }

  /**
   * 掌握度：每个知识点下**已作答**题目的加权得分。
   * 一次答对 1.0，提示后答对 0.7，答错 0。
   * 未作答的题不计入分母 —— 否则刚做一题就会显示很低。
   */
  function mastery(data, answers) {
    var out = {};
    (data.points || []).forEach(function (kp) {
      var rel = (data.items || []).filter(function (it) {
        return (it.kp || []).indexOf(kp.id) >= 0;
      });
      var done = rel.filter(function (it) { return answers[it.id]; });
      if (!done.length) { out[kp.id] = null; return; }
      var sum = 0;
      done.forEach(function (it) {
        var a = answers[it.id];
        sum += a.ok ? (a.tries === 0 ? 1 : 0.7) : 0;
      });
      out[kp.id] = sum / done.length;
    });
    return out;
  }

  global.StudyGrade = { norm: norm, grade: grade, mastery: mastery };
})(typeof window !== 'undefined' ? window : globalThis);
