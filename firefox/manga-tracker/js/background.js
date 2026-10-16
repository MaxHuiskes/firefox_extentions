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

let gistSyncRunning = false;

async function waitForGistIdle(timeoutMs = 30000) {
  const start = Date.now();
  while (gistSyncRunning && Date.now() - start < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

async function runGistJob(mode, options = {}) {
  const { token, gistId } = await getGistSettings();
  if (!token || !gistId) {
    return { skipped: true, reason: "missing token or gist id" };
  }

  if (gistSyncRunning) {
    await waitForGistIdle();
  }

  gistSyncRunning = true;
  try {
    const result = await syncWithGithubGist({
      mode,
      force: Boolean(options.force),
    });
    await browser.storage.local.set({
      lastGistSyncAt: Date.now(),
      lastGistSyncError: "",
      lastGistSyncMode: mode,
    });
    return { skipped: Boolean(result.skipped), ...result };
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    await browser.storage.local.set({
      lastGistSyncAt: Date.now(),
      lastGistSyncError: message,
      lastGistSyncMode: mode,
    });
    return { skipped: true, error: message };
  } finally {
    gistSyncRunning = false;
  }
}

async function forcePullThenPush() {
  const { token, gistId } = await getGistSettings();
  if (!token || !gistId) {
    return {
      skipped: true,
      reason: "missing token or gist id",
      error: "Set token + Gist ID in Opties",
    };
  }

  await browser.storage.local.remove("lastGistPushHash");

  const pull = await runGistJob("pull", { force: true });
  if (pull.error) {
    return { skipped: true, error: pull.error, pull, push: null };
  }

  const push = await runGistJob("push", { force: true });
  return {
    skipped: Boolean(push.skipped && !push.error),
    error: push.error || "",
    changed: true,
    mangaCount: push.mangaCount || pull.mangaCount || 0,
    gistId: push.gistId || pull.gistId,
    pull,
    push,
  };
}

browser.runtime.onMessage.addListener((message) => {
  if (!message || !message.action) return undefined;

  if (message.action === "forceGistSync") {
    return forcePullThenPush();
  }

  if (message.action === "getGistSyncStatus") {
    return browser.storage.local.get([
      "lastGistSyncAt",
      "lastGistSyncError",
      "lastGistSyncMode",
      "gistRateLimitedUntil",
      "gistId",
    ]);
  }

  return undefined;
});
