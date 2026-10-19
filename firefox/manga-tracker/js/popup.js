let editingIndex = -1;
let saveTimeout = null;
let allManga = [];
let selectMode = false;
let selectedKeys = new Set();
let pendingConfirm = null;
let currentHostname = "";

function truncateTitle(str, maxLength = 20) {
  if (!str) return "";
  return str.length > maxLength ? str.substring(0, maxLength) + "..." : str;
}

function siteFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch (_e) {
    return "";
  }
}

function setStatusMsg(text, isError = false) {
  const el = document.getElementById("status-msg");
  el.classList.toggle("err", Boolean(isError));
  el.textContent = text || "";
}

function applyDarkMode(on) {
  document.body.classList.toggle("dark", Boolean(on));
  document.getElementById("theme-btn").textContent = on ? "☀" : "☾";
}

function formatSyncMeta(status) {
  const el = document.getElementById("sync-meta");
  if (!status) {
    el.textContent = "";
    return;
  }
  if (status.gistRateLimitedUntil > Date.now()) {
    el.textContent = `Rate limited until ${new Date(status.gistRateLimitedUntil).toLocaleTimeString()}`;
    return;
  }
  if (status.lastGistSyncError) {
    el.textContent = `Last sync failed`;
    el.title = status.lastGistSyncError;
    return;
  }
  if (status.lastGistSyncAt) {
    el.textContent = `Last sync ${new Date(status.lastGistSyncAt).toLocaleString()}`;
    return;
  }
  el.textContent = "Not synced yet";
}

async function refreshSyncMeta() {
  try {
    const status = await browser.runtime.sendMessage({
      action: "getGistSyncStatus",
    });
    formatSyncMeta(status);
  } catch (_e) {
    document.getElementById("sync-meta").textContent = "";
  }
}

function filteredSortedList() {
  const q = document.getElementById("search").value.trim().toLowerCase();
  const statusFilter = document.getElementById("filter-status").value;
  const siteFilter = document.getElementById("filter-site").value;
  const sort = document.getElementById("sort").value;

  let list = allManga.slice();

  if (q) {
    list = list.filter((item) =>
      String(item.title || "").toLowerCase().includes(q)
    );
  }
  if (statusFilter !== "all") {
    list = list.filter(
      (item) => normalizeStatus(item.status) === statusFilter
    );
  }
  if (siteFilter !== "all") {
    list = list.filter((item) => siteFromUrl(item.url) === siteFilter);
  }

  const statusOrder = { reading: 0, hold: 1, dropped: 2, finished: 3 };
  list.sort((a, b) => {
    if (sort === "title") {
      return String(a.title || "").localeCompare(String(b.title || ""));
    }
    if (sort === "chapter") {
      return (
        parseFloat(b.chapter) - parseFloat(a.chapter) ||
        String(a.title || "").localeCompare(String(b.title || ""))
      );
    }
    if (sort === "status") {
      return (
        (statusOrder[normalizeStatus(a.status)] || 0) -
          (statusOrder[normalizeStatus(b.status)] || 0) ||
        (b.updatedAt || 0) - (a.updatedAt || 0)
      );
    }
    return (b.updatedAt || 0) - (a.updatedAt || 0);
  });

  return list;
}

function fillSiteFilter() {
  const select = document.getElementById("filter-site");
  const current = select.value || "all";
  const sites = [
    ...new Set(
      allManga.map((item) => siteFromUrl(item.url)).filter(Boolean)
    ),
  ].sort();

  select.textContent = "";
  const allOpt = document.createElement("option");
  allOpt.value = "all";
  allOpt.textContent = "All sites";
  select.appendChild(allOpt);

  for (const site of sites) {
    const opt = document.createElement("option");
    opt.value = site;
    opt.textContent = site;
    select.appendChild(opt);
  }
  select.value = sites.includes(current) ? current : "all";
}

function showConfirm(text, onYes) {
  pendingConfirm = onYes;
  document.getElementById("confirm-text").textContent = text;
  document.getElementById("confirm-bar").classList.add("show");
}

function hideConfirm() {
  pendingConfirm = null;
  document.getElementById("confirm-bar").classList.remove("show");
}

function setSelectMode(on) {
  selectMode = on;
  if (!on) selectedKeys.clear();
  document.getElementById("bulk-select-btn").textContent = on
    ? "Cancel select"
    : "Select";
  document.getElementById("bulk-delete-btn").disabled =
    !on || selectedKeys.size === 0;
  renderList();
}

document.addEventListener("DOMContentLoaded", async () => {
  const storage = await getTrackerStorage();
  allManga = storage.mangaList || [];
  applyDarkMode(storage.darkMode);

  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });

  if (tab && tab.url) {
    try {
      currentHostname = new URL(tab.url).hostname.replace(/^www\./, "");
    } catch (_e) {
      currentHostname = "";
    }

    try {
      const response = await browser.tabs.sendMessage(tab.id, {
        action: "getMangaDetails",
      });
      if (response && response.title) {
        document.getElementById("title").value = response.title;
        document.getElementById("url").value = response.url;
        document.getElementById("chapter").value = response.chapter || "";
        if (response.hostname) currentHostname = response.hostname;
      }
    } catch (_e) {
      document.getElementById("url").value = tab.url;
    }
  }

  fillSiteFilter();
  renderList();
  refreshSyncMeta();

  ["title", "url", "chapter"].forEach((id) => {
    document.getElementById(id).addEventListener("input", triggerAutoSave);
  });
  document.getElementById("status").addEventListener("change", triggerAutoSave);
  ["search", "sort", "filter-status", "filter-site"].forEach((id) => {
    document.getElementById(id).addEventListener("input", renderList);
    document.getElementById(id).addEventListener("change", renderList);
  });
});

browser.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  if (changes.mangaList) {
    allManga = changes.mangaList.newValue || [];
    fillSiteFilter();
    renderList();
  }
  if (changes.darkMode) {
    applyDarkMode(changes.darkMode.newValue);
  }
  if (
    changes.lastGistSyncAt ||
    changes.lastGistSyncError ||
    changes.gistRateLimitedUntil
  ) {
    refreshSyncMeta();
  }
});

document.getElementById("open-options-btn").addEventListener("click", () => {
  browser.runtime.openOptionsPage();
});

document.getElementById("theme-btn").addEventListener("click", async () => {
  const next = !document.body.classList.contains("dark");
  applyDarkMode(next);
  await setTrackerStorage({ darkMode: next });
});

document.getElementById("bulk-select-btn").addEventListener("click", () => {
  setSelectMode(!selectMode);
});

document.getElementById("bulk-delete-btn").addEventListener("click", () => {
  if (!selectedKeys.size) return;
  showConfirm(`Delete ${selectedKeys.size} manga?`, async () => {
    const next = allManga.filter(
      (item) => !selectedKeys.has(mangaKey(item.title))
    );
    allManga = next;
    await setTrackerStorage({ mangaList: next });
    setSelectMode(false);
    fillSiteFilter();
    renderList();
    setStatusMsg("✓ Deleted");
  });
});

document.getElementById("confirm-yes").addEventListener("click", async () => {
  const fn = pendingConfirm;
  hideConfirm();
  if (fn) await fn();
});

document.getElementById("confirm-no").addEventListener("click", hideConfirm);

document.getElementById("ignore-site-btn").addEventListener("click", async () => {
  if (!currentHostname) {
    setStatusMsg("No active site", true);
    return;
  }
  showConfirm(`Ignore ${currentHostname}?`, async () => {
    const { ignoredSites = [] } = await getTrackerStorage();
    if (!ignoredSites.includes(currentHostname)) {
      ignoredSites.push(currentHostname);
      await setTrackerStorage({ ignoredSites });
    }
    setStatusMsg(`Ignored ${currentHostname}`);
  });
});

document.getElementById("gist-sync-btn").addEventListener("click", async () => {
  const btn = document.getElementById("gist-sync-btn");
  btn.disabled = true;
  setStatusMsg("Syncing…");

  try {
    const result = await browser.runtime.sendMessage({
      action: "forceGistSync",
    });
    const { mangaList = [] } = await getTrackerStorage();
    allManga = mangaList;
    fillSiteFilter();
    renderList();
    await refreshSyncMeta();

    if (result && result.error) {
      setStatusMsg(result.error, true);
    } else if (result && result.skipped && result.reason) {
      setStatusMsg(
        result.reason === "missing token or gist id"
          ? "Set token + Gist ID in Opties"
          : "Sync skipped",
        true
      );
    } else {
      setStatusMsg(`✓ Synced (${result.mangaCount || mangaList.length})`);
      setTimeout(() => {
        const el = document.getElementById("status-msg");
        if (el.textContent.startsWith("✓ Synced")) el.textContent = "";
      }, 2000);
    }
  } catch (err) {
    setStatusMsg(err.message || String(err), true);
  } finally {
    btn.disabled = false;
  }
});

function triggerAutoSave() {
  clearTimeout(saveTimeout);
  setStatusMsg("Aan het typen...");

  saveTimeout = setTimeout(async () => {
    await saveMangaData();
    setStatusMsg("✓ Automatisch opgeslagen");
    setTimeout(() => {
      const el = document.getElementById("status-msg");
      if (el.textContent === "✓ Automatisch opgeslagen") el.textContent = "";
    }, 2000);
  }, 500);
}

async function saveMangaData() {
  const title = document.getElementById("title").value.trim();
  const url = document.getElementById("url").value.trim();
  const chapter = document.getElementById("chapter").value.trim();
  const status = normalizeStatus(document.getElementById("status").value);

  if (!title || !url) return;

  const list = allManga.slice();
  const newEntry = {
    title,
    url,
    chapter,
    status,
    updatedAt: Date.now(),
  };

  let idx = editingIndex;
  if (idx < 0) {
    idx = list.findIndex(
      (i) => mangaKey(i.title) === mangaKey(title)
    );
  }

  if (idx >= 0) {
    list[idx] = {
      ...list[idx],
      ...newEntry,
      cover: list[idx].cover,
    };
  } else {
    list.unshift(newEntry);
  }

  allManga = list;
  await setTrackerStorage({ mangaList: list });
  fillSiteFilter();
  renderList();
}

function renderList() {
  const ul = document.getElementById("manga-list");
  ul.textContent = "";
  const list = filteredSortedList();
  document.getElementById("list-count").textContent =
    `${list.length}/${allManga.length}`;

  if (list.length === 0) {
    const emptyLi = document.createElement("li");
    emptyLi.className = "empty-msg";
    emptyLi.textContent = allManga.length
      ? "No matches."
      : "Nog geen manga opgeslagen.";
    ul.appendChild(emptyLi);
    return;
  }

  const maxLen = window.matchMedia("(max-width: 480px)").matches ? 48 : 28;

  list.forEach((item) => {
    const key = mangaKey(item.title);
    const realIndex = allManga.findIndex(
      (m) => mangaKey(m.title) === key
    );
    const li = document.createElement("li");

    if (selectMode) {
      const check = document.createElement("input");
      check.type = "checkbox";
      check.className = "check";
      check.checked = selectedKeys.has(key);
      check.addEventListener("change", () => {
        if (check.checked) selectedKeys.add(key);
        else selectedKeys.delete(key);
        document.getElementById("bulk-delete-btn").disabled =
          selectedKeys.size === 0;
      });
      li.appendChild(check);
    }

    if (item.cover) {
      const img = document.createElement("img");
      img.className = "cover";
      img.src = item.cover;
      img.alt = "";
      img.loading = "lazy";
      img.referrerPolicy = "no-referrer";
      img.onerror = () => {
        img.replaceWith(Object.assign(document.createElement("div"), {
          className: "cover placeholder",
          textContent: "—",
        }));
      };
      li.appendChild(img);
    } else {
      const ph = document.createElement("div");
      ph.className = "cover placeholder";
      ph.textContent = "—";
      li.appendChild(ph);
    }

    const info = document.createElement("div");
    info.className = "info";

    const link = document.createElement("a");
    link.href = item.url;
    link.target = "_blank";
    link.title = item.title;
    const strong = document.createElement("strong");
    strong.textContent = truncateTitle(item.title, maxLen);
    link.appendChild(strong);
    info.appendChild(link);

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.appendChild(
      document.createTextNode(`Ch. ${item.chapter || "N/A"}`)
    );

    const nextUrl = nextChapterUrl(item.url, item.chapter);
    if (nextUrl) {
      const next = document.createElement("a");
      next.href = nextUrl;
      next.target = "_blank";
      next.className = "next";
      next.textContent = "Next →";
      meta.appendChild(next);
    }
    info.appendChild(meta);

    const statusSelect = document.createElement("select");
    statusSelect.className = "status-select";
    for (const s of STATUSES) {
      const opt = document.createElement("option");
      opt.value = s;
      opt.textContent = s.charAt(0).toUpperCase() + s.slice(1);
      if (normalizeStatus(item.status) === s) opt.selected = true;
      statusSelect.appendChild(opt);
    }
    statusSelect.addEventListener("change", async () => {
      if (realIndex < 0) return;
      allManga[realIndex] = {
        ...allManga[realIndex],
        status: normalizeStatus(statusSelect.value),
        updatedAt: Date.now(),
      };
      await setTrackerStorage({ mangaList: allManga });
      renderList();
    });
    info.appendChild(statusSelect);

    const actions = document.createElement("div");
    actions.className = "actions";

    const editBtn = document.createElement("button");
    editBtn.className = "icon-btn";
    editBtn.textContent = "✏️";
    editBtn.title = "Bewerken";
    editBtn.onclick = () => {
      editingIndex = realIndex;
      document.getElementById("title").value = item.title;
      document.getElementById("url").value = item.url;
      document.getElementById("chapter").value = item.chapter || "";
      document.getElementById("status").value = normalizeStatus(item.status);
      document.getElementById("form-title").textContent = "Manga Bewerken";
    };

    const delBtn = document.createElement("button");
    delBtn.className = "icon-btn";
    delBtn.textContent = "❌";
    delBtn.title = "Verwijderen";
    delBtn.onclick = () => {
      showConfirm(`Delete "${item.title}"?`, async () => {
        if (realIndex < 0) return;
        allManga.splice(realIndex, 1);
        await setTrackerStorage({ mangaList: allManga });
        fillSiteFilter();
        renderList();
        setStatusMsg("✓ Deleted");
      });
    };

    actions.appendChild(editBtn);
    actions.appendChild(delBtn);
    li.appendChild(info);
    li.appendChild(actions);
    ul.appendChild(li);
  });
}
