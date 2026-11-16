// Spelling Pad word list, kept in Vercel Blob so every device sees the same words.
// Needs: a Blob store connected to this project (Storage tab), and a PARENT_PASSWORD
// environment variable. Anyone can read the list; only the password can change it.

const crypto = require("crypto");
const { put, get } = require("@vercel/blob");

const PATH = "spelling-pad/list.json";
const PASSWORD = process.env.PARENT_PASSWORD || "";
const MODES = process.env.BLOB_ACCESS ? [process.env.BLOB_ACCESS] : ["private", "public"];

const { BlobNotFoundError } = require("@vercel/blob");
const notFound = (e) => !!e && (e instanceof BlobNotFoundError || e.name === "BlobNotFoundError");

// The store is either private or public; try the one that worked last, then the other.
let mode = MODES[0];
async function withMode(fn) {
  const order = [mode].concat(MODES.filter((m) => m !== mode));
  let last;
  for (const m of order) {
    try { const out = await fn(m); mode = m; return out; }
    catch (e) { if (notFound(e)) { mode = m; throw e; } last = e; }
  }
  throw last;
}

async function readList() {
  // A missing file and the wrong access mode can both look like "not found", so ask both ways.
  const order = [mode].concat(MODES.filter((m) => m !== mode));
  let result = null, answered = false, last;
  for (const m of order) {
    try {
      const r = await get(PATH, { access: m, useCache: false });
      answered = true;
      if (r && r.stream) { result = r; mode = m; break; }
    } catch (e) { if (notFound(e)) answered = true; else last = e; }
  }
  if (!result) { if (answered) return { words: [] }; throw last; }
  const text = await new Response(result.stream).text();
  try { const j = JSON.parse(text); return { words: Array.isArray(j.words) ? j.words : [], updatedAt: j.updatedAt }; }
  catch { return { words: [] }; }
}

function clean(words) {
  const seen = new Set(), out = [];
  for (const x of Array.isArray(words) ? words.slice(0, 40) : []) {
    const w = String((x && x.w) || "").replace(/[^A-Za-z'\- ]/g, "").trim().slice(0, 40);
    const k = w.toLowerCase();
    if (!w || seen.has(k)) continue;
    seen.add(k);
    out.push({ w, s: String((x && x.s) || "").trim().slice(0, 160) });
  }
  return out;
}

function passwordOk(given) {
  const a = crypto.createHash("sha256").update(String(given || "")).digest();
  const b = crypto.createHash("sha256").update(PASSWORD).digest();
  return crypto.timingSafeEqual(a, b);
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "GET") {
    try {
      const list = await readList();
      return res.status(200).json({ ok: true, storage: true, password: !!PASSWORD, words: list.words, updatedAt: list.updatedAt || null });
    } catch (e) {
      return res.status(200).json({ ok: true, storage: false, password: !!PASSWORD, words: [], error: String((e && e.message) || e).slice(0, 200) });
    }
  }
  if (req.method !== "POST") return res.status(405).json({ error: "Use GET or POST" });

  const origin = req.headers.origin;
  if (origin) {
    let host = "";
    try { host = new URL(origin).host; } catch {}
    if (host !== req.headers.host) return res.status(403).json({ error: "Wrong site" });
  }
  if (!PASSWORD) return res.status(501).json({ error: "PARENT_PASSWORD is not set", code: "no_password" });

  let b = req.body || {};
  if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = {}; } }
  if (!passwordOk(b.password)) return res.status(401).json({ error: "Wrong password", code: "wrong_password" });

  const words = clean(b.words);
  const body = JSON.stringify({ words, updatedAt: new Date().toISOString() });
  try {
    await withMode((access) => put(PATH, body, { access, addRandomSuffix: false, allowOverwrite: true, contentType: "application/json", cacheControlMaxAge: 60 }));
    return res.status(200).json({ ok: true, words });
  } catch (e) {
    return res.status(502).json({ error: String((e && e.message) || e).slice(0, 200), code: "no_storage" });
  }
};
