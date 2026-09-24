const HYPNOTUBE_SELECTOR =
  'body > section:nth-child(2) > section:nth-child(3) > div > div:nth-child(2) > div > div > main > div > div:nth-child(1) > div > div > div:nth-child(1) > div:nth-child(2) > video > source';

// Primo URL non-blob tra currentSrc, src e <source> di un <video>
function urlFromVideo(v) {
  const candidates = [
    v.currentSrc,
    v.src,
    ...[...v.querySelectorAll("source")].map((s) => s.src),
  ];
  return candidates.find((u) => u && !u.startsWith("blob:")) || null;
}

// Area del video effettivamente visibile nel viewport
function visibleArea(el) {
  const r = el.getBoundingClientRect();
  const w = Math.max(0, Math.min(r.right, window.innerWidth) - Math.max(r.left, 0));
  const h = Math.max(0, Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0));
  return w * h;
}

// Estrae l'id RedGifs (minuscolo) da un link /watch/<id> o da un URL media/poster
// tipo https://media.redgifs.com/NomeCamelCase-poster.jpg
function idFromString(s) {
  if (!s) return null;
  let m = s.match(/\/watch\/([^/?#]+)/);
  if (m) return m[1].toLowerCase();
  m = s.match(/redgifs\.com\/([A-Za-z]{6,})(?:-[A-Za-z0-9]+)?\.(?:jpg|jpeg|png|webp|gif|mp4|m3u8|ts|m4s)/i);
  return m ? m[1].toLowerCase() : null;
}

// Cerca l'id del video nel feed: poster del <video>, poi link/immagini nel contenitore
// del singolo video (ci si ferma appena l'antenato contiene più di un <video>).
function idNear(video) {
  let id = idFromString(video.poster) || idFromString(video.currentSrc);
  if (id) return id;

  let n = video.parentElement;
  for (let i = 0; n && n !== document.body && i < 10; i++, n = n.parentElement) {
    if (n.querySelectorAll("video").length > 1) break;
    const els = n.querySelectorAll(
      'a[href*="/watch/"], img[src*="redgifs"], [poster*="redgifs"], source[src*="redgifs"]'
    );
    for (const el of els) {
      id = idFromString(el.getAttribute("href") || el.getAttribute("src") || el.getAttribute("poster"));
      if (id) return id;
    }
  }
  return null;
}

// Diagnostica: attributi del video e degli antenati, per capire dove sta l'id
function dumpChain(video) {
  const short = (el) =>
    [...el.attributes].map((a) => `${a.name}=${a.value.slice(0, 80)}`).join(" | ");
  const chain = [`VIDEO: ${short(video)}`];
  let n = video.parentElement;
  for (let i = 0; n && n !== document.body && i < 6; i++, n = n.parentElement) {
    chain.push(`${i} <${n.tagName.toLowerCase()}> ${short(n)}`);
  }
  console.log("[playfetch] nessun id trovato. Video + antenati:\n" + chain.join("\n"));
}

// Feed stile TikTok (RedGifs): considera il video più visibile, a parità quello in riproduzione
function findGeneric() {
  const vids = [...document.querySelectorAll("video")];
  console.log(
    "[playfetch] video trovati:",
    vids.map((v) => ({
      currentSrc: v.currentSrc,
      src: v.src,
      poster: v.poster,
      sources: [...v.querySelectorAll("source")].map((s) => s.src),
      paused: v.paused,
    }))
  );

  if (!vids.length) return { reason: "novideo" };

  const best = vids
    .map((v) => ({ v, url: urlFromVideo(v), area: visibleArea(v), playing: !v.paused }))
    .sort((a, b) => b.area - a.area || Number(b.playing) - Number(a.playing))[0];

  if (best.url) return { url: best.url };

  const hint = idNear(best.v);
  console.log("[playfetch] id trovato nel feed:", hint);
  if (!hint) dumpChain(best.v);
  return { reason: "blob", hint };
}

function findHypnotube() {
  const s =
    document.querySelector(HYPNOTUBE_SELECTOR) ||
    document.querySelector('video source[type="video/mp4"]');
  return s && s.src ? { url: s.src } : null;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "copyVideoLink") {
    try {
      const isHypnotube = location.hostname.endsWith("hypnotube.com");
      const found = (isHypnotube && findHypnotube()) || findGeneric();

      if (!found.url) {
        sendResponse({ success: false, reason: found.reason, hint: found.hint });
        return true;
      }

      navigator.clipboard
        .writeText(found.url)
        .then(() => sendResponse({ success: true, url: found.url }))
        .catch(() => sendResponse({ success: false, reason: "clip" }));
    } catch (e) {
      console.error(e);
      sendResponse({ success: false, reason: "err" });
    }
  } else if (request.action === "copyText") {
    navigator.clipboard
      .writeText(request.text)
      .then(() => sendResponse({ success: true }))
      .catch(() => sendResponse({ success: false }));
  }
  return true;
});
