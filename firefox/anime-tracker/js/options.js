function setStatus(el, message, isError = false) {
  el.textContent = message;
  el.className = `status ${isError ? "err" : "ok"}`;
  if (message) {
    setTimeout(() => {
      if (el.textContent === message) el.textContent = "";
    }, 5000);
  }
}

function parseSiteList(raw) {
  return String(raw || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function buildExportPayload(animeList, allowedSites, ignoredSites) {
  return {
    format: "anime-tracker-backup",
    version: 3,
    exportedAt: new Date().toISOString(),
    animeList: animeList || [],
    allowedSites: allowedSites || [],
    ignoredSites: ignoredSites || [],
  };
}

function parseImportPayload(raw) {
  const data = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!data || typeof data !== "object") {
    throw new Error("Invalid JSON");
  }

  const animeList = Array.isArray(data.animeList) ? data.animeList : null;
  const allowedSites = Array.isArray(data.allowedSites) ? data.allowedSites : null;
  const ignoredSites = Array.isArray(data.ignoredSites) ? data.ignoredSites : null;

  if (!animeList && !allowedSites && !ignoredSites) {
    throw new Error("JSON must include animeList and/or site lists");
  }

  for (const item of animeList || []) {
    if (!item || typeof item.title !== "string" || !item.title.trim()) {
      throw new Error("Each anime entry needs a title");
    }
  }

  return {
    animeList: animeList || [],
    allowedSites: allowedSites || [],
    ignoredSites: ignoredSites || [],
    hasAnimeList: Array.isArray(data.animeList),
    hasAllowedSites: Array.isArray(data.allowedSites),
    hasIgnoredSites: Array.isArray(data.ignoredSites),
  };
}

function applyDarkMode(on) {
  document.body.classList.toggle("dark", Boolean(on));
}

async function refreshGistUi() {
  const { token, gistId } = await getGistSettings();
  document.getElementById("gist-token").value = token;
  document.getElementById("gist-id").value = gistId;

  const display = document.getElementById("gist-id-display");
  if (gistId) {
    display.hidden = false;
    display.innerHTML = `Gist ID: <span class="mono">${gistId}</span><br>URL: <a href="https://gist.github.com/${gistId}" target="_blank" rel="noopener">https://gist.github.com/${gistId}</a>`;
  } else {
    display.hidden = true;
    display.textContent = "";
  }

  document.getElementById("gist-sync").disabled = !token;

  const last = document.getElementById("gist-last-sync");
  try {
    const status = await browser.runtime.sendMessage({
      action: "getGistSyncStatus",
    });
    const parts = [];
    if (status && status.gistRateLimitedUntil > Date.now()) {
      parts.push(
        `Rate limited until ${new Date(status.gistRateLimitedUntil).toLocaleString()}.`
      );
    }
    if (status && status.lastGistSyncAt) {
      const when = new Date(status.lastGistSyncAt).toLocaleString();
      parts.push(
        status.lastGistSyncError
          ? `Last sync failed (${when}): ${status.lastGistSyncError}`
          : `Last sync ok (${when}), mode: ${status.lastGistSyncMode || "?"}`
      );
    }
    if (parts.length) {
      last.hidden = false;
      last.textContent = parts.join(" ");
    } else {
      last.hidden = true;
    }
  } catch (_e) {
    last.hidden = true;
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const storage = await getTrackerStorage();
  document.getElementById("sites").value = (storage.allowedSites || []).join(", ");
  document.getElementById("ignored").value = (storage.ignoredSites || []).join(
    ", "
  );
  document.getElementById("dark-mode").checked = Boolean(storage.darkMode);
  document.getElementById("daily-auto-sync").checked = Boolean(
    storage.dailyAutoSync
  );
  applyDarkMode(storage.darkMode);
  await refreshGistUi();
});

document.getElementById("dark-mode").addEventListener("change", async (e) => {
  const darkMode = Boolean(e.target.checked);
  applyDarkMode(darkMode);
  await setTrackerStorage({ darkMode });
});

document
  .getElementById("daily-auto-sync")
  .addEventListener("change", async (e) => {
    const dailyAutoSync = Boolean(e.target.checked);
    await setTrackerStorage({ dailyAutoSync });
    try {
      await browser.runtime.sendMessage({ action: "setupDailyAlarm" });
    } catch (_e) {
      // ignore
    }
  });

document.getElementById("save").addEventListener("click", async () => {
  const allowedSites = parseSiteList(document.getElementById("sites").value);
  const ignoredSites = parseSiteList(document.getElementById("ignored").value);
  const darkMode = document.getElementById("dark-mode").checked;
  const dailyAutoSync = document.getElementById("daily-auto-sync").checked;

  await setTrackerStorage({
    allowedSites,
    ignoredSites,
    darkMode,
    dailyAutoSync,
  });
  try {
    await browser.runtime.sendMessage({ action: "setupDailyAlarm" });
  } catch (_e) {
    // ignore
  }
  setStatus(document.getElementById("status"), "Settings saved successfully!");
});

document.getElementById("gist-save").addEventListener("click", async () => {
  const token = document.getElementById("gist-token").value.trim();
  const gistId = document.getElementById("gist-id").value.trim();
  await saveGistSettings({ token, gistId });
  await refreshGistUi();
  setStatus(
    document.getElementById("gist-status"),
    token ? "Token / Gist ID saved." : "Cleared token."
  );
});

document.getElementById("gist-sync").addEventListener("click", async () => {
  const gistStatus = document.getElementById("gist-status");
  const btn = document.getElementById("gist-sync");
  try {
    const token = document.getElementById("gist-token").value.trim();
    const gistId = document.getElementById("gist-id").value.trim();
    await saveGistSettings({ token, gistId });

    btn.disabled = true;
    gistStatus.textContent = "Syncing: pull → push…";
    const result = await browser.runtime.sendMessage({
      action: "forceGistSync",
    });

    if (result && result.gistId) {
      document.getElementById("gist-id").value = result.gistId;
    }
    await refreshGistUi();

    const storage = await getTrackerStorage();
    document.getElementById("sites").value = (storage.allowedSites || []).join(
      ", "
    );
    document.getElementById("ignored").value = (
      storage.ignoredSites || []
    ).join(", ");

    if (result && result.error) {
      setStatus(gistStatus, `Sync failed: ${result.error}`, true);
    } else {
      setStatus(
        gistStatus,
        `Synced (pull → push). ${result.animeCount || 0} anime.`
      );
    }
  } catch (err) {
    setStatus(gistStatus, err.message || String(err), true);
  } finally {
    btn.disabled = !document.getElementById("gist-token").value.trim();
  }
});

document.getElementById("gist-clear").addEventListener("click", async () => {
  await clearGistSettings();
  document.getElementById("gist-token").value = "";
  document.getElementById("gist-id").value = "";
  await refreshGistUi();
  setStatus(document.getElementById("gist-status"), "GitHub sync cleared.");
});

document.getElementById("export-btn").addEventListener("click", async () => {
  const transferStatus = document.getElementById("transfer-status");
  try {
    const {
      animeList = [],
      allowedSites = [],
      ignoredSites = [],
    } = await getTrackerStorage();
    const payload = buildExportPayload(animeList, allowedSites, ignoredSites);
    document.getElementById("transfer-data").value = JSON.stringify(
      payload,
      null,
      2
    );
    setStatus(transferStatus, `Exported ${animeList.length} anime.`);
  } catch (err) {
    setStatus(transferStatus, `Export failed: ${err.message}`, true);
  }
});

document.getElementById("copy-btn").addEventListener("click", async () => {
  const transferStatus = document.getElementById("transfer-status");
  const text = document.getElementById("transfer-data").value.trim();
  if (!text) {
    setStatus(transferStatus, "Export first, or paste JSON before copying.", true);
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    setStatus(transferStatus, "Copied to clipboard.");
  } catch (_e) {
    document.getElementById("transfer-data").select();
    setStatus(
      transferStatus,
      "Clipboard blocked — select the text and copy manually.",
      true
    );
  }
});

document.getElementById("download-btn").addEventListener("click", () => {
  const transferStatus = document.getElementById("transfer-status");
  const text = document.getElementById("transfer-data").value.trim();
  if (!text) {
    setStatus(transferStatus, "Export first before downloading.", true);
    return;
  }

  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `anime-tracker-backup-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
  setStatus(transferStatus, "Download started (or use Copy on mobile).");
});

async function importFromText(raw) {
  const transferStatus = document.getElementById("transfer-status");
  const parsed = parseImportPayload(raw);
  const current = await getTrackerStorage();

  const next = {};
  if (parsed.hasAnimeList) {
    next.animeList = mergeAnimeLists(current.animeList || [], parsed.animeList);
  }
  if (parsed.hasAllowedSites) {
    next.allowedSites = parsed.allowedSites;
    document.getElementById("sites").value = parsed.allowedSites.join(", ");
  }
  if (parsed.hasIgnoredSites) {
    next.ignoredSites = parsed.ignoredSites;
    document.getElementById("ignored").value = parsed.ignoredSites.join(", ");
  }

  await setTrackerStorage(next);
  setStatus(
    transferStatus,
    `Import merged. Anime: ${(next.animeList || current.animeList || []).length}.`
  );
}

document.getElementById("import-btn").addEventListener("click", async () => {
  const transferStatus = document.getElementById("transfer-status");
  const raw = document.getElementById("transfer-data").value.trim();
  if (!raw) {
    setStatus(transferStatus, "Paste exported JSON first.", true);
    return;
  }

  try {
    await importFromText(raw);
  } catch (err) {
    setStatus(transferStatus, `Import failed: ${err.message}`, true);
  }
});

document.getElementById("import-file").addEventListener("change", async (event) => {
  const transferStatus = document.getElementById("transfer-status");
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    document.getElementById("transfer-data").value = text;
    await importFromText(text);
  } catch (err) {
    setStatus(transferStatus, `File import failed: ${err.message}`, true);
  } finally {
    event.target.value = "";
  }
});
