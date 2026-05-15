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

Analyze the Gujarati voiceover and provide:

1. **Transcription**: Write the EXACT Gujarati words spoken (in Gujarati script AND romanized)
2. **Pronunciation Issues**: List every word that is mispronounced. For each:
   - What was said (wrong pronunciation)
   - What it should sound like (correct Gujarati pronunciation)
   - Severity: minor/major/critical
3. **Accent/Tone**: Does it sound like a native Gujarati speaker? Or does it sound Hindi-influenced, English-accented, or robotic?
4. **Fluency**: Is the speech natural and flowing? Or does it sound choppy, hesitant, or artificially paced?
5. **Script Issues**: Are there any Hindi words mixed in that should be Gujarati? Any English words that don't belong?
6. **Overall Score**: Rate the naturalness out of 10 (10 = native Gujarati speaker, 1 = completely wrong language)
7. **Root Cause**: What do you think is causing the issues? (e.g., romanization errors, wrong language model, phonetic mapping problems, etc.)
8. **Specific Fixes**: What exact changes would fix the pronunciation?` },
          { inlineData: { mimeType: 'audio/mp3', data: base64Audio } }
        ]
      }]
    },
    { timeout: 120000 }
  );
  return res.data?.candidates?.[0]?.content?.parts?.[0]?.text || 'No response';
}

async function run() {
  console.log('=== VIDEO 1 (9464cb59) ===\n');
  const r1 = await analyzeVoiceover('E:/Study/Projects/Video Agent/tmp/gu_vo_1.mp3', 'Video 1 - Gujarati ad');
  console.log(r1);

  console.log('\n\n=== VIDEO 2 (f2d51f76) ===\n');
  const r2 = await analyzeVoiceover('E:/Study/Projects/Video Agent/tmp/gu_vo_2.mp3', 'Video 2 - Gujarati ad');
  console.log(r2);

  console.log('\n\n=== VIDEO 3 (977271ee) ===\n');
  const r3 = await analyzeVoiceover('E:/Study/Projects/Video Agent/tmp/gu_vo_3.mp3', 'Video 3 - Gujarati ad');
  console.log(r3);
}

run().catch(err => console.error(err.response?.data || err.message));
