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

function normalizeTags(tags) {
  const raw = Array.isArray(tags)
    ? tags
    : typeof tags === "string"
      ? tags.split(",")
      : [];
  const out = [];
  const seen = new Set();
  for (const t of raw) {
    const tag = String(t || "").trim();
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

function chapterNum(chapter) {
  const n = parseFloat(String(chapter || "").replace(/,/g, "."));
  return Number.isFinite(n) ? n : 0;
}

function normalizeMangaItem(item) {
  if (!item || !item.title) return null;
  return {
    ...item,
    status: normalizeStatus(item.status),
    favorite: Boolean(item.favorite),
    tags: normalizeTags(item.tags),
  };
}

function mergeMangaEntries(a, b, preferredTitle) {
  const left = normalizeMangaItem(a) || { title: "", tags: [] };
  const right = normalizeMangaItem(b) || { title: "", tags: [] };
  const leftCh = chapterNum(left.chapter);
  const rightCh = chapterNum(right.chapter);
  const progress =
    leftCh > rightCh
      ? left
      : rightCh > leftCh
        ? right
        : (left.updatedAt || 0) >= (right.updatedAt || 0)
          ? left
          : right;
  const other = progress === left ? right : left;
  const newer =
    (left.updatedAt || 0) >= (right.updatedAt || 0) ? left : right;

  return normalizeMangaItem({
    ...other,
    ...progress,
    title: preferredTitle || progress.title || other.title,
    url: progress.url || other.url,
    chapter: progress.chapter || other.chapter,
    cover: progress.cover || other.cover,
    status: newer.status,
    favorite: Boolean(left.favorite || right.favorite),
    tags: normalizeTags([...(left.tags || []), ...(right.tags || [])]),
    updatedAt: Math.max(left.updatedAt || 0, right.updatedAt || 0, Date.now()),
  });
}

function mergeMangaLists(a = [], b = []) {
  const byKey = new Map();

  for (const item of [...a, ...b]) {
    const next = normalizeMangaItem(item);
    if (!next) continue;
    const key = mangaKey(next.title);
    if (!key) continue;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, next);
      continue;
    }
    byKey.set(key, mergeMangaEntries(prev, next, prev.title));
  }

  return Array.from(byKey.values()).sort((x, y) => {
    if (Boolean(y.favorite) !== Boolean(x.favorite)) {
      return y.favorite ? 1 : -1;
    }
    return (y.updatedAt || 0) - (x.updatedAt || 0);
  });
}

/** Merge two different titles into one entry; remove the other. */
function mergeDuplicateManga(list, keepKey, dropKey, preferredTitle) {
  const items = list || [];
  const keep = items.find((item) => mangaKey(item.title) === keepKey);
  const drop = items.find((item) => mangaKey(item.title) === dropKey);
  if (!keep || !drop || keepKey === dropKey) {
    return items.slice();
  }

  const merged = mergeMangaEntries(
    keep,
    drop,
    preferredTitle || keep.title
  );
  const next = items.filter(
    (item) =>
      mangaKey(item.title) !== keepKey && mangaKey(item.title) !== dropKey
  );
  next.unshift(merged);
  return next;
}

function collectAllTags(mangaList = []) {
  const tags = new Set();
  for (const item of mangaList || []) {
    for (const tag of normalizeTags(item.tags)) {
      tags.add(tag);
    }
  }
  return Array.from(tags).sort((a, b) =>
    a.toLowerCase().localeCompare(b.toLowerCase())
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
  )
    .map((item) => normalizeMangaItem(item))
    .filter(Boolean)
    .sort((x, y) => {
      if (Boolean(y.favorite) !== Boolean(x.favorite)) {
        return y.favorite ? 1 : -1;
      }
      return (y.updatedAt || 0) - (x.updatedAt || 0);
    });

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

    const normalized = data.mangaList
      .map((item) => normalizeMangaItem(item))
      .filter(Boolean);

    patch.mangaList = applyMangaDeletions(
      normalized,
      clearTombsForPresentManga(
        mergeDeletedMaps(data.deletedManga || {}, deletedManga),
        normalized
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
