const SUPPORTED = ["hypnotube.com/video", "redgifs.com/"];

const REASON_LABEL = {
  novideo: "No video found on this page.",
  blob: "Could not identify this video.",
  clip: "Could not copy to the clipboard.",
  unsupported: "This site is not supported.",
  f5: "Reload the page, then try again.",
};

/* ---------- Sniffing delle richieste .mp4 (per i video blob: di RedGifs) ---------- */

const KEY = (tabId) => `sniffed:${tabId}`;
let queue = Promise.resolve(); // serializza le scritture (le richieste Range arrivano a raffica)

async function remember(tabId, url) {
  const key = KEY(tabId);
  const cur = (await chrome.storage.session.get(key))[key] || [];
  const base = url.split("?")[0];
  const next = cur.filter((e) => e.url.split("?")[0] !== base);
  next.push({ url, t: Date.now() });
  await chrome.storage.session.set({ [key]: next.slice(-20) });
}

chrome.webRequest.onBeforeRequest.addListener(
  (d) => {
    if (d.tabId < 0) return;
    let u;
    try { u = new URL(d.url); } catch { return; }
    if (!u.pathname.toLowerCase().endsWith(".mp4")) return;
    queue = queue.then(() => remember(d.tabId, d.url)).catch(console.error);
  },
  { urls: ["https://*.redgifs.com/*"] }
);

chrome.tabs.onRemoved.addListener((tabId) => chrome.storage.session.remove(KEY(tabId)));

// "OpaqueCriminalCottonmouth-mobile.mp4" -> "opaquecriminalcottonmouth"
const nameOf = (url) =>
  new URL(url).pathname.split("/").pop()
    .replace(/\.mp4$/i, "")
    .replace(/-(mobile|silent)$/i, "")
    .toLowerCase();

const isHd = (url) => !/-mobile\.mp4$/i.test(new URL(url).pathname);

async function pickSniffed(tabId, ids) {
  const list = (await chrome.storage.session.get(KEY(tabId)))[KEY(tabId)] || [];
  if (!list.length) return null;

  const wanted = ids.filter(Boolean);
  const matched = wanted.length ? list.filter((e) => wanted.includes(nameOf(e.url))) : [];

  // Se conosciamo l'id del video: preferisci HD, poi il più recente.
  // Altrimenti: l'ultimo .mp4 richiesto dalla scheda.
  const pool = matched.length
    ? [...matched].sort((a, b) => Number(isHd(b.url)) - Number(isHd(a.url)) || b.t - a.t)
    : [...list].sort((a, b) => b.t - a.t);

  return pool[0].url;
}

// /watch/<id> -> id in minuscolo
function idFromTabUrl(tabUrl) {
  const m = (tabUrl || "").match(/\/watch\/([^/?#]+)/);
  return m ? m[1].toLowerCase() : null;
}

/* ---------- API RedGifs: id -> link mp4 firmato (valido per il tuo IP e user agent) ---------- */

const API = "https://api.redgifs.com/v2";

// Il token temporaneo ha limiti severi di richiesta: lo salviamo e lo riusiamo per ~20 ore
async function getToken(force = false) {
  const { rgToken } = await chrome.storage.local.get("rgToken");
  const fresh = rgToken && Date.now() - rgToken.t < 20 * 3600 * 1000;
  if (fresh && !force) return rgToken.token;
  const r = await fetch(`${API}/auth/temporary`);
  if (!r.ok) throw new Error("token " + r.status);
  const { token } = await r.json();
  await chrome.storage.local.set({ rgToken: { token, t: Date.now() } });
  return token;
}

async function fetchFromApi(id) {
  for (const force of [false, true]) {
    const token = await getToken(force);
    const r = await fetch(`${API}/gifs/${encodeURIComponent(id)}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "x-customheader": `https://www.redgifs.com/watch/${id}`,
      },
    });
    if (r.status === 401 && !force) continue; // token scaduto: ne chiediamo uno nuovo (una volta sola)
    if (!r.ok) throw new Error("gif " + r.status);
    const { gif } = await r.json();
    return (gif && gif.urls && (gif.urls.hd || gif.urls.sd)) || null;
  }
  return null;
}

/* ---------- Trova il link mp4 per una scheda ---------- */

const send = (tabId, msg) =>
  new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, msg, (res) => {
      if (chrome.runtime.lastError) resolve(null);
      else resolve(res || null);
    });
  });

// Ritorna { url } oppure { error, reason }
async function resolveLink(tab) {
  if (!tab.url || !SUPPORTED.some((s) => tab.url.includes(s))) {
    return { error: true, reason: "unsupported" };
  }

  const res = await send(tab.id, { action: "findVideoLink" });

  // Nessun content script: la pagina era già aperta prima di ricaricare l'estensione
  if (!res) return { error: true, reason: "f5" };

  // Caso semplice: URL diretto trovato nel DOM (HypnoTube)
  if (res.url) return { url: res.url };

  // Video con URL blob: -> API RedGifs, poi sniffing come piano B
  if (res.reason === "blob") {
    const id = idFromTabUrl(tab.url) || res.hint;
    let url = null;
    if (id) {
      try { url = await fetchFromApi(id); } catch (e) { console.error("API:", e); }
    }
    if (!url) url = await pickSniffed(tab.id, [id]);
    if (!url) return { error: true, reason: "blob" };
    return { url };
  }

  return { error: true, reason: res.reason || "novideo" };
}

/* ---------- Messaggi dal popup ---------- */

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action !== "run") return false;

  (async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      sendResponse({ ok: false, message: "No active tab." });
      return;
    }

    const found = await resolveLink(tab);
    if (found.error) {
      sendResponse({ ok: false, message: REASON_LABEL[found.reason] || "Something went wrong." });
      return;
    }

    const { url } = found;
    const { open, download } = request.options;
    const done = [];

    if (open) {
      chrome.tabs.create({ url, index: tab.index + 1 });
      done.push("Tab opened");
    }
    if (download) {
      try {
        await chrome.downloads.download({ url });
        done.push("Download started");
      } catch (e) {
        console.error("download:", e);
        done.push("Could not start the download");
      }
    }

    sendResponse({ ok: true, message: done.join(" · "), url });
  })();

  return true; // risposta asincrona
});
