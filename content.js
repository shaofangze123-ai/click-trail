(() => {
  'use strict';

  const DEFAULT_MAX = 5;
  const DEFAULT_COLOR = '255,105,180';
  let enabled = true;
  let maxTrails = DEFAULT_MAX;
  let color = DEFAULT_COLOR;
  let dots = []; // { x, y } 页面坐标
  let els = [];

  function clearDots() {
    els.forEach(el => el.remove());
    els = [];
  }

  function render() {
    clearDots();
    const total = dots.length;
    if (total === 0) return;

    dots.forEach((dot, i) => {
      const age = (i + 1) / total; // 0→旧  1→新
      const el = document.createElement('div');
      el.setAttribute('data-click-trail', '1');
      el.style.cssText = [
        'position:absolute',
        'pointer-events:none',
        'z-index:2147483646',
        'width:12px',
        'height:12px',
        'border-radius:50%',
        'top:' + (dot.y - 6) + 'px',
        'left:' + (dot.x - 6) + 'px',
        'background:rgba(' + color + ',' + (0.15 + 0.55 * age) + ')',
        'box-shadow:0 0 ' + (4 + 8 * age) + 'px ' + (2 + 4 * age) + 'px rgba(' + color + ',' + (0.2 + 0.5 * age) + ')',
        'transition:opacity 0.3s',
      ].join(';');
      document.documentElement.appendChild(el);
      els.push(el);
    });
  }

  function save() {
    const key = location.origin + location.pathname;
    chrome.storage.local.get('ct_dots', (res) => {
      const all = res.ct_dots || {};
      all[key] = { dots, ts: Date.now() };
      // 清理 7 天前
      const cut = Date.now() - 7 * 86400000;
      for (const k of Object.keys(all)) {
        if (all[k].ts < cut) delete all[k];
      }
      chrome.storage.local.set({ ct_dots: all });
    });
  }

  function load() {
    const key = location.origin + location.pathname;
    chrome.storage.local.get('ct_dots', (res) => {
      const page = (res.ct_dots || {})[key];
      if (page && page.dots) {
        dots = page.dots.slice(-maxTrails);
        render();
      }
    });
  }

  document.addEventListener('mousedown', (e) => {
    if (!enabled || e.button !== 0) return;
    // 跳过自身
    if (e.target.getAttribute && e.target.getAttribute('data-click-trail')) return;

    const x = e.pageX;
    const y = e.pageY;

    dots.push({ x, y });
    if (dots.length > maxTrails) dots = dots.slice(-maxTrails);

    render();
    save();
  }, true);

  // 滚动时不需要更新，因为用的是 pageX/pageY（绝对坐标）

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'toggle') {
      enabled = msg.enabled;
      if (!enabled) clearDots(); else render();
    }
    if (msg.type === 'setMax') {
      maxTrails = msg.max;
      if (dots.length > maxTrails) { dots = dots.slice(-maxTrails); save(); }
      render();
    }
    if (msg.type === 'setColor') {
      color = msg.color;
      render();
    }
    if (msg.type === 'clear') { dots = []; clearDots(); save(); }
    if (msg.type === 'getState') {
      chrome.runtime.sendMessage({ type: 'state', enabled, max: maxTrails, count: dots.length });
    }
  });

  chrome.storage.local.get({ ct_enabled: true, ct_max: DEFAULT_MAX, ct_color: DEFAULT_COLOR }, (res) => {
    enabled = res.ct_enabled;
    maxTrails = res.ct_max;
    color = res.ct_color;
    if (enabled) load();
  });

  // SPA 路由变化
  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      dots = []; clearDots();
      if (enabled) load();
    }
  }).observe(document.body, { childList: true, subtree: true });
})();
