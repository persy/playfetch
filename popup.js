const ids = ["open", "copy", "download"];
const els = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));
const runBtn = document.getElementById("run");
const status = document.getElementById("status");

// Stato di default: solo "copy" attivo, così il primo utilizzo è simile a prima
const DEFAULTS = { open: false, copy: true, download: false };

(async () => {
  const saved = (await chrome.storage.local.get("popupOptions")).popupOptions || DEFAULTS;
  ids.forEach((id) => (els[id].checked = !!saved[id]));
})();

ids.forEach((id) => {
  els[id].addEventListener("change", () => {
    const options = Object.fromEntries(ids.map((k) => [k, els[k].checked]));
    chrome.storage.local.set({ popupOptions: options });
  });
});

function setStatus(text, kind) {
  status.textContent = text;
  status.className = "status" + (kind ? " " + kind : "");
}

runBtn.addEventListener("click", () => {
  const options = Object.fromEntries(ids.map((k) => [k, els[k].checked]));
  if (!options.open && !options.copy && !options.download) {
    setStatus("Turn on at least one option.", "error");
    return;
  }

  runBtn.disabled = true;
  setStatus("Working…");

  chrome.runtime.sendMessage({ action: "run", options }, async (res) => {
    if (chrome.runtime.lastError) {
      runBtn.disabled = false;
      setStatus("Could not reach the extension.", "error");
      return;
    }
    if (!res.ok) {
      runBtn.disabled = false;
      setStatus(res.message, "error");
      return;
    }

    const parts = [];
    if (options.copy) {
      try {
        await navigator.clipboard.writeText(res.url);
        parts.push("Link copied");
      } catch (e) {
        console.error(e);
        parts.push("Could not copy the link");
      }
    }
    if (res.message) parts.push(res.message);

    runBtn.disabled = false;
    setStatus(parts.join(" · ") || "Done.", "ok");
  });
});
