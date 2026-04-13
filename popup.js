const toggle = document.getElementById('toggle');
const maxDisplay = document.getElementById('max-display');
const countDisplay = document.getElementById('count');
const decBtn = document.getElementById('dec');
const incBtn = document.getElementById('inc');
const clearBtn = document.getElementById('clear');

let maxTrails = 5;

// 加载设置
chrome.storage.local.get({ ct_enabled: true, ct_max: 5 }, (res) => {
  toggle.checked = res.ct_enabled;
  maxTrails = res.ct_max;
  maxDisplay.textContent = String(maxTrails);
});

// 获取当前页面状态
function queryState() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) return;
    chrome.tabs.sendMessage(tabs[0].id, { type: 'getState' });
  });
}

// 监听来自 content script 的状态回报
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'state') {
    toggle.checked = msg.enabled;
    maxTrails = msg.max;
    maxDisplay.textContent = String(msg.max);
    countDisplay.textContent = String(msg.count);
  }
});

queryState();

// 发送消息给当前标签页
function sendToTab(msg) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) return;
    chrome.tabs.sendMessage(tabs[0].id, msg);
  });
}

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
