function normalizeString(str) {
  return (str || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function hostMatches(list, hostname) {
  return (list || []).some((site) => site && hostname.includes(site.trim()));
}

function detectSite() {
  const host = window.location.hostname.replace(/^www\./, "");
  if (/crunchyroll\.com/i.test(host)) return "crunchyroll";
  if (/hianime|aniwatch|zoro/i.test(host)) return "hianime";
  if (/9animetv|9anime/i.test(host)) return "9anime";
  if (/gogoanime|anitaku/i.test(host)) return "gogoanime";
  return "generic";
}

function extractCover() {
  const og =
    document.querySelector('meta[property="og:image"]')?.content ||
    document.querySelector('meta[name="twitter:image"]')?.content ||
    "";
  if (og) return og;

  const img =
    document.querySelector(".anime-poster img") ||
    document.querySelector(".film-poster img") ||
    document.querySelector("img.cover") ||
    document.querySelector(".detail-poster img");
  return img?.src || "";
}

function extractEpisodeInfo() {
  const site = detectSite();
  const url = window.location.href;

  if (site === "crunchyroll") {
    const m = url.match(/\/watch\/[^/]+\/[^/]*?(\d+)/i);
    if (m) return m[1];
  }

  const urlMatch = url.match(/(?:episode|ep|e)[-_/?=]?(\d+(?:[-\.]\d+)?)/i);
  if (urlMatch) {
    return urlMatch[1].replace(/-/g, ".");
  }

  const currentEpisodeEl =
    document.querySelector(".current-episode") ||
    document.querySelector("h1.current-episode") ||
    document.querySelector(".episode-title") ||
    document.querySelector("h1");
  if (currentEpisodeEl) {
    const match = currentEpisodeEl.textContent.match(
      /(?:episode|ep\.?|e)\s*(\d+(?:\.\d+)?)/i
    );
    if (match) return match[1];
  }

  return "";
}

function isGenericTitle(title) {
  const n = normalizeString(title);
  const blocked = new Set([
    "home",
    "anime",
    "watch",
    "watchanime",
    "crunchyroll",
    "hianime",
    "aniwatch",
    "episode",
    "free",
  ]);
  return !n || blocked.has(n) || /^episode\d*$/i.test(n);
}

function cleanTitleCandidate(raw) {
  if (!raw) return "";
  let title = String(raw).trim();

  title = title
    .replace(/^Watch\s+/i, "")
    .replace(/\s*\|.*$/, "")
    .replace(/\s*-\s*Crunchyroll.*$/i, "")
    .replace(/\s*-\s*Watch\s+.*$/i, "")
    .replace(/\s*-\s*HiAnime.*$/i, "")
    .replace(/\s*-\s*AniWatch.*$/i, "")
    .replace(/\s+Episode\s+\d+(?:[.-]\d+)*\b.*$/i, "")
    .replace(/\s+Ep\.\s*\d+(?:[.-]\d+)*\b.*$/i, "")
    .replace(/^Episode\s+\d+(?:[.-]\d+)*\s*[:-]\s*/i, "")
    .trim();

  if (isGenericTitle(title)) return "";
  return title;
}

function extractAnimeTitle() {
  const site = detectSite();

  if (site === "crunchyroll") {
    const cr =
      document.querySelector("h1, .show-title, [data-t='title']")?.textContent ||
      "";
    const cleaned = cleanTitleCandidate(cr);
    if (cleaned) return cleaned;
  }

  if (site === "hianime" || site === "9anime") {
    const h =
      document.querySelector(".film-name a, .anime-title, h2.film-name")
        ?.textContent || "";
    const cleaned = cleanTitleCandidate(h);
    if (cleaned) return cleaned;
  }

  const breadcrumbs = document.querySelectorAll(
    '.breadcrumb span[itemprop="name"], .breadcrumbs span[itemprop="name"], .breadcrumb a, .breadcrumbs a'
  );
  for (let i = breadcrumbs.length - 1; i >= 0; i--) {
    const fromCrumb = cleanTitleCandidate(breadcrumbs[i].textContent);
    if (fromCrumb && !isGenericTitle(fromCrumb)) return fromCrumb;
  }

  const heading =
    document.querySelector(".current-episode") ||
    document.querySelector("h1.current-episode") ||
    document.querySelector("h1");
  if (heading) {
    if (heading.textContent.includes(":")) {
      const t = cleanTitleCandidate(heading.textContent.split(":")[0]);
      if (t) return t;
    }
    const withEp = heading.textContent.match(
      /^(.+?)\s+Episode\s+\d+(?:[.-]\d+)*/i
    );
    if (withEp) {
      const t = cleanTitleCandidate(withEp[1]);
      if (t) return t;
    }
  }

  const fromOg = cleanTitleCandidate(
    document.querySelector('meta[property="og:title"]')?.content
  );
  if (fromOg) return fromOg;

  return cleanTitleCandidate(document.title);
}

function showPageNotification(message, isError = false) {
  let noti = document.getElementById("anime-tracker-toast");
  if (!noti) {
    noti = document.createElement("div");
    noti.id = "anime-tracker-toast";
    noti.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      color: white;
      padding: 10px 16px;
      border-radius: 8px;
      font-family: sans-serif;
      font-size: 13px;
      font-weight: bold;
      z-index: 999999;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      transition: opacity 0.3s ease;
      max-width: min(90vw, 320px);
    `;
    document.body.appendChild(noti);
  }
  noti.style.background = isError ? "#c0392b" : "#27ae60";
  noti.textContent = message;
  noti.style.opacity = "1";

  setTimeout(() => {
    if (noti) noti.style.opacity = "0";
  }, 3000);
}

async function autoUpdateProgress() {
  try {
    const hostname = window.location.hostname.replace(/^www\./, "");
    const storage = await getTrackerStorage();
    const allowedSites = storage.allowedSites || [];
    const ignoredSites = storage.ignoredSites || [];
    const animeList = storage.animeList || [];

    if (hostMatches(ignoredSites, hostname)) return;

    const isAllowed =
      allowedSites.length === 0 || hostMatches(allowedSites, hostname);
    if (!isAllowed) return;

    const episode = extractEpisodeInfo();
    const title = extractAnimeTitle();
    const url = window.location.href;
    const cover = extractCover();

    if (!title || !episode) return;

    const cleanCurrentTitle = normalizeString(title);

    const existingIndex = animeList.findIndex((item) => {
      const cleanSavedTitle = normalizeString(item.title);
      return (
        cleanSavedTitle === cleanCurrentTitle ||
        (cleanSavedTitle.length > 5 &&
          cleanCurrentTitle.includes(cleanSavedTitle)) ||
        (cleanCurrentTitle.length > 5 &&
          cleanSavedTitle.includes(cleanCurrentTitle))
      );
    });

    const newEntry = {
      title,
      url,
      episode,
      cover: cover || undefined,
      updatedAt: Date.now(),
      status: "watching",
    };

    if (existingIndex >= 0) {
      const prev = animeList[existingIndex];
      if (
        prev.episode === episode &&
        prev.url === url &&
        prev.cover === cover
      ) {
        return;
      }

      animeList[existingIndex] = {
        ...prev,
        ...newEntry,
        status:
          normalizeStatus(prev.status) === "finished" ? "watching" : prev.status,
        cover: cover || prev.cover,
      };
      await setTrackerStorage({ animeList });
      showPageNotification(`✓ Voortgang opgeslagen: Ep. ${episode}`);
    } else {
      animeList.unshift(newEntry);
      await setTrackerStorage({ animeList });
      showPageNotification(`✓ Anime toegevoegd: Ep. ${episode}`);
    }
  } catch (_err) {
    // ignore
  }
}

function startCheck() {
  autoUpdateProgress();
  let count = 0;
  const interval = setInterval(() => {
    count++;
    autoUpdateProgress();
    if (count >= 1) clearInterval(interval);
  }, 1000);
}

if (document.readyState === "complete" || document.readyState === "interactive") {
  startCheck();
} else {
  window.addEventListener("DOMContentLoaded", startCheck);
  window.addEventListener("load", startCheck);
}

browser.runtime.onMessage.addListener((request) => {
  if (request.action === "autoUpdate") {
    startCheck();
  } else if (request.action === "getAnimeDetails") {
    return Promise.resolve({
      title: extractAnimeTitle(),
      episode: extractEpisodeInfo(),
      url: window.location.href,
      cover: extractCover(),
      hostname: window.location.hostname.replace(/^www\./, ""),
    });
  } else if (request.action === "ignoreCurrentSite") {
    return (async () => {
      const hostname = window.location.hostname.replace(/^www\./, "");
      const { ignoredSites = [] } = await getTrackerStorage();
      if (!ignoredSites.includes(hostname)) {
        ignoredSites.push(hostname);
        await setTrackerStorage({ ignoredSites });
      }
      showPageNotification(`Site ignored: ${hostname}`);
      return { hostname, ignoredSites };
    })();
  }
});
