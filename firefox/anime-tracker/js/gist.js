const GIST_FILENAME = "anime-tracker-backup.json";
const GIST_DESC = "Anime Progress Tracker backup";
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
      `GitHub rate limit active. Try again in ~${mins} min.`
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
  animeList,
  allowedSites,
  deletedAnime = {},
  ignoredSites = []
) {
  return {
    format: "anime-tracker-backup",
    version: 3,
    exportedAt: new Date().toISOString(),
    dataUpdatedAt: Date.now(),
    animeList: animeList || [],
    allowedSites: allowedSites || [],
    ignoredSites: ignoredSites || [],
    deletedAnime: deletedAnime || {},
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

  await browser.storage.local.set({ gistRateLimitedUntil: 0 });
  return data;
}

async function downloadGistBackup(token, gistId) {
  const gist = await githubFetch(`/gists/${gistId}`, token);
  const file = gist.files && gist.files[GIST_FILENAME];
  if (!file) return null;

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
    if (!res.ok) throw new Error("Failed to download gist file");
    return res.json();
  }

  return JSON.parse(file.content);
}

async function createGist(token, payload) {
  return githubFetch("/gists", token, {
    method: "POST",
    body: JSON.stringify({
      description: GIST_DESC,
      public: false,
      files: {
        [GIST_FILENAME]: { content: JSON.stringify(payload, null, 2) },
      },
    }),
  });
}

async function updateGist(token, gistId, payload) {
  return githubFetch(`/gists/${gistId}`, token, {
    method: "PATCH",
    body: JSON.stringify({
      description: GIST_DESC,
      files: {
        [GIST_FILENAME]: { content: JSON.stringify(payload, null, 2) },
      },
    }),
  });
}

async function uploadLocalGist(token, gistId, local) {
  const payload = buildGistPayload(
    local.animeList || [],
    local.allowedSites || [],
    local.deletedAnime || {},
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

function snapshotHash(animeList, allowedSites, deletedAnime, ignoredSites) {
  return JSON.stringify({
    animeList: animeList || [],
    allowedSites: allowedSites || [],
    ignoredSites: ignoredSites || [],
    deletedAnime: deletedAnime || {},
  });
}

function remoteSnapshotHash(remote) {
  if (!remote) return "";
  return snapshotHash(
    remote.animeList || [],
    remote.allowedSites || [],
    remote.deletedAnime || {},
    remote.ignoredSites || []
  );
}

function summarizeConflictDiff(localList = [], remoteList = []) {
  const localKeys = new Map(
    (localList || [])
      .filter((i) => i && i.title)
      .map((i) => [animeKey(i.title), i])
  );
  const remoteKeys = new Map(
    (remoteList || [])
      .filter((i) => i && i.title)
      .map((i) => [animeKey(i.title), i])
  );

  const onlyLocal = [];
  const onlyRemote = [];
  const chapterDiff = [];

  for (const [key, item] of localKeys) {
    if (!remoteKeys.has(key)) {
      onlyLocal.push(item.title);
    } else {
      const remote = remoteKeys.get(key);
      if (String(item.episode || "") !== String(remote.episode || "")) {
        chapterDiff.push({
          title: item.title,
          local: item.episode || "?",
          remote: remote.episode || "?",
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
    local.animeList,
    local.allowedSites,
    local.deletedAnime,
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
      return {
        conflict: false,
        hadRemote: false,
        localCount: local.animeList.length,
      };
    }
    throw err;
  }

  if (!remote) {
    return {
      conflict: false,
      hadRemote: false,
      localCount: local.animeList.length,
    };
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
    localCount: (local.animeList || []).length,
    remoteCount: Array.isArray(remote.animeList) ? remote.animeList.length : 0,
    localUpdatedAt: local.dataUpdatedAt || 0,
    remoteUpdatedAt,
    diff: summarizeConflictDiff(local.animeList, remote.animeList || []),
  };
}

async function applyRemoteOverwrite(remote) {
  const animeList = applyAnimeDeletions(
    Array.isArray(remote?.animeList) ? remote.animeList : [],
    remote?.deletedAnime || {}
  );
  await setTrackerStorage({
    animeList,
    allowedSites: Array.isArray(remote?.allowedSites)
      ? remote.allowedSites
      : [],
    ignoredSites: Array.isArray(remote?.ignoredSites)
      ? remote.ignoredSites
      : [],
    deletedAnime: remote?.deletedAnime || {},
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
    if (!gistId) throw new Error("Gist ID required for sync.");
    const hash = snapshotHash(
      local.animeList,
      local.allowedSites,
      local.deletedAnime,
      local.ignoredSites
    );
    await uploadLocalGist(token, gistId, local);
    await browser.storage.local.set({ lastGistPushHash: hash });
    return {
      animeCount: (local.animeList || []).length,
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

  let deletedAnime = mergeDeletedMaps(
    local.deletedAnime || {},
    remote?.deletedAnime || {}
  );

  const mergedAnime = applyAnimeDeletions(
    mergeAnimeLists(
      local.animeList || [],
      Array.isArray(remote?.animeList) ? remote.animeList : []
    ),
    deletedAnime
  );

  deletedAnime = clearTombsForPresentAnime(deletedAnime, mergedAnime);

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
    local.animeList,
    local.allowedSites,
    local.deletedAnime,
    local.ignoredSites
  );
  const afterHash = snapshotHash(
    mergedAnime,
    allowedSites,
    deletedAnime,
    ignoredSites
  );
  const changed = beforeHash !== afterHash;

  if (changed) {
    await setTrackerStorage({
      animeList: mergedAnime,
      allowedSites,
      ignoredSites,
      deletedAnime,
      dataUpdatedAt: Date.now(),
    });
  }

  if (mode !== "pull" && (changed || !activeGistId)) {
    activeGistId = await uploadLocalGist(token, activeGistId, {
      animeList: mergedAnime,
      allowedSites,
      ignoredSites,
      deletedAnime,
    });
    await browser.storage.local.set({
      lastGistPushHash: snapshotHash(
        mergedAnime,
        allowedSites,
        deletedAnime,
        ignoredSites
      ),
    });
  }

  return {
    animeCount: mergedAnime.length,
    gistId: activeGistId || gistId,
    hadRemote: Boolean(remote),
    mode,
    changed,
  };
}
