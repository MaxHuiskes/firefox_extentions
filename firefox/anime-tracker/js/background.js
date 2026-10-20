const DAILY_SYNC_ALARM = "anime-daily-gist-sync";

async function warmStorage() {
  await getTrackerStorage();
  await refreshBadge();
  await setupDailyAlarm();
}

async function refreshBadge() {
  try {
    const { animeList = [] } = await getTrackerStorage();
    const count = countRecentUpdates(animeList);
    await browser.action.setBadgeBackgroundColor({ color: "#0060df" });
    await browser.action.setBadgeText({
      text: count > 0 ? String(Math.min(count, 99)) : "",
    });
  } catch (_e) {
    // ignore
  }
}

async function setupDailyAlarm() {
  const { dailyAutoSync } = await getSettingsFlags();
  await browser.alarms.clear(DAILY_SYNC_ALARM);
  if (!dailyAutoSync) return;

  await browser.alarms.create(DAILY_SYNC_ALARM, {
    periodInMinutes: 24 * 60,
    when: Date.now() + 60 * 1000,
  });
}

browser.runtime.onInstalled.addListener(warmStorage);
browser.runtime.onStartup.addListener(warmStorage);
warmStorage();

browser.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.animeList || changes.deletedAnime) refreshBadge();
  if (changes.dailyAutoSync) setupDailyAlarm();
});

browser.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== DAILY_SYNC_ALARM) return;
  const { dailyAutoSync } = await getSettingsFlags();
  if (!dailyAutoSync) return;
  await forcePullThenPush({ resolution: "merge", skipConflictCheck: true });
  await refreshBadge();
});

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url) {
    browser.tabs.sendMessage(tabId, { action: "autoUpdate" }).catch(() => {});
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
  if (!token) {
    return { skipped: true, reason: "missing token" };
  }
  if (!gistId && mode === "push") {
    return { skipped: true, reason: "missing token or gist id" };
  }

  if (gistSyncRunning) await waitForGistIdle();

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
    await refreshBadge();
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

async function forcePullThenPush(options = {}) {
  const resolution = options.resolution || "";
  const skipConflictCheck = Boolean(options.skipConflictCheck);

  const { token, gistId } = await getGistSettings();
  if (!token) {
    return {
      skipped: true,
      reason: "missing token",
      error: "Set GitHub token in Settings",
    };
  }

  // First-time setup: token only → create a new private gist, then done.
  if (!gistId) {
    const created = await runGistJob("merge", { force: true });
    return {
      skipped: Boolean(created.skipped && !created.error),
      error: created.error || "",
      changed: true,
      created: true,
      animeCount: created.animeCount || 0,
      gistId: created.gistId || "",
      resolution: "create",
    };
  }

  if (!skipConflictCheck && !resolution) {
    try {
      const inspection = await inspectGistConflict();
      if (inspection.conflict) {
        return { skipped: true, conflict: true, ...inspection };
      }
    } catch (err) {
      return {
        skipped: true,
        error: err && err.message ? err.message : String(err),
      };
    }
  }

  if (resolution === "local") {
    const push = await runGistJob("push", { force: true });
    return {
      skipped: Boolean(push.skipped && !push.error),
      error: push.error || "",
      changed: true,
      animeCount: push.animeCount || 0,
      gistId: push.gistId,
      resolution: "local",
      push,
    };
  }

  if (resolution === "remote") {
    try {
      const remote = await downloadGistBackup(token, gistId);
      if (!remote) {
        return { skipped: true, error: "Remote Gist is empty" };
      }
      await applyRemoteOverwrite(remote);
    } catch (err) {
      return {
        skipped: true,
        error: err && err.message ? err.message : String(err),
      };
    }
    const push = await runGistJob("push", { force: true });
    return {
      skipped: Boolean(push.skipped && !push.error),
      error: push.error || "",
      changed: true,
      animeCount: push.animeCount || 0,
      gistId: push.gistId,
      resolution: "remote",
      push,
    };
  }

  const pull = await runGistJob("pull", { force: true });
  if (pull.error) {
    return { skipped: true, error: pull.error, pull, push: null };
  }

  const push = await runGistJob("push", { force: true });
  return {
    skipped: Boolean(push.skipped && !push.error),
    error: push.error || "",
    changed: true,
    animeCount: push.animeCount || pull.animeCount || 0,
    gistId: push.gistId || pull.gistId,
    resolution: "merge",
    pull,
    push,
  };
}

browser.runtime.onMessage.addListener((message) => {
  if (!message || !message.action) return undefined;

  if (message.action === "forceGistSync") {
    return forcePullThenPush({
      resolution: message.resolution || "",
      skipConflictCheck: Boolean(message.skipConflictCheck),
    });
  }

  if (message.action === "inspectGistConflict") {
    return inspectGistConflict().catch((err) => ({
      conflict: false,
      error: err && err.message ? err.message : String(err),
    }));
  }

  if (message.action === "refreshBadge") {
    return refreshBadge().then(() => ({ ok: true }));
  }

  if (message.action === "setupDailyAlarm") {
    return setupDailyAlarm().then(() => ({ ok: true }));
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
