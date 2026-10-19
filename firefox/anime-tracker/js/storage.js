const STORAGE_KEYS = [
  "animeList",
  "allowedSites",
  "ignoredSites",
  "deletedAnime",
  "dataUpdatedAt",
  "darkMode",
  "dailyAutoSync",
];

const STATUSES = ["watching", "hold", "dropped", "finished"];

function animeKey(title) {
  return String(title || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizeStatus(status) {
  const s = String(status || "watching").toLowerCase();
  if (s === "reading") return "watching";
  return STATUSES.includes(s) ? s : "watching";
}

function mergeAnimeLists(a = [], b = []) {
  const byKey = new Map();

  for (const item of [...a, ...b]) {
    if (!item || !item.title) continue;
    const key = animeKey(item.title);
    if (!key) continue;
    const prev = byKey.get(key);
    const next = {
      ...item,
      status: normalizeStatus(item.status),
      episode: item.episode ?? item.chapter ?? "",
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
  const animeList = applyAnimeDeletions(
    localData.animeList || [],
    deletedAnime
  ).map((item) => ({
    ...item,
    status: normalizeStatus(item.status),
    episode: item.episode ?? item.chapter ?? "",
  }));

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

    const mergedDeleted = clearTombsForPresentAnime(
      mergeDeletedMaps(data.deletedAnime || {}, deletedAnime),
      data.animeList
    );

    patch.animeList = applyAnimeDeletions(
      data.animeList.map((item) => ({
        ...item,
        status: normalizeStatus(item.status),
        episode: item.episode ?? item.chapter ?? "",
      })),
      mergedDeleted
    );
    patch.deletedAnime = clearTombsForPresentAnime(
      mergedDeleted,
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
