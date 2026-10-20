function setStatus(message, isError = false) {
  const el = document.getElementById("status");
  el.textContent = message || "";
  el.className = `status ${isError ? "err" : "ok"}`;
}

function buildExportPayload(mangaList, allowedSites, ignoredSites) {
  return {
    format: "manga-tracker-backup",
    version: 3,
    exportedAt: new Date().toISOString(),
    mangaList: mangaList || [],
    allowedSites: allowedSites || [],
    ignoredSites: ignoredSites || [],
  };
}

function parseImportPayload(raw) {
  const data = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!data || typeof data !== "object") throw new Error("Invalid JSON");

  const mangaList = Array.isArray(data.mangaList) ? data.mangaList : null;
  const allowedSites = Array.isArray(data.allowedSites)
    ? data.allowedSites
    : null;
  const ignoredSites = Array.isArray(data.ignoredSites)
    ? data.ignoredSites
    : null;

  if (!mangaList && !allowedSites && !ignoredSites) {
    throw new Error("JSON must include mangaList and/or site lists");
  }
  for (const item of mangaList || []) {
    if (!item || typeof item.title !== "string" || !item.title.trim()) {
      throw new Error("Each manga entry needs a title");
    }
  }
  return {
    mangaList: mangaList || [],
    allowedSites: allowedSites || [],
    ignoredSites: ignoredSites || [],
    hasMangaList: Array.isArray(data.mangaList),
    hasAllowedSites: Array.isArray(data.allowedSites),
    hasIgnoredSites: Array.isArray(data.ignoredSites),
  };
}

async function downloadText(filename, text, mime) {
  const blob = new Blob([text], { type: mime || "application/json" });
  const url = URL.createObjectURL(blob);
  try {
    if (browser.downloads && browser.downloads.download) {
      await browser.downloads.download({
        url,
        filename,
        saveAs: true,
      });
      // Revoke later — download needs the blob URL briefly.
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } else {
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    }
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const { darkMode } = await getSettingsFlags();
  document.body.classList.toggle("dark", Boolean(darkMode));
});

document.getElementById("export-btn").addEventListener("click", async () => {
  try {
    const {
      mangaList = [],
      allowedSites = [],
      ignoredSites = [],
    } = await getTrackerStorage();
    document.getElementById("transfer-data").value = JSON.stringify(
      buildExportPayload(mangaList, allowedSites, ignoredSites),
      null,
      2
    );
    setStatus(`Exported ${mangaList.length} manga.`);
  } catch (err) {
    setStatus(err.message || String(err), true);
  }
});

document.getElementById("copy-btn").addEventListener("click", async () => {
  const text = document.getElementById("transfer-data").value.trim();
  if (!text) {
    setStatus("Export first, or paste JSON before copying.", true);
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    setStatus("Copied to clipboard.");
  } catch (_e) {
    document.getElementById("transfer-data").select();
    setStatus("Clipboard blocked — select the text and copy manually.", true);
  }
});

document.getElementById("download-btn").addEventListener("click", async () => {
  let text = document.getElementById("transfer-data").value.trim();
  try {
    if (!text) {
      const {
        mangaList = [],
        allowedSites = [],
        ignoredSites = [],
      } = await getTrackerStorage();
      text = JSON.stringify(
        buildExportPayload(mangaList, allowedSites, ignoredSites),
        null,
        2
      );
      document.getElementById("transfer-data").value = text;
    }
    const stamp = new Date().toISOString().slice(0, 10);
    await downloadText(`manga-tracker-backup-${stamp}.json`, text);
    setStatus("Download started — pick a folder in the save dialog.");
  } catch (err) {
    setStatus(err.message || String(err), true);
  }
});

async function importFromText(raw) {
  const parsed = parseImportPayload(raw);
  const current = await getTrackerStorage();
  const next = {};
  if (parsed.hasMangaList) {
    next.mangaList = mergeMangaLists(current.mangaList || [], parsed.mangaList);
  }
  if (parsed.hasAllowedSites) next.allowedSites = parsed.allowedSites;
  if (parsed.hasIgnoredSites) next.ignoredSites = parsed.ignoredSites;
  await setTrackerStorage(next);
  setStatus(
    `Import merged. Manga: ${(next.mangaList || current.mangaList || []).length}.`
  );
}

document.getElementById("import-btn").addEventListener("click", async () => {
  const raw = document.getElementById("transfer-data").value.trim();
  if (!raw) {
    setStatus("Paste exported JSON first.", true);
    return;
  }
  try {
    await importFromText(raw);
  } catch (err) {
    setStatus(err.message || String(err), true);
  }
});

document
  .getElementById("import-file")
  .addEventListener("change", async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      document.getElementById("transfer-data").value = text;
      await importFromText(text);
    } catch (err) {
      setStatus(err.message || String(err), true);
    } finally {
      event.target.value = "";
    }
  });
