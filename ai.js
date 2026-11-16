// Spelling Pad helper. Runs on Vercel so the Gemini key never reaches the browser.
// Set GEMINI_API_KEY in Vercel: Project > Settings > Environment Variables, then redeploy.
// Optional overrides: GEMINI_READ_MODEL, GEMINI_TTS_MODEL, GEMINI_VOICE, GEMINI_VOICE_STYLE.

const KEY = process.env.GEMINI_API_KEY || "";
const READ_MODEL = process.env.GEMINI_READ_MODEL || "gemini-3.5-flash-lite";
const TTS_MODEL = process.env.GEMINI_TTS_MODEL || "gemini-3.8-flash-tts";
const VOICE = process.env.GEMINI_VOICE || "Sulafat"; // warm. Others: Achird (friendly), Vindemiatrix (gentle), Leda (youthful)
const STYLE = process.env.GEMINI_VOICE_STYLE || "a warm, friendly teacher speaking slowly and clearly to a young child";
const BASE = "https://generativelanguage.googleapis.com/v1beta/models/";

// Voice clips are kept in the project's Blob store, so each one is recorded once for every device.
const crypto = require("crypto");
let blob = null;
try { blob = require("@vercel/blob"); } catch {}
const MODES = process.env.BLOB_ACCESS ? [process.env.BLOB_ACCESS] : ["private", "public"];
let mode = MODES[0];
const clipPath = (text) => "spelling-pad/voice/" + crypto.createHash("sha256").update([TTS_MODEL, VOICE, STYLE, text.toLowerCase()].join("|")).digest("hex").slice(0, 32) + ".wav";
async function clipLoad(path) {
  if (!blob) return null;
  for (const m of [mode].concat(MODES.filter((x) => x !== mode))) {
    try {
      const r = await blob.get(path, { access: m });
      if (r && r.stream) { mode = m; return Buffer.from(await new Response(r.stream).arrayBuffer()); }
    } catch {}
  }
  return null;
}
async function clipSave(path, buf) {
  if (!blob) return false;
  for (const m of [mode].concat(MODES.filter((x) => x !== mode))) {
    try { await blob.put(path, buf, { access: m, addRandomSuffix: false, allowOverwrite: true, contentType: "audio/wav" }); mode = m; return true; } catch {}
  }
  return false;
}

const READ_PROMPT = [
  "The image shows one word handwritten by a 5 to 7 year old child, dark ink on a white pad.",
  "Read exactly the letters that are written, in order, one at a time.",
  "Do not correct the spelling and do not guess which word the child meant: if the writing says frend, answer frend.",
  "Ignore upper and lower case. A mirrored letter that is still unmistakable counts as that letter (a backwards s is s), but b, d, p and q are different letters: report the one actually drawn.",
  'If one letter\'s shape could fairly be read as a different letter (such as a/o, u/v, n/h, i/l, e/c), put the other whole-word readings in "also", at most 4. Never add, drop or reorder letters in "also".',
  'If there are no letters at all (blank or scribble), set "blank" to true.',
  'Reply with only JSON in this shape: {"read":"frend","also":[],"blank":false}',
].join("\n");
const PHOTO_PROMPT = 'The image is a photo of a child\'s school spelling list. Reply with only a JSON array of the spelling words, lower case, in the order shown. Leave out titles, names, dates, numbers and instructions. Example: ["jump","went"]';
const SENTENCE_PROMPT = 'For each spelling word, write one short sentence (4 to 8 words) that a 6 year old understands and that uses the word exactly as written. Reply with only a JSON object mapping each word to its sentence, like {"jump":"I can jump high."}\n\nWords: ';

async function gemini(model, body) {
  const r = await fetch(BASE + encodeURIComponent(model) + ":generateContent", {
    method: "POST",
    headers: { "x-goog-api-key": KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error((j.error && j.error.message) || "Gemini request failed");
    e.status = r.status;
    const info = ((j.error && j.error.details) || []).find((d) => d && d.retryDelay);
    if (info) e.retryAfter = parseFloat(info.retryDelay) || undefined;
    throw e;
  }
  return j;
}

function parts(j) {
  const c = j && j.candidates && j.candidates[0];
  return (c && c.content && c.content.parts) || [];
}

function looseJson(text) {
  const t = String(text || "").trim();
  try { return JSON.parse(t); } catch {}
  const fence = /```(?:json)?\s*([\s\S]*?)```/.exec(t);
  if (fence) { try { return JSON.parse(fence[1]); } catch {} }
  const a = Math.min(...["{", "["].map((ch) => { const i = t.indexOf(ch); return i < 0 ? Infinity : i; }));
  const b = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
  if (a < b) { try { return JSON.parse(t.slice(a, b + 1)); } catch {} }
  return null;
}

async function askJson(prompt, image, mime) {
  const p = [{ text: prompt }];
  if (image) p.push({ inlineData: { mimeType: mime, data: image } });
  const j = await gemini(READ_MODEL, {
    contents: [{ role: "user", parts: p }],
    generationConfig: { responseMimeType: "application/json" },
  });
  const text = parts(j).filter((x) => typeof x.text === "string" && !x.thought).map((x) => x.text).join("");
  return looseJson(text);
}

function wavFromPcm(pcm, rate) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8);
  h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

async function speak(text) {
  const body = (voiceConfig, withStyle) => ({
    contents: [{ role: "user", parts: [withStyle ? { text, speech_metadata: { style: STYLE } } : { text }] }],
    generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig } },
  });
  let j;
  try {
    j = await gemini(TTS_MODEL, body({ voice: VOICE }, true));
  } catch (e) {
    if (e.status !== 400) throw e;
    // Older TTS models use the previous request shape.
    j = await gemini(TTS_MODEL, body({ prebuiltVoiceConfig: { voiceName: VOICE } }, false));
  }
  const part = parts(j).find((x) => x.inlineData && x.inlineData.data);
  if (!part) { const e = new Error("No audio came back"); e.status = 502; throw e; }
  let buf = Buffer.from(part.inlineData.data, "base64");
  if (buf.slice(0, 4).toString("latin1") !== "RIFF") {
    const m = /rate=(\d+)/.exec(part.inlineData.mimeType || "");
    buf = wavFromPcm(buf, m ? Number(m[1]) : 24000);
  }
  return buf.toString("base64");
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "GET") return res.status(200).json({ ok: true, key: !!KEY });
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  // Only answer the page served from this same site.
  const origin = req.headers.origin;
  if (origin) {
    let host = "";
    try { host = new URL(origin).host; } catch {}
    if (host !== req.headers.host) return res.status(403).json({ error: "Wrong site" });
  }
  if (!KEY) return res.status(501).json({ error: "GEMINI_API_KEY is not set" });

  let b = req.body || {};
  if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = {}; } }
  const image = typeof b.image === "string" ? b.image : "";
  if (image.length > 3500000) return res.status(413).json({ error: "Image too large" });

  try {
    if (b.task === "read") {
      if (!image) return res.status(400).json({ error: "No image" });
      const r = (await askJson(READ_PROMPT, image, "image/png")) || {};
      return res.status(200).json({
        read: String(r.read || "").slice(0, 60),
        also: Array.isArray(r.also) ? r.also.slice(0, 4).map((x) => String(x).slice(0, 60)) : [],
        blank: r.blank === true,
      });
    }
    if (b.task === "speak") {
      const text = String(b.text || "").trim().slice(0, 200);
      if (!text) return res.status(400).json({ error: "No text" });
      const path = clipPath(text);
      const kept = await clipLoad(path);
      if (kept) return res.status(200).json({ audio: kept.toString("base64"), stored: true, fresh: false });
      const audio = await speak(text);
      const stored = await clipSave(path, Buffer.from(audio, "base64"));
      return res.status(200).json({ audio, stored, fresh: true });
    }
    if (b.task === "photo") {
      if (!image) return res.status(400).json({ error: "No image" });
      const r = await askJson(PHOTO_PROMPT, image, "image/jpeg");
      return res.status(200).json({ words: Array.isArray(r) ? r.slice(0, 40).map((x) => String(x).slice(0, 40)) : [] });
    }
    if (b.task === "sentences") {
      const words = Array.isArray(b.words) ? b.words.slice(0, 40).map((x) => String(x).slice(0, 40)) : [];
      if (!words.length) return res.status(400).json({ error: "No words" });
      const r = await askJson(SENTENCE_PROMPT + JSON.stringify(words));
      return res.status(200).json({ sentences: r && typeof r === "object" && !Array.isArray(r) ? r : {} });
    }
    return res.status(400).json({ error: "Unknown task" });
  } catch (e) {
    const status = e.status === 429 ? 429 : 502;
    return res.status(status).json({ error: e.message || "Request failed", retryAfter: e.retryAfter });
  }
};
