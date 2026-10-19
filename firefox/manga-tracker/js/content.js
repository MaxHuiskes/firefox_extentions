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
  if (/mangakakalot|manganato|natomanga|chapmanganato|readmanganato/i.test(host)) {
    return "mangakakalot";
  }
  if (/mangadex\.org/i.test(host)) return "mangadex";
  if (/comick\./i.test(host)) return "comick";
  if (/webtoons\.com/i.test(host)) return "webtoons";
  return "generic";
}

function extractCover() {
  const og =
    document.querySelector('meta[property="og:image"]')?.content ||
    document.querySelector('meta[name="twitter:image"]')?.content ||
    "";
  if (og) return og;

  const img =
    document.querySelector(".manga-info-pic img") ||
    document.querySelector(".info-image img") ||
    document.querySelector("img.cover") ||
    document.querySelector(".series-cover img");
  return img?.src || "";
}

function extractChapterInfo() {
  const site = detectSite();
  const url = window.location.href;

  if (site === "mangadex") {
    const m = url.match(/chapter\/([0-9a-f-]{36})/i);
    const heading = document.querySelector("h1, .chapter-title, [class*='chapter']");
    const textMatch = heading?.textContent?.match(
      /(?:chapter|ch\.?)\s*(\d+(?:\.\d+)?)/i
    );
    if (textMatch) return textMatch[1];
    if (m) return ""; // UUID only — fall through
  }

  if (site === "comick") {
    const m = url.match(/\/(?:comic|chapter)\/[^/]+\/(\d+(?:\.\d+)?)/i);
    if (m) return m[1];
  }

  if (site === "webtoons") {
    const m = url.match(/[?&]episode_no=(\d+)/i);
    if (m) return m[1];
  }

  const urlMatch = url.match(/chapter[/_-]?(\d+(?:[-\.]\d+)*)/i);
  if (urlMatch) {
    return urlMatch[1].replace(/-/g, ".");
  }

  const currentChapterEl =
    document.querySelector(".current-chapter") ||
    document.querySelector("h1.current-chapter") ||
    document.querySelector("h1");
  if (currentChapterEl) {
    const match = currentChapterEl.textContent.match(
      /(?:chapter|ch\.?|episode|ep\.?)\s*(\d+(?:[.-]\d+)*)/i
    );
    if (match) return match[1].replace(/-/g, ".");
  }

  return "";
}

function titleFromMangaUrl() {
  const match =
    window.location.pathname.match(/\/manga\/([^/]+)/i) ||
    window.location.pathname.match(/\/comic\/([^/]+)/i) ||
    window.location.pathname.match(/\/title\/[^/]+\/([^/]+)/i);
  if (!match) return "";
  return decodeURIComponent(match[1])
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function isGenericTitle(title) {
  const n = normalizeString(title);
  const blocked = new Set([
    "onlinemanga",
    "mangaonline",
    "readmanga",
    "readmangaonline",
    "home",
    "manga",
    "mangas",
    "comics",
    "webtoon",
    "mangakakalot",
    "manganato",
    "mangadex",
    "comick",
    "chapter",
    "free",
    "freeonline",
  ]);
  return !n || blocked.has(n) || /^chapter\d*$/i.test(n);
}

function cleanTitleCandidate(raw) {
  if (!raw) return "";
  let title = String(raw).trim();

  const readChapter = title.match(
    /^Read\s+(.+?)\s+Chapter\s+\d+(?:[.-]\d+)*/i
  );
  if (readChapter) {
    title = readChapter[1].trim();
  } else {
    title = title
      .replace(/^Read\s+/i, "")
      .replace(/\s*\|.*$/, "")
      .replace(/\s*-\s*MangaKakalot.*$/i, "")
      .replace(/\s*-\s*MangaNato.*$/i, "")
      .replace(/\s*-\s*MangaDex.*$/i, "")
      .replace(/\s*-\s*ComicK.*$/i, "")
      .replace(/\s*-\s*WEBTOON.*$/i, "")
      .replace(/\s*-\s*Read\s+.*$/i, "")
      .replace(/\s*-\s*Chapter\s+\d+(?:[.-]\d+)*\b.*$/i, "")
      .replace(/\s+Chapter\s+\d+(?:[.-]\d+)*\b.*$/i, "")
      .replace(/\s+Ch\.\s*\d+(?:[.-]\d+)*\b.*$/i, "")
      .replace(/^Chapter\s+\d+(?:[.-]\d+)*\s*[:-]\s*/i, "")
      .replace(/\s+Free\s+Online.*$/i, "")
      .trim();
  }

  if (isGenericTitle(title)) return "";
  return title;
}

function titleFromHeading() {
  const heading =
    document.querySelector(".current-chapter") ||
    document.querySelector("h1.current-chapter") ||
    document.querySelector("h1");
  if (!heading) return "";

  const text = heading.textContent.trim();
  const withChapter = text.match(/^(.+?)\s+Chapter\s+\d+(?:[.-]\d+)*/i);
  if (withChapter) {
    const title = withChapter[1].trim();
    return isGenericTitle(title) ? "" : title;
  }

  if (text.includes(":")) {
    return cleanTitleCandidate(text.split(":")[0]);
  }

  return cleanTitleCandidate(text);
}

function extractMangaTitle() {
  const site = detectSite();

  if (site === "mangadex") {
    const md =
      document.querySelector("a[href*='/title/']")?.textContent ||
      document.querySelector(".manga-title, .title a")?.textContent;
    const cleaned = cleanTitleCandidate(md);
    if (cleaned) return cleaned;
  }

  if (site === "comick") {
    const c =
      document.querySelector("h1 a, .comic-title, h1")?.textContent || "";
    const cleaned = cleanTitleCandidate(c.replace(/\s+Ch\..*$/i, ""));
    if (cleaned) return cleaned;
  }

  const fromHeading = titleFromHeading();
  if (fromHeading) return fromHeading;

  const fromDoc = cleanTitleCandidate(document.title);
  if (fromDoc) return fromDoc;

  const ogTitle = document.querySelector('meta[property="og:title"]')?.content;
  const fromOg = cleanTitleCandidate(ogTitle);
  if (fromOg) return fromOg;

  const breadcrumbs = document.querySelectorAll(
    '.breadcrumb span[itemprop="name"], .breadcrumbs span[itemprop="name"], .breadcrumb a, .breadcrumbs a'
  );
  for (let i = breadcrumbs.length - 1; i >= 0; i--) {
    const fromCrumb = cleanTitleCandidate(breadcrumbs[i].textContent);
    if (fromCrumb && !isGenericTitle(fromCrumb)) return fromCrumb;
  }

  return titleFromMangaUrl();
}

function showPageNotification(message, isError = false) {
  let noti = document.getElementById("manga-tracker-toast");
  if (!noti) {
    noti = document.createElement("div");
    noti.id = "manga-tracker-toast";
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
    const mangaList = storage.mangaList || [];

    if (hostMatches(ignoredSites, hostname)) {
      return;
    }

    const isAllowed =
      allowedSites.length === 0 || hostMatches(allowedSites, hostname);
    if (!isAllowed) return;

    const chapter = extractChapterInfo();
    const title = extractMangaTitle();
    const url = window.location.href;
    const cover = extractCover();

    if (!title || !chapter) return;

    const cleanCurrentTitle = normalizeString(title);

    const existingIndex = mangaList.findIndex((item) => {
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
      chapter,
      cover: cover || undefined,
      updatedAt: Date.now(),
      status: "reading",
    };

    if (existingIndex >= 0) {
      const prev = mangaList[existingIndex];
      if (prev.chapter === chapter && prev.url === url && prev.cover === cover) {
        return;
      }

      mangaList[existingIndex] = {
        ...prev,
        ...newEntry,
        status: normalizeStatus(prev.status) === "finished" ? "reading" : prev.status,
        cover: cover || prev.cover,
      };
      await setTrackerStorage({ mangaList });
      showPageNotification(`✓ Voortgang opgeslagen: Ch. ${chapter}`);
    } else {
      mangaList.unshift(newEntry);
      await setTrackerStorage({ mangaList });
      showPageNotification(`✓ Manga toegevoegd: Ch. ${chapter}`);
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
  } else if (request.action === "getMangaDetails") {
    return Promise.resolve({
      title: extractMangaTitle(),
      chapter: extractChapterInfo(),
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
