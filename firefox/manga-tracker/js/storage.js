const STORAGE_KEYS = [
  "mangaList",
  "allowedSites",
  "ignoredSites",
  "deletedManga",
  "dataUpdatedAt",
  "darkMode",
  "dailyAutoSync",
];

const STATUSES = ["reading", "hold", "dropped", "finished"];

function mangaKey(title) {
  return String(title || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizeStatus(status) {
  const s = String(status || "reading").toLowerCase();
  return STATUSES.includes(s) ? s : "reading";
}

function mergeMangaLists(a = [], b = []) {
  const byKey = new Map();

  for (const item of [...a, ...b]) {
    if (!item || !item.title) continue;
    const key = mangaKey(item.title);
    if (!key) continue;
    const prev = byKey.get(key);
    const next = {
      ...item,
      status: normalizeStatus(item.status),
    };
    if (!prev || (item.updatedAt || 0) >= (prev.updatedAt || 0)) {
      byKey.set(key, { ...prev, ...next });
    }
  }

  return Array.from(byKey.values()).sort(
    (x, y) => (y.updatedAt || 0) - (x.updatedAt || 0)
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

function nextChapterUrl(url, chapter) {
  if (!url) return "";
  const ch = String(chapter || "").trim();
  if (!ch) return "";

  // chapter-12 or chapter-12-5 in path
  const pathMatch = url.match(/chapter-(\d+(?:[.-]\d+)*)/i);
  if (pathMatch) {
    const raw = pathMatch[1];
    const parts = raw.split(/[.-]/);
    const last = Number(parts[parts.length - 1]);
    if (!Number.isFinite(last)) return "";
    parts[parts.length - 1] = String(last + 1);
    const next = parts.join(raw.includes(".") ? "." : "-");
    return url.replace(/chapter-\d+(?:[.-]\d+)*/i, `chapter-${next}`);
  }

  // /ch/12 or ?chapter=12
  const chPath = url.match(/\/ch\/(\d+)/i);
  if (chPath) {
    const n = Number(chPath[1]) + 1;
    return url.replace(/\/ch\/\d+/i, `/ch/${n}`);
  }

  const q = url.match(/([?&](?:chapter|ch)=)(\d+)/i);
  if (q) {
    const n = Number(q[2]) + 1;
    return url.replace(q[0], `${q[1]}${n}`);
  }

  return "";
}

function countRecentUpdates(mangaList = [], withinMs = 48 * 60 * 60 * 1000) {
  const cutoff = Date.now() - withinMs;
  return (mangaList || []).filter(
    (item) =>
      normalizeStatus(item.status) === "reading" &&
      (item.updatedAt || 0) >= cutoff
  ).length;
}

async function getTrackerStorage() {
  let localData = {};
  try {
    localData = await browser.storage.local.get(STORAGE_KEYS);
  } catch (_e) {
    localData = {};
  }

  const deletedManga = localData.deletedManga || {};
  const mangaList = applyMangaDeletions(
    localData.mangaList || [],
    deletedManga
  ).map((item) => ({
    ...item,
    status: normalizeStatus(item.status),
  }));

  return {
    mangaList,
    allowedSites: localData.allowedSites || [],
    ignoredSites: localData.ignoredSites || [],
    deletedManga,
    dataUpdatedAt: localData.dataUpdatedAt || 0,
    darkMode: Boolean(localData.darkMode),
    dailyAutoSync: Boolean(localData.dailyAutoSync),
  };
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

    patch.mangaList = applyMangaDeletions(
      data.mangaList.map((item) => ({
        ...item,
        status: normalizeStatus(item.status),
      })),
      clearTombsForPresentManga(
        mergeDeletedMaps(data.deletedManga || {}, deletedManga),
        data.mangaList
      )
    );
    patch.deletedManga = clearTombsForPresentManga(
      mergeDeletedMaps(data.deletedManga || {}, deletedManga),
      patch.mangaList
    );
    patch.dataUpdatedAt = Date.now();
  } else if (
    Array.isArray(data.allowedSites) ||
    Array.isArray(data.ignoredSites)
  ) {
    patch.dataUpdatedAt = Date.now();
  }

  await browser.storage.local.set(patch);

  try {
    browser.runtime.sendMessage({ action: "refreshBadge" }).catch(() => {});
  } catch (_e) {
    // ignore
  }
}

async function getSettingsFlags() {
  const data = await browser.storage.local.get(["darkMode", "dailyAutoSync"]);
  return {
    darkMode: Boolean(data.darkMode),
    dailyAutoSync: Boolean(data.dailyAutoSync),
  };
}
