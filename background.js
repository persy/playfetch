const SUPPORTED = ["hypnotube.com/video", "redgifs.com/"];

/* ---------- Feedback sull'icona (badge) ---------- */

function flash(tabId, text, color) {
  chrome.action.setBadgeBackgroundColor({ color, tabId });
  chrome.action.setBadgeText({ text, tabId });
  setTimeout(() => chrome.action.setBadgeText({ text: "", tabId }), 3000);
}

const REASONS = {
  novideo: "NOV", // nessun <video> nella pagina
  clip: "CLIP",   // copia negli appunti fallita
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

/* ---------- Click sull'icona ---------- */

const send = (tabId, msg) =>
  new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, msg, (res) => {
      if (chrome.runtime.lastError) resolve(null);
      else resolve(res || null);
    });
  });

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.url || !SUPPORTED.some((s) => tab.url.includes(s))) {
    flash(tab.id, "N/A", "#888888");
    return;
  }

  const res = await send(tab.id, { action: "copyVideoLink" });

  // Nessun content script: la pagina era già aperta prima di ricaricare l'estensione
  if (!res) {
    flash(tab.id, "F5", "#d9822b");
    return;
  }

  // Caso semplice: URL diretto trovato nel DOM (HypnoTube)
  if (res.success) {
    console.log("✅ Direct link copied:", res.url);
    flash(tab.id, "OK", "#2e9e5b");
    chrome.tabs.create({ url: res.url, index: tab.index + 1 });
    return;
  }

  // Video con URL blob: -> usa gli .mp4 intercettati dalla rete
  if (res.reason === "blob") {
    const id = idFromTabUrl(tab.url) || res.hint;
    let url = null;
    if (id) {
      try { url = await fetchFromApi(id); } catch (e) { console.error("API:", e); }
    }
    if (!url) url = await pickSniffed(tab.id, [id]);
    if (!url) {
      console.error("❌ Nessun .mp4 intercettato per questa scheda");
      flash(tab.id, id ? "API" : "NOID", "#c0392b");
      return;
    }
    const copied = await send(tab.id, { action: "copyText", text: url });
    console.log("✅ Sniffed link:", url);
    flash(tab.id, copied && copied.success ? "OK" : "CLIP", copied && copied.success ? "#2e9e5b" : "#d9822b");
    chrome.tabs.create({ url, index: tab.index + 1 });
    return;
  }

  console.error("❌ Failed to get video link:", res.reason);
  flash(tab.id, REASONS[res.reason] || "ERR", "#c0392b");
});
