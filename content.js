(() => {
  'use strict';

  const STORAGE_KEY = 'click_trail_data';
  const DEFAULT_MAX = 5;

  let enabled = true;
  let maxTrails = DEFAULT_MAX;
  let trails = []; // { selector, rect, scrollX, scrollY }
  let markEls = [];

  // ===== 元素定位：生成 CSS 选择器路径 =====
  function getSelector(el) {
    if (el.id) return '#' + CSS.escape(el.id);
    const parts = [];
    while (el && el !== document.body && el !== document.documentElement) {
      let seg = el.tagName.toLowerCase();
      if (el.id) {
        parts.unshift('#' + CSS.escape(el.id));
        break;
      }
      const parent = el.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(c => c.tagName === el.tagName);
        if (siblings.length > 1) {
          seg += ':nth-of-type(' + (siblings.indexOf(el) + 1) + ')';
        }
      }
      parts.unshift(seg);
      el = parent;
    }
    return parts.join(' > ');
  }

  // ===== 获取当前页面 key =====
  function pageKey() {
    return location.origin + location.pathname;
  }

  // ===== 清除所有标记 DOM =====
  function clearMarks() {
    markEls.forEach(el => el.remove());
    markEls = [];
  }

  // ===== 渲染标记 =====
  function renderMarks() {
    clearMarks();
    const total = trails.length;

    trails.forEach((trail, i) => {
      const target = document.querySelector(trail.selector);
      if (!target) return;

      const rect = target.getBoundingClientRect();
      const mark = document.createElement('div');
      mark.className = 'click-trail-mark';

      // 序号：1 = 最旧，total = 最新
      const num = i + 1;
      mark.setAttribute('data-trail-index', String(num));

      // 越新越亮：最新 opacity=1，最旧逐渐变淡
      const opacity = 0.25 + 0.75 * (num / total);
      mark.style.opacity = String(opacity);

      // 定位到元素上方
      mark.style.top = (rect.top + window.scrollY) + 'px';
      mark.style.left = (rect.left + window.scrollX) + 'px';
      mark.style.width = rect.width + 'px';
      mark.style.height = rect.height + 'px';

      document.body.appendChild(mark);
      markEls.push(mark);
    });
  }

  // ===== 保存到 storage =====
  function saveTrails() {
    const data = {};
    data[pageKey()] = { trails, timestamp: Date.now() };
    chrome.storage.local.get(STORAGE_KEY, (res) => {
      const all = res[STORAGE_KEY] || {};
      Object.assign(all, data);
      // 清理超过 7 天的旧数据
      const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
      for (const key of Object.keys(all)) {
        if (all[key].timestamp < cutoff) delete all[key];
      }
      chrome.storage.local.set({ [STORAGE_KEY]: all });
    });
  }

  // ===== 从 storage 恢复 =====
  function loadTrails() {
    chrome.storage.local.get(STORAGE_KEY, (res) => {
      const all = res[STORAGE_KEY] || {};
      const page = all[pageKey()];
      if (page && page.trails) {
        trails = page.trails.slice(-maxTrails);
        renderMarks();
      }
    });
  }

  // ===== 查找最佳点击目标（往上找到行级元素）=====
  function findTrailTarget(el) {
    // 跳过标记自身
    if (el.closest('.click-trail-mark')) return null;

    let target = el;

    // 往上找行级容器：tr, li, [role=row], 或有明显行高的块元素
    const rowSelectors = ['tr', 'li', '[role="row"]', '[role="listitem"]'];
    const row = el.closest(rowSelectors.join(','));
    if (row) return row;

    // 如果是表单元素，找最近的包裹容器
    if (el.matches('input, select, textarea, button')) {
      const wrapper = el.closest('div, td, label, fieldset');
      if (wrapper) return wrapper;
    }

    // 否则用点击的元素本身，但如果太小就往上找
    while (target && target !== document.body) {
      const rect = target.getBoundingClientRect();
      if (rect.height >= 20 && rect.width >= 50) break;
      target = target.parentElement;
    }

    return target || el;
  }

  // ===== 点击监听 =====
  document.addEventListener('click', (e) => {
    if (!enabled) return;

    const target = findTrailTarget(e.target);
    if (!target || target === document.body || target === document.documentElement) return;

    const selector = getSelector(target);
    if (!selector) return;

    // 如果已经标记了同一个元素，移到最新位置
    trails = trails.filter(t => t.selector !== selector);

    trails.push({
      selector,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
    });

    // 限制数量
    if (trails.length > maxTrails) {
      trails = trails.slice(-maxTrails);
    }

    renderMarks();
    saveTrails();
  }, true);

  // ===== 滚动/resize 时更新位置 =====
  let rafId = null;
  function onLayoutChange() {
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      if (markEls.length > 0) renderMarks();
    });
  }
  window.addEventListener('scroll', onLayoutChange, { passive: true });
  window.addEventListener('resize', onLayoutChange, { passive: true });

  // ===== 监听来自 popup 的消息 =====
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'toggle') {
      enabled = msg.enabled;
      if (!enabled) clearMarks();
      else renderMarks();
    }
    if (msg.type === 'setMax') {
      maxTrails = msg.max;
      if (trails.length > maxTrails) {
        trails = trails.slice(-maxTrails);
        saveTrails();
      }
      renderMarks();
    }
    if (msg.type === 'clear') {
      trails = [];
      clearMarks();
      saveTrails();
    }
    if (msg.type === 'getState') {
      // popup 请求当前状态
      chrome.runtime.sendMessage({
        type: 'state',
        enabled,
        max: maxTrails,
        count: trails.length,
      });
    }
  });

  // ===== 加载设置 =====
  chrome.storage.local.get({ ct_enabled: true, ct_max: DEFAULT_MAX }, (res) => {
    enabled = res.ct_enabled;
    maxTrails = res.ct_max;
    if (enabled) loadTrails();
  });

  // ===== 监听 DOM 变化（SPA 路由跳转后重新加载标记）=====
  let lastUrl = location.href;
  const observer = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      trails = [];
      clearMarks();
      if (enabled) loadTrails();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
