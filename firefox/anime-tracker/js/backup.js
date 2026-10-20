function setStatus(id, message, isError = false) {
  const el = document.getElementById(id);
  el.textContent = message || "";
  el.className = `status ${isError ? "err" : "ok"}`;
}

function buildExportPayload(animeList, allowedSites, ignoredSites) {
  return {
    format: "anime-tracker-backup",
    version: 3,
    exportedAt: new Date().toISOString(),
    animeList: animeList || [],
    allowedSites: allowedSites || [],
    ignoredSites: ignoredSites || [],
  };
}

function parseImportPayload(raw) {
  const data = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!data || typeof data !== "object") throw new Error("Invalid JSON");

  const animeList = Array.isArray(data.animeList) ? data.animeList : null;
  const allowedSites = Array.isArray(data.allowedSites)
    ? data.allowedSites
    : null;
  const ignoredSites = Array.isArray(data.ignoredSites)
    ? data.ignoredSites
    : null;

  if (!animeList && !allowedSites && !ignoredSites) {
    throw new Error("JSON must include animeList and/or site lists");
  }
  for (const item of animeList || []) {
    if (!item || typeof item.title !== "string" || !item.title.trim()) {
      throw new Error("Each anime entry needs a title");
    }
  }
  return {
    animeList: animeList || [],
    allowedSites: allowedSites || [],
    ignoredSites: ignoredSites || [],
    hasAnimeList: Array.isArray(data.animeList),
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
      animeList = [],
      allowedSites = [],
      ignoredSites = [],
    } = await getTrackerStorage();
    document.getElementById("transfer-data").value = JSON.stringify(
      buildExportPayload(animeList, allowedSites, ignoredSites),
      null,
      2
    );
    setStatus("status", `Exported ${animeList.length} anime.`);
  } catch (err) {
    setStatus("status", err.message || String(err), true);
  }
});

document.getElementById("copy-btn").addEventListener("click", async () => {
  const text = document.getElementById("transfer-data").value.trim();
  if (!text) {
    setStatus("status", "Export first, or paste before copying.", true);
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    setStatus("status", "Copied to clipboard.");
  } catch (_e) {
    document.getElementById("transfer-data").select();
    setStatus("status", "Clipboard blocked — copy manually.", true);
  }
});

document.getElementById("download-btn").addEventListener("click", async () => {
  let text = document.getElementById("transfer-data").value.trim();
  try {
    if (!text) {
      const {
        animeList = [],
        allowedSites = [],
        ignoredSites = [],
      } = await getTrackerStorage();
      text = JSON.stringify(
        buildExportPayload(animeList, allowedSites, ignoredSites),
        null,
        2
      );
      document.getElementById("transfer-data").value = text;
    }
    const stamp = new Date().toISOString().slice(0, 10);
    await downloadText(`anime-tracker-backup-${stamp}.json`, text);
    setStatus("status", "Download started — pick a folder in the save dialog.");
  } catch (err) {
    setStatus("status", err.message || String(err), true);
  }
});

async function importFromText(raw) {
  if (isMalXml(raw)) {
    const parsed = parseMalAnimeXml(raw);
    const current = await getTrackerStorage();
    const merged = mergeAnimeLists(
      current.animeList || [],
      parsed.animeList || []
    );
    await setTrackerStorage({ animeList: merged });
    setStatus(
      "status",
      `MAL import ${parsed.animeList.length} → ${merged.length} total.`
    );
    return;
  }

  const parsed = parseImportPayload(raw);
  const current = await getTrackerStorage();
  const next = {};
  if (parsed.hasAnimeList) {
    next.animeList = mergeAnimeLists(current.animeList || [], parsed.animeList);
  }
  if (parsed.hasAllowedSites) next.allowedSites = parsed.allowedSites;
  if (parsed.hasIgnoredSites) next.ignoredSites = parsed.ignoredSites;
  await setTrackerStorage(next);
  setStatus(
    "status",
    `Import merged. Anime: ${(next.animeList || current.animeList || []).length}.`
  );
}

document.getElementById("import-btn").addEventListener("click", async () => {
  const raw = document.getElementById("transfer-data").value.trim();
  if (!raw) {
    setStatus("status", "Paste JSON or MAL XML first.", true);
    return;
  }
  try {
    await importFromText(raw);
  } catch (err) {
    setStatus("status", err.message || String(err), true);
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
      setStatus("status", err.message || String(err), true);
    } finally {
      event.target.value = "";
    }
  });

document.getElementById("mal-export-btn").addEventListener("click", async () => {
  try {
    const { animeList = [] } = await getTrackerStorage();
    const xml = buildMalAnimeXml(animeList);
    const stamp = new Date().toISOString().slice(0, 10);
    await downloadText(
      `animelist-export-${stamp}.xml`,
      xml,
      "application/xml"
    );
    setStatus("mal-status", `Exported ${animeList.length} anime (MAL XML).`);
  } catch (err) {
    setStatus("mal-status", err.message || String(err), true);
  }
});

document
  .getElementById("mal-import-file")
  .addEventListener("change", async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      if (!isMalXml(text)) {
        throw new Error("Not a MyAnimeList animelist XML file");
      }
      const parsed = parseMalAnimeXml(text);
      const current = await getTrackerStorage();
      const merged = mergeAnimeLists(
        current.animeList || [],
        parsed.animeList || []
      );
      await setTrackerStorage({ animeList: merged });
      document.getElementById("transfer-data").value = text.slice(0, 2000);
      setStatus(
        "mal-status",
        `Imported ${parsed.animeList.length} → ${merged.length} total.`
      );
    } catch (err) {
      setStatus("mal-status", err.message || String(err), true);
    } finally {
      event.target.value = "";
    }
  });
