const GIST_FILENAME = "manga-tracker-backup.json";
const GIST_DESC = "Manga Progress Tracker backup";
const GIST_FETCH_TIMEOUT_MS = 15000;

async function fetchWithTimeout(url, options = {}, timeoutMs = GIST_FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err && err.name === "AbortError") {
      throw new Error(`GitHub request timed out after ${timeoutMs / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function getGistSettings() {
  const data = await browser.storage.local.get(["gistToken", "gistId"]);
  return {
    token: (data.gistToken || "").trim(),
    gistId: (data.gistId || "").trim(),
  };
}

async function saveGistSettings({ token, gistId }) {
  const patch = {};
  if (token !== undefined) patch.gistToken = (token || "").trim();
  if (gistId !== undefined) patch.gistId = (gistId || "").trim();
  await browser.storage.local.set(patch);
}

async function clearGistSettings() {
  await browser.storage.local.remove(["gistToken", "gistId"]);
}

async function isGistConfigured() {
  const { token, gistId } = await getGistSettings();
  return Boolean(token && gistId);
}

async function getGistRateLimitState() {
  const { gistRateLimitedUntil = 0 } = await browser.storage.local.get(
    "gistRateLimitedUntil"
  );
  return Number(gistRateLimitedUntil) || 0;
}

async function assertNotRateLimited() {
  const until = await getGistRateLimitState();
  if (until > Date.now()) {
    const mins = Math.ceil((until - Date.now()) / 60000);
    throw new Error(
      `GitHub rate limit active. Try again in ~${mins} min (or Force sync after the reset).`
    );
  }
}

async function markRateLimited(res) {
  const resetSec = Number(res.headers.get("x-ratelimit-reset") || 0);
  const until = resetSec > 0 ? resetSec * 1000 : Date.now() + 60 * 60 * 1000;
  await browser.storage.local.set({
    gistRateLimitedUntil: until,
    lastGistSyncError: `API rate limit exceeded. Resets at ${new Date(until).toLocaleString()}`,
  });
}

function buildGistPayload(
  mangaList,
  allowedSites,
  deletedManga = {},
  ignoredSites = []
) {
  return {
    format: "manga-tracker-backup",
    version: 3,
    exportedAt: new Date().toISOString(),
    dataUpdatedAt: Date.now(),
    mangaList: mangaList || [],
    allowedSites: allowedSites || [],
    ignoredSites: ignoredSites || [],
    deletedManga: deletedManga || {},
  };
}

async function githubFetch(path, token, options = {}) {
  await assertNotRateLimited();

  const res = await fetchWithTimeout(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });

  if (res.status === 403 || res.status === 429) {
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (_e) {
      data = { message: text };
    }
    if (
      String(data?.message || text)
        .toLowerCase()
        .includes("rate limit") ||
      res.status === 429 ||
      res.headers.get("x-ratelimit-remaining") === "0"
    ) {
      await markRateLimited(res);
      throw new Error(
        data?.message ||
          "GitHub API rate limit exceeded. Sync paused until the limit resets."
      );
    }
    throw new Error(data?.message || `GitHub API error (${res.status})`);
  }

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_e) {
    data = { message: text };
  }

  if (!res.ok) {
    const msg = data?.message || `GitHub API error (${res.status})`;
    if (res.status === 401) {
      throw new Error(
        "Invalid GitHub token. Create a new classic token with gist scope."
      );
    }
    throw new Error(msg);
  }

  // Clear rate-limit flag after a successful call.
  await browser.storage.local.set({ gistRateLimitedUntil: 0 });
  return data;
}

async function downloadGistBackup(token, gistId) {
  const gist = await githubFetch(`/gists/${gistId}`, token);
  const file = gist.files && gist.files[GIST_FILENAME];
  if (!file) {
    return null;
  }

  if (file.truncated && !file.content) {
    await assertNotRateLimited();
    const res = await fetchWithTimeout(file.raw_url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.raw",
      },
    });
    if (res.status === 403 || res.status === 429) {
      await markRateLimited(res);
      throw new Error("GitHub API rate limit exceeded while downloading gist.");
    }
    if (!res.ok) {
      throw new Error("Failed to download gist file");
    }
    return res.json();
  }

  return JSON.parse(file.content);
}

async function createGist(token, payload) {
  const body = {
    description: GIST_DESC,
    public: false,
    files: {
      [GIST_FILENAME]: {
        content: JSON.stringify(payload, null, 2),
      },
    },
  };
  return githubFetch("/gists", token, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

async function updateGist(token, gistId, payload) {
  const body = {
    description: GIST_DESC,
    files: {
      [GIST_FILENAME]: {
        content: JSON.stringify(payload, null, 2),
      },
    },
  };
  return githubFetch(`/gists/${gistId}`, token, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

async function uploadLocalGist(token, gistId, local) {
  const payload = buildGistPayload(
    local.mangaList || [],
    local.allowedSites || [],
    local.deletedManga || {},
    local.ignoredSites || []
  );

  if (gistId) {
    await updateGist(token, gistId, payload);
    return gistId;
  }

  const created = await createGist(token, payload);
  await saveGistSettings({ gistId: created.id });
  return created.id;
}

function snapshotHash(mangaList, allowedSites, deletedManga, ignoredSites) {
  return JSON.stringify({
    mangaList: mangaList || [],
    allowedSites: allowedSites || [],
    ignoredSites: ignoredSites || [],
    deletedManga: deletedManga || {},
  });
}

function remoteSnapshotHash(remote) {
  if (!remote) return "";
  return snapshotHash(
    remote.mangaList || [],
    remote.allowedSites || [],
    remote.deletedManga || {},
    remote.ignoredSites || []
  );
}

function summarizeConflictDiff(localList = [], remoteList = []) {
  const localKeys = new Map(
    (localList || [])
      .filter((i) => i && i.title)
      .map((i) => [mangaKey(i.title), i])
  );
  const remoteKeys = new Map(
    (remoteList || [])
      .filter((i) => i && i.title)
      .map((i) => [mangaKey(i.title), i])
  );

  const onlyLocal = [];
  const onlyRemote = [];
  const chapterDiff = [];

  for (const [key, item] of localKeys) {
    if (!remoteKeys.has(key)) {
      onlyLocal.push(item.title);
    } else {
      const remote = remoteKeys.get(key);
      if (String(item.chapter || "") !== String(remote.chapter || "")) {
        chapterDiff.push({
          title: item.title,
          local: item.chapter || "?",
          remote: remote.chapter || "?",
        });
      }
    }
  }
  for (const [key, item] of remoteKeys) {
    if (!localKeys.has(key)) onlyRemote.push(item.title);
  }

  return {
    onlyLocal: onlyLocal.slice(0, 5),
    onlyRemote: onlyRemote.slice(0, 5),
    chapterDiff: chapterDiff.slice(0, 5),
    onlyLocalCount: onlyLocal.length,
    onlyRemoteCount: onlyRemote.length,
    chapterDiffCount: chapterDiff.length,
  };
}

async function inspectGistConflict() {
  const { token, gistId } = await getGistSettings();
  if (!token || !gistId) {
    return {
      conflict: false,
      skipped: true,
      reason: "missing token or gist id",
    };
  }

  await assertNotRateLimited();
  const local = await getTrackerStorage();
  const localHash = snapshotHash(
    local.mangaList,
    local.allowedSites,
    local.deletedManga,
    local.ignoredSites
  );

  const { lastGistPushHash = "" } = await browser.storage.local.get(
    "lastGistPushHash"
  );

  let remote = null;
  try {
    remote = await downloadGistBackup(token, gistId);
  } catch (err) {
    if (
      String(err.message).includes("Not Found") ||
      String(err.message).includes("404")
    ) {
      return { conflict: false, hadRemote: false, localCount: local.mangaList.length };
    }
    throw err;
  }

  if (!remote) {
    return { conflict: false, hadRemote: false, localCount: local.mangaList.length };
  }

  const remoteHash = remoteSnapshotHash(remote);
  const diverged = localHash !== remoteHash;
  const localChanged = !lastGistPushHash || localHash !== lastGistPushHash;
  const remoteChanged = !lastGistPushHash || remoteHash !== lastGistPushHash;
  const conflict = Boolean(
    diverged && localChanged && remoteChanged && lastGistPushHash
  );

  const remoteUpdatedAt = remote?.dataUpdatedAt
    ? Number(remote.dataUpdatedAt)
    : remote?.exportedAt
      ? Date.parse(remote.exportedAt) || 0
      : 0;

  return {
    conflict,
    hadRemote: true,
    localCount: (local.mangaList || []).length,
    remoteCount: Array.isArray(remote.mangaList) ? remote.mangaList.length : 0,
    localUpdatedAt: local.dataUpdatedAt || 0,
    remoteUpdatedAt,
    diff: summarizeConflictDiff(local.mangaList, remote.mangaList || []),
  };
}

async function applyRemoteOverwrite(remote) {
  const mangaList = applyMangaDeletions(
    Array.isArray(remote?.mangaList) ? remote.mangaList : [],
    remote?.deletedManga || {}
  );
  await setTrackerStorage({
    mangaList,
    allowedSites: Array.isArray(remote?.allowedSites)
      ? remote.allowedSites
      : [],
    ignoredSites: Array.isArray(remote?.ignoredSites)
      ? remote.ignoredSites
      : [],
    deletedManga: remote?.deletedManga || {},
    dataUpdatedAt: Date.now(),
  });
}

async function syncWithGithubGist(options = {}) {
  const mode = options.mode || "merge";
  const { token, gistId } = await getGistSettings();
  if (!token) {
    throw new Error("Paste a GitHub token first (gist scope).");
  }

  await assertNotRateLimited();

  const local = await getTrackerStorage();

  if (mode === "push") {
    if (!gistId) {
      throw new Error("Gist ID required for sync.");
    }
    const hash = snapshotHash(
      local.mangaList,
      local.allowedSites,
      local.deletedManga,
      local.ignoredSites
    );
    await uploadLocalGist(token, gistId, local);
    await browser.storage.local.set({ lastGistPushHash: hash });
    return {
      mangaCount: (local.mangaList || []).length,
      gistId,
      hadRemote: false,
      mode,
      skipped: false,
    };
  }

  let remote = null;
  let activeGistId = gistId;

  if (activeGistId) {
    try {
      remote = await downloadGistBackup(token, activeGistId);
    } catch (err) {
      if (
        String(err.message).includes("Not Found") ||
        String(err.message).includes("404")
      ) {
        activeGistId = "";
        remote = null;
      } else {
        throw err;
      }
    }
  }

  let deletedManga = mergeDeletedMaps(
    local.deletedManga || {},
    remote?.deletedManga || {}
  );

  const mergedManga = applyMangaDeletions(
    mergeMangaLists(
      local.mangaList || [],
      Array.isArray(remote?.mangaList) ? remote.mangaList : []
    ),
    deletedManga
  );

  deletedManga = clearTombsForPresentManga(deletedManga, mergedManga);

  const remoteUpdatedAt = remote?.dataUpdatedAt
    ? Number(remote.dataUpdatedAt)
    : remote?.exportedAt
      ? Date.parse(remote.exportedAt) || 0
      : 0;
  const localUpdatedAt = local.dataUpdatedAt || 0;

  const allowedSites =
    localUpdatedAt >= remoteUpdatedAt
      ? local.allowedSites || []
      : Array.isArray(remote?.allowedSites)
        ? remote.allowedSites
        : local.allowedSites || [];

  const ignoredSites =
    localUpdatedAt >= remoteUpdatedAt
      ? local.ignoredSites || []
      : Array.isArray(remote?.ignoredSites)
        ? remote.ignoredSites
        : local.ignoredSites || [];

  const beforeHash = snapshotHash(
    local.mangaList,
    local.allowedSites,
    local.deletedManga,
    local.ignoredSites
  );
  const afterHash = snapshotHash(
    mergedManga,
    allowedSites,
    deletedManga,
    ignoredSites
  );
  const changed = beforeHash !== afterHash;

  if (changed) {
    await setTrackerStorage({
      mangaList: mergedManga,
      allowedSites,
      ignoredSites,
      deletedManga,
      dataUpdatedAt: Date.now(),
    });
  }

  if (mode !== "pull" && (changed || !activeGistId)) {
    activeGistId = await uploadLocalGist(token, activeGistId, {
      mangaList: mergedManga,
      allowedSites,
      ignoredSites,
      deletedManga,
    });
    await browser.storage.local.set({
      lastGistPushHash: snapshotHash(
        mergedManga,
        allowedSites,
        deletedManga,
        ignoredSites
      ),
    });
  }

  return {
    mangaCount: mergedManga.length,
    gistId: activeGistId || gistId,
    hadRemote: Boolean(remote),
    mode,
    changed,
  };
}
