const STORAGE_KEYS = ["mangaList", "allowedSites"];

function mergeMangaLists(syncList = [], localList = []) {
  const byKey = new Map();

  for (const item of [...localList, ...syncList]) {
    if (!item || !item.title) continue;
    const key = String(item.title).toLowerCase().replace(/[^a-z0-9]/g, "");
    const prev = byKey.get(key);
    if (!prev || (item.updatedAt || 0) >= (prev.updatedAt || 0)) {
      byKey.set(key, item);
    }
  }

  return Array.from(byKey.values()).sort(
    (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)
  );
}

async function getTrackerStorage(keys = STORAGE_KEYS) {
  let syncData = {};
  let localData = {};

  try {
    syncData = await browser.storage.sync.get(keys);
  } catch (_e) {
    syncData = {};
  }

  try {
    localData = await browser.storage.local.get(keys);
  } catch (_e) {
    localData = {};
  }

  const mangaList = mergeMangaLists(
    syncData.mangaList || [],
    localData.mangaList || []
  );

  const allowedSites =
    Array.isArray(syncData.allowedSites) && syncData.allowedSites.length > 0
      ? syncData.allowedSites
      : localData.allowedSites || [];

  const patch = {};
  if (
    mangaList.length > 0 &&
    JSON.stringify(syncData.mangaList || []) !== JSON.stringify(mangaList)
  ) {
    patch.mangaList = mangaList;
  }
  if (
    allowedSites.length > 0 &&
    JSON.stringify(syncData.allowedSites || []) !== JSON.stringify(allowedSites)
  ) {
    patch.allowedSites = allowedSites;
  }
  if (Object.keys(patch).length > 0) {
    try {
      await browser.storage.sync.set(patch);
    } catch (_e) {
      // Sync may be unavailable until Firefox Account sync is enabled
    }
    try {
      await browser.storage.local.set(patch);
    } catch (_e) {
      // ignore
    }
  }

  return { mangaList, allowedSites };
}

async function setTrackerStorage(data) {
  try {
    await browser.storage.local.set(data);
  } catch (_e) {
    // ignore
  }
  try {
    await browser.storage.sync.set(data);
  } catch (_e) {
    // Keep local copy if sync quota/account blocks the write
  }
}
