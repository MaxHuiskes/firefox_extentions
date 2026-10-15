document.addEventListener("DOMContentLoaded", async () => {
  const { allowedSites = [] } = await browser.storage.local.get("allowedSites");
  document.getElementById("sites").value = allowedSites.join(", ");
});

document.getElementById("save").addEventListener("click", async () => {
  const rawInput = document.getElementById("sites").value;
  const allowedSites = rawInput
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  await browser.storage.local.set({ allowedSites });
  const status = document.getElementById("status");
  status.textContent = "Settings saved successfully!";
  setTimeout(() => (status.textContent = ""), 2500);
});
