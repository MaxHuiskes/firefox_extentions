function normalizeString(str) {
  return (str || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function extractChapterInfo() {
  const url = window.location.href;
  const urlMatch = url.match(/chapter-(\d+(?:[-\.]\d+)*)/i);
  if (urlMatch) {
    return urlMatch[1].replace(/-/g, ".");
  }

  const currentChapterEl =
    document.querySelector(".current-chapter") ||
    document.querySelector("h1.current-chapter") ||
    document.querySelector("h1");
  if (currentChapterEl) {
    const match = currentChapterEl.textContent.match(
      /(?:chapter|ch\.?)\s*(\d+(?:[-\.]\d+)*)/i
    );
    if (match) return match[1].replace(/-/g, ".");
  }

  return "";
}

function titleFromMangaUrl() {
  const match = window.location.pathname.match(/\/manga\/([^/]+)/i);
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

function showPageNotification(message) {
  let noti = document.getElementById("manga-tracker-toast");
  if (!noti) {
    noti = document.createElement("div");
    noti.id = "manga-tracker-toast";
    noti.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: #27ae60;
      color: white;
      padding: 10px 16px;
      border-radius: 8px;
      font-family: sans-serif;
      font-size: 13px;
      font-weight: bold;
      z-index: 999999;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      transition: opacity 0.3s ease;
    `;
    document.body.appendChild(noti);
  }
  noti.textContent = message;
  noti.style.opacity = "1";

  setTimeout(() => {
    if (noti) noti.style.opacity = "0";
  }, 3000);
}

async function autoUpdateProgress() {
  try {
    const hostname = window.location.hostname;
    const storage = await getTrackerStorage();
    const allowedSites = storage.allowedSites || [];
    const mangaList = storage.mangaList || [];

    const isAllowed =
      allowedSites.length === 0 ||
      allowedSites.some((site) => site && hostname.includes(site.trim()));
    if (!isAllowed) {
      console.log(
        `[Manga Tracker] Skip: site not allowed (${hostname}). Allowed: ${allowedSites.join(", ")}`
      );
      return;
    }

    const chapter = extractChapterInfo();
    const title = extractMangaTitle();
    const url = window.location.href;

    if (!title || !chapter) {
      console.log(
        `[Manga Tracker] Skip: missing title/chapter (title="${title}", chapter="${chapter}")`
      );
      return;
    }

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

    const newEntry = { title, url, chapter, updatedAt: Date.now() };

    if (existingIndex >= 0) {
      if (
        mangaList[existingIndex].chapter === chapter &&
        mangaList[existingIndex].url === url
      ) {
        console.log(
          `[Manga Tracker] Already saved: ${title} Ch. ${chapter}`
        );
        return;
      }

      mangaList[existingIndex] = { ...mangaList[existingIndex], ...newEntry };
      await setTrackerStorage({ mangaList });
      console.log(`[Manga Tracker] Auto-opgeslagen: ${title} Ch. ${chapter}`);
      showPageNotification(`✓ Voortgang opgeslagen: Ch. ${chapter}`);
    } else {
      mangaList.unshift(newEntry);
      await setTrackerStorage({ mangaList });
      console.log(`[Manga Tracker] Auto-toegevoegd: ${title} Ch. ${chapter}`);
      showPageNotification(`✓ Manga toegevoegd: Ch. ${chapter}`);
    }
  } catch (err) {
    console.error("[Manga Tracker] Auto-update failed:", err);
  }
}

function startCheck() {
  autoUpdateProgress();
  let count = 0;
  const interval = setInterval(() => {
    count++;
    autoUpdateProgress();
    if (count >= 3) clearInterval(interval);
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
    });
  }
});
