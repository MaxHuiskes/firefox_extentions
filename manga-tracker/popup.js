let editingIndex = -1;
let saveTimeout = null;

function truncateTitle(str, maxLength = 20) {
  if (!str) return "";
  return str.length > maxLength ? str.substring(0, maxLength) + "..." : str;
}

document.addEventListener("DOMContentLoaded", async () => {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  const { mangaList = [] } = await browser.storage.sync.get("mangaList");

  if (tab && tab.url) {
    try {
      const response = await browser.tabs.sendMessage(tab.id, { action: "getMangaDetails" });
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

  ["title", "url", "chapter"].forEach(id => {
    document.getElementById(id).addEventListener("input", triggerAutoSave);
  });
});

browser.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "sync" && changes.mangaList) {
    renderList(changes.mangaList.newValue || []);
  }
});

document.getElementById("open-options-btn").addEventListener("click", () => {
  browser.runtime.openOptionsPage();
});

function triggerAutoSave() {
  clearTimeout(saveTimeout);
  const statusEl = document.getElementById("status");
  statusEl.textContent = "Aan het typen...";

  saveTimeout = setTimeout(async () => {
    await saveMangaData();
    statusEl.textContent = "✓ Automatisch opgeslagen";
    setTimeout(() => { statusEl.textContent = ""; }, 2000);
  }, 500);
}

async function saveMangaData() {
  const title = document.getElementById("title").value.trim();
  const url = document.getElementById("url").value.trim();
  const chapter = document.getElementById("chapter").value.trim();

  if (!title || !url) return;

  const { mangaList = [] } = await browser.storage.sync.get("mangaList");
  const newEntry = { title, url, chapter, updatedAt: Date.now() };

  if (editingIndex >= 0) {
    mangaList[editingIndex] = newEntry;
  } else {
    const existingIndex = mangaList.findIndex(i => i.title.toLowerCase() === title.toLowerCase());
    if (existingIndex >= 0) {
      mangaList[existingIndex] = newEntry;
    } else {
      mangaList.unshift(newEntry);
    }
  }

  await browser.storage.sync.set({ mangaList });
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
    strong.textContent = truncateTitle(item.title, 20);
    link.appendChild(strong);

    info.appendChild(link);
    info.appendChild(document.createTextNode(` - Ch. ${item.chapter || "N/A"}`));

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
      await browser.storage.sync.set({ mangaList: list });
      renderList(list);
    };

    actions.appendChild(editBtn);
    actions.appendChild(delBtn);
    li.appendChild(info);
    li.appendChild(actions);
    ul.appendChild(li);
  });
}