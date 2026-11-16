Spelling Pad for Vercel

Files
  index.html     the site
  api/ai.js      talks to Gemini (handwriting check and natural voice)
  api/words.js   saves the word list so every device sees it
  package.json   tells Vercel to install the storage library

Deploy
  1. Put this folder in a GitHub repo and import it at vercel.com. No build settings are needed.
  2. Storage: in the Vercel project, open the Storage tab > Create Database > Blob.
     Choose Private when asked. It connects to the project by itself.
  3. In Project > Settings > Environment Variables add:
       GEMINI_API_KEY    your key from https://aistudio.google.com/apikey
       PARENT_PASSWORD   any password you choose; needed to change the words
  4. Redeploy so the storage and variables take effect.

Check it worked
  Open the site, tap Grown-ups, and read "Setup status" at the bottom.
  All three lines should say on / ready.

Changing the words
  Grown-ups > edit the list > type the parent password > Save list.
  The password is remembered on that device after the first save.
  Other devices pick up the new list the next time the site is opened.

Natural voice
  After saving a new list, keep the site open on that device until Setup status says
  the natural voice is ready. Clips are stored on the site, so every other device
  then loads them in seconds.

Optional environment variables
  GEMINI_VOICE         default Sulafat (warm). Try Achird, Vindemiatrix or Leda.
  GEMINI_VOICE_STYLE   default "a warm, friendly teacher speaking slowly and clearly to a young child"
  GEMINI_READ_MODEL    default gemini-3.5-flash-lite
  GEMINI_TTS_MODEL     default gemini-3.8-flash-tts
