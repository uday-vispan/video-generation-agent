import axios from 'axios';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

async function analyzeVoiceover(filePath, label) {
  const audio = fs.readFileSync(filePath);
  const base64Audio = audio.toString('base64');
  const res = await axios.post(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=' + process.env.GEMINI_API_KEY,
    {
      contents: [{
        parts: [
          { text: `You are a native Gujarati speaker and professional voiceover critic.

Listen carefully to the VOICEOVER in this audio (${label}). Ignore background music.

Provide a CONCISE analysis:

1. **Language Used**: Is this actually Gujarati? Or is it Hindi/Hinglish with Gujarati words mixed in?
2. **Transcription** (first 3-4 sentences in Gujarati script)
3. **Top 5 Pronunciation Errors**: What was said vs what it should be, with severity
4. **Grammar Issues**: Any Hindi grammar patterns used instead of Gujarati?
5. **Overall Score**: Rate naturalness 1-10 (10 = native speaker)
6. **What went wrong**: Brief root cause diagnosis` },
          { inlineData: { mimeType: 'audio/mp3', data: base64Audio } }
        ]
      }]
    },
    { timeout: 120000 }
  );
  return res.data?.candidates?.[0]?.content?.parts?.[0]?.text || 'No response';
}

async function run() {
  console.log('=== LATEST VIDEO (8a1b9429) - Gujarati Voiceover Analysis ===\n');
  const r = await analyzeVoiceover('E:/Study/Projects/Video Agent/tmp/gu_vo_latest.mp3', 'Latest Gujarati ad');
  console.log(r);
}

run().catch(err => console.error(err.response?.data || err.message));
