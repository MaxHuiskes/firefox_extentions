const STORAGE_KEYS = ["mangaList", "allowedSites", "deletedManga", "dataUpdatedAt"];

function mangaKey(title) {
  return String(title || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function mergeMangaLists(syncList = [], localList = []) {
  const byKey = new Map();

  for (const item of [...localList, ...syncList]) {
    if (!item || !item.title) continue;
    const key = mangaKey(item.title);
    if (!key) continue;
    const prev = byKey.get(key);
    if (!prev || (item.updatedAt || 0) >= (prev.updatedAt || 0)) {
      byKey.set(key, item);
    }
  }

  return Array.from(byKey.values()).sort(
    (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)
  );
}

function mergeDeletedMaps(a = {}, b = {}) {
  const out = { ...a };
  for (const [key, ts] of Object.entries(b || {})) {
    out[key] = Math.max(out[key] || 0, ts || 0);
  }
  return out;
}

function applyMangaDeletions(list = [], deletedManga = {}) {
  return (list || []).filter((item) => {
    const key = mangaKey(item.title);
    const deletedAt = deletedManga[key];
    if (!deletedAt) return true;
    // Re-add/save after delete wins when updatedAt is newer than the tombstone.
    return (item.updatedAt || 0) > deletedAt;
  });
}

function clearTombsForPresentManga(deletedManga = {}, mangaList = []) {
  const next = { ...deletedManga };
  for (const item of mangaList || []) {
    const key = mangaKey(item.title);
    if (!key) continue;
    const deletedAt = next[key];
    if (deletedAt && (item.updatedAt || 0) > deletedAt) {
      delete next[key];
    }
  }
  return next;
}

async function getTrackerStorage() {
  let syncData = {};
  let localData = {};

  try {
    syncData = await browser.storage.sync.get(STORAGE_KEYS);
  } catch (_e) {
    syncData = {};
  }

  try {
    localData = await browser.storage.local.get(STORAGE_KEYS);
  } catch (_e) {
    localData = {};
  }

  // Local is canonical so clears/deletes stick. Sync is only a fallback mirror.
  const hasLocalManga = Object.prototype.hasOwnProperty.call(localData, "mangaList");
  const hasLocalSites = Object.prototype.hasOwnProperty.call(localData, "allowedSites");
  const hasLocalDeleted = Object.prototype.hasOwnProperty.call(
    localData,
    "deletedManga"
  );

  const deletedManga = hasLocalDeleted
    ? localData.deletedManga || {}
    : syncData.deletedManga || {};

  const rawList = hasLocalManga
    ? localData.mangaList || []
    : syncData.mangaList || [];

  const mangaList = applyMangaDeletions(rawList, deletedManga);

  const allowedSites = hasLocalSites
    ? localData.allowedSites || []
    : syncData.allowedSites || [];

  const dataUpdatedAt =
    localData.dataUpdatedAt || syncData.dataUpdatedAt || 0;

  return { mangaList, allowedSites, deletedManga, dataUpdatedAt };
}

async function setTrackerStorage(data) {
  const patch = { ...data };

  if (Array.isArray(data.mangaList)) {
    const prev = await browser.storage.local.get(["mangaList", "deletedManga"]);
    const deletedManga = { ...(prev.deletedManga || {}) };
    const nextKeys = new Set(
      data.mangaList.map((item) => mangaKey(item.title)).filter(Boolean)
    );

    for (const item of prev.mangaList || []) {
      const key = mangaKey(item.title);
      if (key && !nextKeys.has(key)) {
        deletedManga[key] = Date.now();
      }
    }

    for (const key of nextKeys) {
      delete deletedManga[key];
    }

    patch.deletedManga = clearTombsForPresentManga(
      mergeDeletedMaps(data.deletedManga || {}, deletedManga),
      data.mangaList
    );
    patch.mangaList = applyMangaDeletions(data.mangaList, patch.deletedManga);
    patch.dataUpdatedAt = Date.now();
  } else if (Array.isArray(data.allowedSites)) {
    patch.dataUpdatedAt = Date.now();
  }

  try {
    await browser.storage.local.set(patch);
  } catch (_e) {
    // ignore
  }
  // Mirror to sync in background — don't block the UI on it.
  browser.storage.sync.set(patch).catch(() => {});
}
