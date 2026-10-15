// Luister naar pagina-updates en navigeer-gebeurtenissen
browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url) {
    browser.tabs.sendMessage(tabId, { action: "autoUpdate" }).catch(() => {
      // Content script is nog niet actief op deze specifieke tab
    });
  }
});