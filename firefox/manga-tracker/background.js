async function migrateLocalToSync() {
  await getTrackerStorage();
}

browser.runtime.onInstalled.addListener(migrateLocalToSync);
browser.runtime.onStartup.addListener(migrateLocalToSync);
migrateLocalToSync();

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url) {
    browser.tabs.sendMessage(tabId, { action: "autoUpdate" }).catch(() => {
      // Content script is nog niet actief op deze specifieke tab
    });
  }
});
