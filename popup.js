const toggle = document.getElementById('toggle');
const maxDisplay = document.getElementById('max-display');
const countDisplay = document.getElementById('count');
const decBtn = document.getElementById('dec');
const incBtn = document.getElementById('inc');
const clearBtn = document.getElementById('clear');
const colorDots = document.querySelectorAll('.color-dot');
const customWrap = document.getElementById('custom-wrap');
const customColor = document.getElementById('custom-color');

let maxTrails = 5;

function sendToTab(msg) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) return;
    chrome.tabs.sendMessage(tabs[0].id, msg);
  });
}

// 颜色：hex 转 r,g,b 字符串
function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return r + ',' + g + ',' + b;
}

function setActiveColor(rgb) {
  colorDots.forEach(d => d.classList.remove('active'));
  customWrap.classList.remove('active');

  let matched = false;
  colorDots.forEach(d => {
    if (d.dataset.color === rgb) {
      d.classList.add('active');
      matched = true;
    }
  });
  if (!matched) {
    customWrap.classList.add('active');
  }

  chrome.storage.local.set({ ct_color: rgb });
  sendToTab({ type: 'setColor', color: rgb });
}

// 预设颜色点击
colorDots.forEach(dot => {
  dot.addEventListener('click', () => setActiveColor(dot.dataset.color));
});

// 自定义颜色
customColor.addEventListener('input', () => {
  const rgb = hexToRgb(customColor.value);
  const label = customWrap.querySelector('.color-custom-label');
  label.style.background = customColor.value;
  label.style.borderColor = '#fff';
  label.textContent = '';
  setActiveColor(rgb);
});

// 加载设置
chrome.storage.local.get({ ct_enabled: true, ct_max: 5, ct_color: '255,105,180' }, (res) => {
  toggle.checked = res.ct_enabled;
  maxTrails = res.ct_max;
  maxDisplay.textContent = String(maxTrails);

  // 恢复颜色选中状态
  const rgb = res.ct_color;
  colorDots.forEach(d => d.classList.remove('active'));
  customWrap.classList.remove('active');
  let matched = false;
  colorDots.forEach(d => {
    if (d.dataset.color === rgb) { d.classList.add('active'); matched = true; }
  });
  if (!matched) {
    customWrap.classList.add('active');
    const label = customWrap.querySelector('.color-custom-label');
    const parts = rgb.split(',');
    const hex = '#' + parts.map(p => parseInt(p).toString(16).padStart(2, '0')).join('');
    customColor.value = hex;
    label.style.background = hex;
    label.style.borderColor = '#fff';
    label.textContent = '';
  }
});

// 获取当前页面状态
function queryState() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) return;
    chrome.tabs.sendMessage(tabs[0].id, { type: 'getState' });
  });
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'state') {
    toggle.checked = msg.enabled;
    maxTrails = msg.max;
    maxDisplay.textContent = String(msg.max);
    countDisplay.textContent = String(msg.count);
  }
});

queryState();

// 开关
toggle.addEventListener('change', () => {
  const enabled = toggle.checked;
  chrome.storage.local.set({ ct_enabled: enabled });
  sendToTab({ type: 'toggle', enabled });
});

// 增减数量
function updateMax(delta) {
  maxTrails = Math.max(1, Math.min(20, maxTrails + delta));
  maxDisplay.textContent = String(maxTrails);
  chrome.storage.local.set({ ct_max: maxTrails });
  sendToTab({ type: 'setMax', max: maxTrails });
}

decBtn.addEventListener('click', () => updateMax(-1));
incBtn.addEventListener('click', () => updateMax(1));

// 清除
clearBtn.addEventListener('click', () => {
  sendToTab({ type: 'clear' });
  countDisplay.textContent = '0';
});
