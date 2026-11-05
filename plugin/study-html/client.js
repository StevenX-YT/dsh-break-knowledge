window.__ModuleLoader__.load({
  id: '@local/dsh-break-knowledge',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect, useCallback } = React;

    const S = {
      page: {
        padding: '24px 28px', color: 'var(--dsw-alias-label-primary)',
        overflowY: 'auto', height: '100%', boxSizing: 'border-box'
      },
      head: { display: 'flex', alignItems: 'baseline', gap: '12px', marginBottom: '6px' },
      title: { fontSize: '20px', fontWeight: 650, margin: 0 },
      sub: { fontSize: '13px', color: 'var(--dsw-alias-label-secondary)' },
      bar: { display: 'flex', gap: '8px', margin: '16px 0 18px' },
      btn: {
        font: 'inherit', fontSize: '13px', padding: '7px 14px', borderRadius: '8px',
        border: '1px solid var(--dsw-alias-border-l1)', cursor: 'pointer',
        background: 'var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-layer-1))',
        color: 'var(--dsw-alias-label-primary)'
      },
      // 主按钮不用 brand 色做背景：深色主题下背景会解析失败并回退成白色，
      // 而文字是白色，结果就是白底白字。改成描边强调，任何主题都可见。
      btnPrimary: {
        font: 'inherit', fontSize: '13px', padding: '7px 14px', borderRadius: '8px',
        border: '1px solid var(--dsw-alias-brand-primary)', cursor: 'pointer',
        background: 'var(--dsw-alias-bg-layer-1)',
        color: 'var(--dsw-alias-brand-primary)', fontWeight: 600
      },
      card: {
        border: '1px solid var(--dsw-alias-border-l1)', borderRadius: '12px',
        background: 'var(--dsw-alias-bg-layer-1)', padding: '14px 16px',
        marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '14px'
      },
      name: { fontSize: '14px', fontWeight: 550, wordBreak: 'break-all', flex: 1 },
      meta: { fontSize: '12px', color: 'var(--dsw-alias-label-secondary)', marginTop: '3px', fontWeight: 400 },
      empty: {
        border: '1px dashed var(--dsw-alias-border-l1)', borderRadius: '12px',
        padding: '40px 20px', textAlign: 'center',
        color: 'var(--dsw-alias-label-secondary)', fontSize: '14px', lineHeight: 1.8
      },
      err: { color: 'var(--dsw-alias-state-error-primary)', fontSize: '13px', marginTop: '8px' }
    };

    function Panel() {
      const [items, setItems] = useState(null);
      const [err, setErr] = useState(null);
      const [busy, setBusy] = useState(null);
      const [root, setRoot] = useState('');

      const load = useCallback(() => {
        fetch('/study/api/list')
          .then((r) => r.json())
          .then((d) => { setItems(d.items || []); setRoot(d.root || ''); setErr(null); })
          .catch((e) => setErr(String(e && e.message || e)));
      }, []);

      useEffect(() => { load(); }, [load]);

      const open = (p) => {
        setBusy(p);
        fetch('/study/api/open', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ path: p })
        })
          .then((r) => r.json())
          .then((d) => { if (!d.ok) setErr(d.error); })
          .catch((e) => setErr(String(e && e.message || e)))
          .finally(() => setBusy(null));
      };

      const ago = (ms) => {
        const m = Math.round((Date.now() - ms) / 60000);
        if (m < 1) return '刚刚';
        if (m < 60) return m + ' 分钟前';
        const hr = Math.round(m / 60);
        if (hr < 24) return hr + ' 小时前';
        return Math.round(hr / 24) + ' 天前';
      };

      return h('div', { style: S.page },
        h('div', { style: S.head },
          h('h1', { style: S.title }, '学习页'),
          h('span', { style: S.sub }, root || '')
        ),
        h('div', { style: S.sub },
          '这里列出已生成的可互动学习页。点「打开」会用系统默认浏览器打开 —— 学习在浏览器里进行，进度存在那边，和这里无关。'),
        h('div', { style: S.bar },
          h('button', { style: S.btn, onClick: load }, '刷新列表'),
          h('button', {
            style: S.btn,
            onClick: () => open(root + '\\book.html')
          }, '打开示例')
        ),
        err ? h('div', { style: S.err }, err) : null,
        items === null
          ? h('div', { style: S.empty }, '读取中…')
          : items.length === 0
            ? h('div', { style: S.empty },
                '还没有学习页。',
                h('br'),
                '在对话里让 Agent 生成内容，然后用 study_render 渲染，成品会出现在这里。')
            : items.map((it) =>
                h('div', { key: it.path, style: S.card },
                  h('div', { style: S.name },
                    it.name,
                    h('div', { style: S.meta },
                      it.sizeKB + ' KB · ' + ago(it.mtime))
                  ),
                  h('button', {
                    style: busy === it.path ? S.btn : S.btnPrimary,
                    disabled: busy === it.path,
                    onClick: () => open(it.path)
                  }, busy === it.path ? '正在打开…' : '打开')
                )
              )
      );
    }

    function Icon() {
      return h('svg', {
        viewBox: '0 0 24 24', width: 20, height: 20, 'aria-hidden': true,
        style: { display: 'block' }
      },
        h('path', {
          d: 'M4 5.5A1.5 1.5 0 015.5 4H10v16H5.5A1.5 1.5 0 014 18.5v-13z',
          fill: 'currentColor', opacity: 0.35
        }),
        h('path', {
          d: 'M12 4h2.5A1.5 1.5 0 0116 5.5v13a1.5 1.5 0 01-1.5 1.5H12V4z',
          fill: 'currentColor', opacity: 0.7
        }),
        h('path', {
          d: 'M17.5 6.5l3.5 5.5-3.5 5.5', stroke: 'currentColor',
          strokeWidth: 1.8, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round'
        })
      );
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: 'study-html',
          order: 40,
          label: '学习页'
        }, Icon));

        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: 'study-html'
        }, Panel));
      }
    };
  }
});
