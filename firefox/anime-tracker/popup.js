let editingIndex = -1;
let saveTimeout = null;

function truncateTitle(str, maxLength = 20) {
  if (!str) return "";
  return str.length > maxLength ? str.substring(0, maxLength) + "..." : str;
}

document.addEventListener("DOMContentLoaded", async () => {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  const { animeList = [] } = await browser.storage.local.get("animeList");

  if (tab && tab.url) {
    try {
      const response = await browser.tabs.sendMessage(tab.id, {
        action: "getAnimeDetails",
      });
      if (response && response.title) {
        document.getElementById("title").value = response.title;
        document.getElementById("url").value = response.url;
        document.getElementById("episode").value = response.episode;
      }
    } catch (e) {
      document.getElementById("url").value = tab.url;
    }
  }

  renderList(animeList);

  ["title", "url", "episode"].forEach((id) => {
    document.getElementById(id).addEventListener("input", triggerAutoSave);
  });
});

browser.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes.animeList) {
    renderList(changes.animeList.newValue || []);
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
    await saveAnimeData();
    statusEl.textContent = "✓ Automatisch opgeslagen";
    setTimeout(() => {
      statusEl.textContent = "";
    }, 2000);
  }, 500);
}

async function saveAnimeData() {
  const title = document.getElementById("title").value.trim();
  const url = document.getElementById("url").value.trim();
  const episode = document.getElementById("episode").value.trim();

  if (!title || !url) return;

  const { animeList = [] } = await browser.storage.local.get("animeList");
  const newEntry = { title, url, episode, updatedAt: Date.now() };

  if (editingIndex >= 0) {
    animeList[editingIndex] = newEntry;
  } else {
    const existingIndex = animeList.findIndex(
      (i) => i.title.toLowerCase() === title.toLowerCase()
    );
    if (existingIndex >= 0) {
      animeList[existingIndex] = newEntry;
    } else {
      animeList.unshift(newEntry);
    }
  }

  await browser.storage.local.set({ animeList });
  renderList(animeList);
}

function renderList(list) {
  const ul = document.getElementById("anime-list");
  ul.textContent = "";

  if (list.length === 0) {
    const emptyLi = document.createElement("li");
    emptyLi.className = "empty-msg";
    emptyLi.textContent = "Nog geen anime opgeslagen.";
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
    info.appendChild(
      document.createTextNode(` - Ep. ${item.episode || "N/A"}`)
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
      document.getElementById("episode").value = item.episode || "";
      document.getElementById("form-title").textContent = "Anime Bewerken";
    };

    const delBtn = document.createElement("button");
    delBtn.className = "icon-btn";
    delBtn.textContent = "❌";
    delBtn.title = "Verwijderen";
    delBtn.onclick = async () => {
      list.splice(index, 1);
      await browser.storage.local.set({ animeList: list });
      renderList(list);
    };

    actions.appendChild(editBtn);
    actions.appendChild(delBtn);
    li.appendChild(info);
    li.appendChild(actions);
    ul.appendChild(li);
  });
}
