function setStatus(el, message, isError = false) {
  el.textContent = message;
  el.className = `status ${isError ? "err" : "ok"}`;
  if (message) {
    setTimeout(() => {
      if (el.textContent === message) el.textContent = "";
    }, 3500);
  }
}

function buildExportPayload(mangaList, allowedSites) {
  return {
    format: "manga-tracker-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    mangaList: mangaList || [],
    allowedSites: allowedSites || [],
  };
}

function parseImportPayload(raw) {
  const data = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!data || typeof data !== "object") {
    throw new Error("Invalid JSON");
  }

  const mangaList = Array.isArray(data.mangaList) ? data.mangaList : null;
  const allowedSites = Array.isArray(data.allowedSites) ? data.allowedSites : null;

  if (!mangaList && !allowedSites) {
    throw new Error("JSON must include mangaList and/or allowedSites");
  }

  for (const item of mangaList || []) {
    if (!item || typeof item.title !== "string" || !item.title.trim()) {
      throw new Error("Each manga entry needs a title");
    }
  }

  return {
    mangaList: mangaList || [],
    allowedSites: allowedSites || [],
    hasMangaList: Array.isArray(data.mangaList),
    hasAllowedSites: Array.isArray(data.allowedSites),
  };
}

function mergeMangaLists(current = [], incoming = []) {
  const byKey = new Map();

  for (const item of [...current, ...incoming]) {
    if (!item || !item.title) continue;
    const key = String(item.title)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    const prev = byKey.get(key);
    if (!prev || (item.updatedAt || 0) >= (prev.updatedAt || 0)) {
      byKey.set(key, {
        title: String(item.title).trim(),
        url: item.url || "",
        chapter: item.chapter != null ? String(item.chapter) : "",
        updatedAt: item.updatedAt || Date.now(),
      });
    }
  }

  return Array.from(byKey.values()).sort(
    (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)
  );
}

document.addEventListener("DOMContentLoaded", async () => {
  const { allowedSites = [] } = await getTrackerStorage();
  document.getElementById("sites").value = allowedSites.join(", ");
});

document.getElementById("save").addEventListener("click", async () => {
  const rawInput = document.getElementById("sites").value;
  const allowedSites = rawInput
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  await setTrackerStorage({ allowedSites });
  setStatus(document.getElementById("status"), "Settings saved successfully!");
});

document.getElementById("export-btn").addEventListener("click", async () => {
  const transferStatus = document.getElementById("transfer-status");
  try {
    const { mangaList = [], allowedSites = [] } = await getTrackerStorage();
    const payload = buildExportPayload(mangaList, allowedSites);
    document.getElementById("transfer-data").value = JSON.stringify(
      payload,
      null,
      2
    );
    setStatus(
      transferStatus,
      `Exported ${mangaList.length} manga. Copy or download, then import on the other device.`
    );
  } catch (err) {
    setStatus(transferStatus, `Export failed: ${err.message}`, true);
  }
});

document.getElementById("copy-btn").addEventListener("click", async () => {
  const transferStatus = document.getElementById("transfer-status");
  const text = document.getElementById("transfer-data").value.trim();
  if (!text) {
    setStatus(transferStatus, "Export first, or paste JSON before copying.", true);
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    setStatus(transferStatus, "Copied to clipboard.");
  } catch (_e) {
    document.getElementById("transfer-data").select();
    setStatus(
      transferStatus,
      "Clipboard blocked — select the text and copy manually.",
      true
    );
  }
});

document.getElementById("download-btn").addEventListener("click", () => {
  const transferStatus = document.getElementById("transfer-status");
  const text = document.getElementById("transfer-data").value.trim();
  if (!text) {
    setStatus(transferStatus, "Export first before downloading.", true);
    return;
  }

  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `manga-tracker-backup-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
  setStatus(transferStatus, "Download started (or use Copy on mobile).");
});

async function importFromText(raw) {
  const transferStatus = document.getElementById("transfer-status");
  const parsed = parseImportPayload(raw);
  const current = await getTrackerStorage();

  const next = {};
  if (parsed.hasMangaList) {
    next.mangaList = mergeMangaLists(current.mangaList || [], parsed.mangaList);
  }
  if (parsed.hasAllowedSites) {
    const mergedSites = Array.from(
      new Set([...(current.allowedSites || []), ...parsed.allowedSites])
    );
    next.allowedSites = mergedSites;
    document.getElementById("sites").value = mergedSites.join(", ");
  }

  await setTrackerStorage(next);
  setStatus(
    transferStatus,
    `Import merged. Manga: ${(next.mangaList || current.mangaList || []).length}.`
  );
}

document.getElementById("import-btn").addEventListener("click", async () => {
  const transferStatus = document.getElementById("transfer-status");
  const raw = document.getElementById("transfer-data").value.trim();
  if (!raw) {
    setStatus(transferStatus, "Paste exported JSON first.", true);
    return;
  }

  try {
    await importFromText(raw);
  } catch (err) {
    setStatus(transferStatus, `Import failed: ${err.message}`, true);
  }
});

document.getElementById("import-file").addEventListener("change", async (event) => {
  const transferStatus = document.getElementById("transfer-status");
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    document.getElementById("transfer-data").value = text;
    await importFromText(text);
  } catch (err) {
    setStatus(transferStatus, `File import failed: ${err.message}`, true);
  } finally {
    event.target.value = "";
  }
});
