function normalizeString(str) {
  return (str || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function extractChapterInfo() {
  const url = window.location.href;
  const urlMatch = url.match(/chapter-(\d+(?:[-\.]\d+)?)/i);
  if (urlMatch) {
    return urlMatch[1].replace("-", ".");
  }

  const currentChapterEl =
    document.querySelector(".current-chapter") ||
    document.querySelector("h1.current-chapter");
  if (currentChapterEl) {
    const match = currentChapterEl.textContent.match(
      /(?:chapter|ch\.?)\s*(\d+(?:\.\d+)?)/i
    );
    if (match) return match[1];
  }

  return "";
}

function extractMangaTitle() {
  const breadcrumbs = document.querySelectorAll(
    '.breadcrumb span[itemprop="name"], .breadcrumbs span[itemprop="name"]'
  );
  if (breadcrumbs.length >= 2) {
    return breadcrumbs[1].textContent.trim();
  }

  const currentChapterEl =
    document.querySelector(".current-chapter") ||
    document.querySelector("h1.current-chapter");
  if (currentChapterEl && currentChapterEl.textContent.includes(":")) {
    return currentChapterEl.textContent.split(":")[0].trim();
  }

  const metaTitle =
    document.querySelector('meta[property="og:title"]')?.content ||
    document.title;
  return metaTitle
    .replace(/^Read /i, "")
    .replace(/ - MangaKakalot.*/i, "")
    .replace(/ - Read .*/i, "")
    .replace(/Chapter \d+.*/i, "")
    .replace(/Ch\.\s*\d+.*/i, "")
    .replace(/\|.*/, "")
    .trim();
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
  const hostname = window.location.hostname;

  const storage = await chrome.storage.local.get(["allowedSites", "mangaList"]);
  const allowedSites = storage.allowedSites || [];
  const mangaList = storage.mangaList || [];

  const isAllowed =
    allowedSites.length === 0 ||
    allowedSites.some((site) => site && hostname.includes(site.trim()));
  if (!isAllowed) return;

  const chapter = extractChapterInfo();
  const title = extractMangaTitle();
  const url = window.location.href;

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

  const newEntry = { title, url, chapter, updatedAt: Date.now() };

  if (existingIndex >= 0) {
    if (
      mangaList[existingIndex].chapter === chapter &&
      mangaList[existingIndex].url === url
    ) {
      return;
    }

    mangaList[existingIndex] = { ...mangaList[existingIndex], ...newEntry };
    await chrome.storage.local.set({ mangaList });
    showPageNotification(`✓ Voortgang opgeslagen: Ch. ${chapter}`);
  } else {
    mangaList.unshift(newEntry);
    await chrome.storage.local.set({ mangaList });
    showPageNotification(`✓ Manga toegevoegd: Ch. ${chapter}`);
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

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === "autoUpdate") {
    startCheck();
    return false;
  }

  if (request.action === "getMangaDetails") {
    sendResponse({
      title: extractMangaTitle(),
      chapter: extractChapterInfo(),
      url: window.location.href,
    });
    return false;
  }

  return false;
});
