let editingIndex = -1;
let saveTimeout = null;

function truncateTitle(str, maxLength = 20) {
  if (!str) return "";
  return str.length > maxLength ? str.substring(0, maxLength) + "..." : str;
}

document.addEventListener("DOMContentLoaded", async () => {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  const { mangaList = [] } = await getTrackerStorage();

  if (tab && tab.url) {
    try {
      const response = await browser.tabs.sendMessage(tab.id, {
        action: "getMangaDetails",
      });
      if (response && response.title) {
        document.getElementById("title").value = response.title;
        document.getElementById("url").value = response.url;
        document.getElementById("chapter").value = response.chapter;
      }
    } catch (e) {
      document.getElementById("url").value = tab.url;
    }
  }

  renderList(mangaList);

  ["title", "url", "chapter"].forEach((id) => {
    document.getElementById(id).addEventListener("input", triggerAutoSave);
  });
});

browser.storage.onChanged.addListener((changes, areaName) => {
  // Prefer local — sync mirrors can briefly lag and resurrect deletes.
  if (areaName === "local" && changes.mangaList) {
    renderList(changes.mangaList.newValue || []);
  }
});

document.getElementById("open-options-btn").addEventListener("click", () => {
  browser.runtime.openOptionsPage();
});

document.getElementById("gist-sync-btn").addEventListener("click", async () => {
  const btn = document.getElementById("gist-sync-btn");
  const statusEl = document.getElementById("status");
  btn.disabled = true;
  statusEl.classList.remove("err");
  statusEl.textContent = "Syncing…";

  try {
    const result = await browser.runtime.sendMessage({
      action: "forceGistSync",
    });
    const { mangaList = [] } = await getTrackerStorage();
    renderList(mangaList);

    if (result && result.error) {
      statusEl.classList.add("err");
      statusEl.textContent = result.error;
    } else if (result && result.skipped && result.reason) {
      statusEl.classList.add("err");
      statusEl.textContent =
        result.reason === "missing token or gist id"
          ? "Set token + Gist ID in Opties"
          : "Sync skipped";
    } else {
      statusEl.textContent = `✓ Synced (${result.mangaCount || mangaList.length})`;
      setTimeout(() => {
        if (statusEl.textContent.startsWith("✓ Synced")) statusEl.textContent = "";
      }, 2000);
    }
  } catch (err) {
    statusEl.classList.add("err");
    statusEl.textContent = err.message || String(err);
  } finally {
    btn.disabled = false;
  }
});

function triggerAutoSave() {
  clearTimeout(saveTimeout);
  const statusEl = document.getElementById("status");
  statusEl.textContent = "Aan het typen...";

  saveTimeout = setTimeout(async () => {
    await saveMangaData();
    statusEl.textContent = "✓ Automatisch opgeslagen";
    setTimeout(() => {
      statusEl.textContent = "";
    }, 2000);
  }, 500);
}

async function saveMangaData() {
  const title = document.getElementById("title").value.trim();
  const url = document.getElementById("url").value.trim();
  const chapter = document.getElementById("chapter").value.trim();

  if (!title || !url) return;

  const { mangaList = [] } = await getTrackerStorage();
  const newEntry = { title, url, chapter, updatedAt: Date.now() };

  if (editingIndex >= 0) {
    mangaList[editingIndex] = newEntry;
  } else {
    const existingIndex = mangaList.findIndex(
      (i) => i.title.toLowerCase() === title.toLowerCase()
    );
    if (existingIndex >= 0) {
      mangaList[existingIndex] = newEntry;
    } else {
      mangaList.unshift(newEntry);
    }
  }

  await setTrackerStorage({ mangaList });
  renderList(mangaList);
}

function renderList(list) {
  const ul = document.getElementById("manga-list");
  ul.textContent = "";

  if (list.length === 0) {
    const emptyLi = document.createElement("li");
    emptyLi.className = "empty-msg";
    emptyLi.textContent = "Nog geen manga opgeslagen.";
    ul.appendChild(emptyLi);
    return;
  }

  list.forEach((item, index) => {
    const li = document.createElement("li");

    const info = document.createElement("div");
    info.className = "info";

    const link = document.createElement("a");
    link.href = item.url;
    link.target = "_blank";
    link.title = item.title;

    const strong = document.createElement("strong");
    const maxLen = window.matchMedia("(max-width: 480px)").matches ? 48 : 22;
    strong.textContent = truncateTitle(item.title, maxLen);
    link.appendChild(strong);

    info.appendChild(link);
    info.appendChild(
      document.createTextNode(` - Ch. ${item.chapter || "N/A"}`)
    );

    const actions = document.createElement("div");
    actions.className = "actions";

    const editBtn = document.createElement("button");
    editBtn.className = "icon-btn";
    editBtn.textContent = "✏️";
    editBtn.title = "Bewerken";
    editBtn.onclick = () => {
      editingIndex = index;
      document.getElementById("title").value = item.title;
      document.getElementById("url").value = item.url;
      document.getElementById("chapter").value = item.chapter || "";
      document.getElementById("form-title").textContent = "Manga Bewerken";
    };

    const delBtn = document.createElement("button");
    delBtn.className = "icon-btn";
    delBtn.textContent = "❌";
    delBtn.title = "Verwijderen";
    delBtn.onclick = async () => {
      list.splice(index, 1);
      await setTrackerStorage({ mangaList: list });
      renderList(list);
    };

    actions.appendChild(editBtn);
    actions.appendChild(delBtn);
    li.appendChild(info);
    li.appendChild(actions);
    ul.appendChild(li);
  });
}
