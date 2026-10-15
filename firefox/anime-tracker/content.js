function normalizeString(str) {
  return (str || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function extractEpisodeInfo() {
  const url = window.location.href;
  const urlMatch = url.match(/(?:episode|ep|e)[-_]?(\d+(?:[-\.]\d+)?)/i);
  if (urlMatch) {
    return urlMatch[1].replace("-", ".");
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

  const bodyMatch = document.body?.innerText?.match(
    /(?:episode|ep\.?)\s*(\d+(?:\.\d+)?)/i
  );
  if (bodyMatch) return bodyMatch[1];

  return "";
}

function extractAnimeTitle() {
  const breadcrumbs = document.querySelectorAll(
    '.breadcrumb span[itemprop="name"], .breadcrumbs span[itemprop="name"]'
  );
  if (breadcrumbs.length >= 2) {
    return breadcrumbs[1].textContent.trim();
  }

  const currentEpisodeEl =
    document.querySelector(".current-episode") ||
    document.querySelector("h1.current-episode");
  if (currentEpisodeEl && currentEpisodeEl.textContent.includes(":")) {
    return currentEpisodeEl.textContent.split(":")[0].trim();
  }

  const metaTitle =
    document.querySelector('meta[property="og:title"]')?.content ||
    document.title;
  return metaTitle
    .replace(/^Watch /i, "")
    .replace(/ - Crunchyroll.*/i, "")
    .replace(/ - Watch .*/i, "")
    .replace(/Episode \d+.*/i, "")
    .replace(/Ep\.\s*\d+.*/i, "")
    .replace(/\|.*/, "")
    .trim();
}

function showPageNotification(message) {
  let noti = document.getElementById("anime-tracker-toast");
  if (!noti) {
    noti = document.createElement("div");
    noti.id = "anime-tracker-toast";
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

  const storage = await browser.storage.local.get(["allowedSites", "animeList"]);
  const allowedSites = storage.allowedSites || [];
  const animeList = storage.animeList || [];

  const isAllowed =
    allowedSites.length === 0 ||
    allowedSites.some((site) => site && hostname.includes(site.trim()));
  if (!isAllowed) return;

  const episode = extractEpisodeInfo();
  const title = extractAnimeTitle();
  const url = window.location.href;

  if (!title || !episode) return;

  const cleanCurrentTitle = normalizeString(title);

  const existingIndex = animeList.findIndex((item) => {
    const cleanSavedTitle = normalizeString(item.title);
    return (
      cleanSavedTitle === cleanCurrentTitle ||
      (cleanSavedTitle.length > 5 && cleanCurrentTitle.includes(cleanSavedTitle)) ||
      (cleanCurrentTitle.length > 5 && cleanSavedTitle.includes(cleanCurrentTitle))
    );
  });

  const newEntry = { title, url, episode, updatedAt: Date.now() };

  if (existingIndex >= 0) {
    if (
      animeList[existingIndex].episode === episode &&
      animeList[existingIndex].url === url
    )
      return;

    animeList[existingIndex] = { ...animeList[existingIndex], ...newEntry };
    await browser.storage.local.set({ animeList });
    showPageNotification(`✓ Voortgang opgeslagen: Ep. ${episode}`);
  } else {
    animeList.unshift(newEntry);
    await browser.storage.local.set({ animeList });
    showPageNotification(`✓ Anime toegevoegd: Ep. ${episode}`);
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
  } else if (request.action === "getAnimeDetails") {
    return Promise.resolve({
      title: extractAnimeTitle(),
      episode: extractEpisodeInfo(),
      url: window.location.href,
    });
  }
});
