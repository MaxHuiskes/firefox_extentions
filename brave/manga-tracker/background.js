chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url) {
    chrome.tabs.sendMessage(tabId, { action: "autoUpdate" }).catch(() => {
      // Content script is not active on this tab yet
    });
  }
});
