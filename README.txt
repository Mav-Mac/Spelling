Spelling Pad for Vercel

Files
  index.html   the site
  api/ai.js    small helper that talks to Gemini (keeps your key private)

Deploy
  1. Get a Gemini API key at https://aistudio.google.com/apikey
  2. Put this folder in a GitHub repo and import it at vercel.com (or run "vercel" inside the folder).
     No build settings are needed.
  3. In Vercel: Project > Settings > Environment Variables, add GEMINI_API_KEY with your key.
  4. Redeploy so the key takes effect.

Check it worked
  Open the site, tap Grown-ups, and read "Setup status" at the bottom.

Optional environment variables
  GEMINI_VOICE         default Sulafat (warm). Try Achird, Vindemiatrix or Leda.
  GEMINI_VOICE_STYLE   default "a warm, friendly teacher speaking slowly and clearly to a young child"
  GEMINI_READ_MODEL    default gemini-3.5-flash-lite
  GEMINI_TTS_MODEL     default gemini-3.8-flash-tts
  After changing the voice, clear the site's data on the tablet so the words are recorded again.
