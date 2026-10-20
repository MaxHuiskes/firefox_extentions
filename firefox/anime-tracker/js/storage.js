const STORAGE_KEYS = [
  "animeList",
  "allowedSites",
  "ignoredSites",
  "deletedAnime",
  "dataUpdatedAt",
  "darkMode",
  "dailyAutoSync",
];

const STATUSES = ["watching", "hold", "dropped", "finished", "plantowatch"];

function animeKey(title) {
  return String(title || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizeStatus(status) {
  const s = String(status || "watching").toLowerCase().replace(/[\s_-]/g, "");
  if (s === "reading" || s === "watch") return "watching";
  if (s === "completed" || s === "complete") return "finished";
  if (s === "onhold" || s === "paused") return "hold";
  if (s === "plantowatch" || s === "ptw" || s === "plan") return "plantowatch";
  return STATUSES.includes(s) ? s : "watching";
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

function episodeNum(episode) {
  const n = parseFloat(String(episode || "").replace(/,/g, "."));
  return Number.isFinite(n) ? n : 0;
}

function normalizeAnimeItem(item) {
  if (!item || !item.title) return null;
  return {
    ...item,
    status: normalizeStatus(item.status),
    episode: item.episode ?? item.chapter ?? "",
    favorite: Boolean(item.favorite),
    tags: normalizeTags(item.tags),
    malId: item.malId ? String(item.malId) : item.malId || "",
    score: item.score != null && item.score !== "" ? Number(item.score) || 0 : 0,
  };
}

function mergeAnimeEntries(a, b, preferredTitle) {
  const left = normalizeAnimeItem(a) || { title: "", tags: [] };
  const right = normalizeAnimeItem(b) || { title: "", tags: [] };
  const leftEp = episodeNum(left.episode);
  const rightEp = episodeNum(right.episode);
  const progress =
    leftEp > rightEp
      ? left
      : rightEp > leftEp
        ? right
        : (left.updatedAt || 0) >= (right.updatedAt || 0)
          ? left
          : right;
  const other = progress === left ? right : left;
  const newer =
    (left.updatedAt || 0) >= (right.updatedAt || 0) ? left : right;

  return normalizeAnimeItem({
    ...other,
    ...progress,
    title: preferredTitle || progress.title || other.title,
    url: progress.url || other.url,
    episode: progress.episode || other.episode,
    cover: progress.cover || other.cover,
    malId: progress.malId || other.malId,
    score: Math.max(Number(left.score) || 0, Number(right.score) || 0),
    status: newer.status,
    favorite: Boolean(left.favorite || right.favorite),
    tags: normalizeTags([...(left.tags || []), ...(right.tags || [])]),
    updatedAt: Math.max(left.updatedAt || 0, right.updatedAt || 0, Date.now()),
  });
}

function mergeAnimeLists(a = [], b = []) {
  const byKey = new Map();

  for (const item of [...a, ...b]) {
    const next = normalizeAnimeItem(item);
    if (!next) continue;
    const key = animeKey(next.title);
    if (!key) continue;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, next);
      continue;
    }
    byKey.set(key, mergeAnimeEntries(prev, next, prev.title));
  }

  return Array.from(byKey.values()).sort((x, y) => {
    if (Boolean(y.favorite) !== Boolean(x.favorite)) {
      return y.favorite ? 1 : -1;
    }
    return (y.updatedAt || 0) - (x.updatedAt || 0);
  });
}

function mergeDuplicateAnime(list, keepKey, dropKey, preferredTitle) {
  const items = list || [];
  const keep = items.find((item) => animeKey(item.title) === keepKey);
  const drop = items.find((item) => animeKey(item.title) === dropKey);
  if (!keep || !drop || keepKey === dropKey) return items.slice();

  const merged = mergeAnimeEntries(keep, drop, preferredTitle || keep.title);
  const next = items.filter(
    (item) =>
      animeKey(item.title) !== keepKey && animeKey(item.title) !== dropKey
  );
  next.unshift(merged);
  return next;
}

function collectAllTags(animeList = []) {
  const tags = new Set();
  for (const item of animeList || []) {
    for (const tag of normalizeTags(item.tags)) tags.add(tag);
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

function applyAnimeDeletions(list = [], deletedAnime = {}) {
  return (list || []).filter((item) => {
    const key = animeKey(item.title);
    const deletedAt = deletedAnime[key];
    if (!deletedAt) return true;
    return (item.updatedAt || 0) > deletedAt;
  });
}

function clearTombsForPresentAnime(deletedAnime = {}, animeList = []) {
  const next = { ...deletedAnime };
  for (const item of animeList || []) {
    const key = animeKey(item.title);
    if (!key) continue;
    const deletedAt = next[key];
    if (deletedAt && (item.updatedAt || 0) > deletedAt) {
      delete next[key];
    }
  }
  return next;
}

function nextEpisodeUrl(url, episode) {
  if (!url) return "";
  const ep = String(episode || "").trim();
  if (!ep) return "";

  const pathMatch = url.match(/(?:episode|ep)[-_/](\d+(?:[.-]\d+)*)/i);
  if (pathMatch) {
    const raw = pathMatch[1];
    const parts = raw.split(/[.-]/);
    const last = Number(parts[parts.length - 1]);
    if (!Number.isFinite(last)) return "";
    parts[parts.length - 1] = String(last + 1);
    const next = parts.join(raw.includes(".") ? "." : "-");
    return url.replace(
      /((?:episode|ep)[-_/])\d+(?:[.-]\d+)*/i,
      `$1${next}`
    );
  }

  const q = url.match(/([?&](?:episode|ep)=)(\d+)/i);
  if (q) {
    const n = Number(q[2]) + 1;
    return url.replace(q[0], `${q[1]}${n}`);
  }

  return "";
}

function countRecentUpdates(animeList = [], withinMs = 48 * 60 * 60 * 1000) {
  const cutoff = Date.now() - withinMs;
  return (animeList || []).filter(
    (item) =>
      normalizeStatus(item.status) === "watching" &&
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

  const deletedAnime = localData.deletedAnime || {};
  const animeList = applyAnimeDeletions(localData.animeList || [], deletedAnime)
    .map((item) => normalizeAnimeItem(item))
    .filter(Boolean)
    .sort((x, y) => {
      if (Boolean(y.favorite) !== Boolean(x.favorite)) {
        return y.favorite ? 1 : -1;
      }
      return (y.updatedAt || 0) - (x.updatedAt || 0);
    });

  return {
    animeList,
    allowedSites: localData.allowedSites || [],
    ignoredSites: localData.ignoredSites || [],
    deletedAnime,
    dataUpdatedAt: localData.dataUpdatedAt || 0,
    darkMode: Boolean(localData.darkMode),
    dailyAutoSync: Boolean(localData.dailyAutoSync),
  };
}

async function setTrackerStorage(data) {
  const patch = { ...data };

  if (Array.isArray(data.animeList)) {
    const prev = await browser.storage.local.get(["animeList", "deletedAnime"]);
    const deletedAnime = { ...(prev.deletedAnime || {}) };
    const nextKeys = new Set(
      data.animeList.map((item) => animeKey(item.title)).filter(Boolean)
    );

    for (const item of prev.animeList || []) {
      const key = animeKey(item.title);
      if (key && !nextKeys.has(key)) {
        deletedAnime[key] = Date.now();
      }
    }

    for (const key of nextKeys) {
      delete deletedAnime[key];
    }

    const normalized = data.animeList
      .map((item) => normalizeAnimeItem(item))
      .filter(Boolean);

    patch.animeList = applyAnimeDeletions(
      normalized,
      clearTombsForPresentAnime(
        mergeDeletedMaps(data.deletedAnime || {}, deletedAnime),
        normalized
      )
    );
    patch.deletedAnime = clearTombsForPresentAnime(
      mergeDeletedMaps(data.deletedAnime || {}, deletedAnime),
      patch.animeList
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
