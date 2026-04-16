chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  function getTopKey(senderObj) {
    const topUrl = (senderObj.tab && senderObj.tab.url) ? senderObj.tab.url : senderObj.url;
    if (!topUrl) return '';
    try {
      const u = new URL(topUrl);
      return u.origin + u.pathname;
    } catch(e) {
      return '';
    }
  }

  if (msg.type === 'CT_GET_CONTEXT') {
    const topKey = getTopKey(sender);
    sendResponse({ topKey, frameId: sender.frameId });
    return true; // Keep the message channel open for sendResponse
  }

  if (msg.type === 'CT_ADD_CLICK') {
    const topKey = getTopKey(sender);
    if (!topKey) return;

    chrome.storage.local.get(['ct_dots', 'ct_max'], (res) => {
      const all = res.ct_dots || {};
      const maxTrails = res.ct_max || 5;
      
      const pageData = all[topKey] || { dots: [] };
      pageData.dots.push({
        frameId: sender.frameId,
        x: msg.x,
        y: msg.y,
        ts: Date.now()
      });
      
      if (pageData.dots.length > maxTrails) {
        pageData.dots = pageData.dots.slice(-maxTrails);
      }
      pageData.ts = Date.now();
      
      all[topKey] = pageData;
      
      const cut = Date.now() - 7 * 86400000;
      for (const k of Object.keys(all)) {
        if (all[k].ts < cut) delete all[k];
      }
      
      chrome.storage.local.set({ ct_dots: all });
    });
  }

  if (msg.type === 'CT_CLEAR_CLICKS') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs[0] || !tabs[0].url) return;
        
        let topKey = '';
        try {
          const u = new URL(tabs[0].url);
          topKey = u.origin + u.pathname;
        } catch(e) {
          return;
        }

        chrome.storage.local.get(['ct_dots'], (res) => {
          const all = res.ct_dots || {};
          if (all[topKey]) {
            all[topKey].dots = [];
            all[topKey].ts = Date.now();
            chrome.storage.local.set({ ct_dots: all });
          }
        });
    });
    return true;
  }
});