(() => {
  'use strict';

  const DEFAULT_MAX = 5;
  const DEFAULT_COLOR = '255,105,180';
  let enabled = true;
  let maxTrails = DEFAULT_MAX;
  let color = DEFAULT_COLOR;
  
  let globalDots = [];
  let myFrameId = null;
  let topKey = null;
  let els = [];

  function clearEls() {
    els.forEach(el => el.remove());
    els = [];
  }

  function render() {
    clearEls();
    if (!enabled) return;
    
    const total = globalDots.length;
    if (total === 0) return;

    globalDots.forEach((dot, i) => {
      // 只渲染属于自己这个 iframe（窗口）里的点击
      if (dot.frameId !== myFrameId) return;

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

  function safeSendMessage(msg, callback) {
    try {
      if (!chrome.runtime?.id) return; // 检查扩展上下文是否存在
      if (callback) {
        chrome.runtime.sendMessage(msg, (response) => {
          if (chrome.runtime.lastError) {
            // 忽略连接断开错误
            return;
          }
          if (callback) callback(response);
        });
      } else {
        const p = chrome.runtime.sendMessage(msg);
        if (p && p.catch) p.catch(() => {}); // 捕获未处理的 promise 拒绝
      }
    } catch(e) {
      // 忽略上下文失效错误 (Extension context invalidated)
    }
  }

  function loadContext() {
    safeSendMessage({ type: 'CT_GET_CONTEXT' }, (res) => {
      if (res && res.topKey) {
        myFrameId = res.frameId;
        topKey = res.topKey;
        loadDots();
      }
    });
  }

  function loadDots() {
    if (!topKey) return;
    try {
      if (!chrome.runtime?.id) return;
      chrome.storage.local.get('ct_dots', (res) => {
        if (chrome.runtime.lastError) return;
        const page = (res.ct_dots || {})[topKey];
        if (page && page.dots) {
          globalDots = page.dots;
        } else {
          globalDots = [];
        }
        render();
      });
    } catch (e) { }
  }

  document.addEventListener('mousedown', (e) => {
    if (!enabled || e.button !== 0) return;
    if (e.target.getAttribute && e.target.getAttribute('data-click-trail')) return;

    const x = e.pageX;
    const y = e.pageY;

    // 乐观渲染
    if (myFrameId !== null) {
      globalDots.push({ frameId: myFrameId, x, y, ts: Date.now() });
      if (globalDots.length > maxTrails) globalDots = globalDots.slice(-maxTrails);
      render();
    }

    // 真实的数据交给 background 脚本统一处理
    safeSendMessage({ type: 'CT_ADD_CLICK', x, y });
  }, true);

  try {
    if (chrome.runtime?.id) {
      // 监听跨 iframe / tab 的存储变化
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local') {
          if (changes.ct_enabled) {
            enabled = changes.ct_enabled.newValue;
            if (!enabled) clearEls();
            else render();
          }
          if (changes.ct_max) {
            maxTrails = changes.ct_max.newValue;
          }
          if (changes.ct_color) {
            color = changes.ct_color.newValue;
            if (enabled) render();
          }
          if (changes.ct_dots && topKey) {
            const page = (changes.ct_dots.newValue || {})[topKey];
            if (page && page.dots) {
              globalDots = page.dots;
            } else {
              globalDots = [];
            }
            if (enabled) render();
          }
        }
      });

      // 处理 popup 面板发来的消息
      chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (msg.type === 'clear') {
          if (myFrameId === 0) { 
            safeSendMessage({ type: 'CT_CLEAR_CLICKS' });
          }
        }
        if (msg.type === 'getState') {
          if (myFrameId === 0) { 
            safeSendMessage({ type: 'state', enabled, max: maxTrails, count: globalDots.length });
          }
        }
      });

      // 初始读取通用设置
      chrome.storage.local.get({ ct_enabled: true, ct_max: DEFAULT_MAX, ct_color: DEFAULT_COLOR }, (res) => {
        if (chrome.runtime.lastError) return;
        enabled = res.ct_enabled;
        maxTrails = res.ct_max;
        color = res.ct_color;
        loadContext();
      });
    }
  } catch (e) {
    // 忽略加载时的错误
  }

  // 兼容 SPA 路由变化
  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      loadContext();
    }
  }).observe(document.body, { childList: true, subtree: true });

})();