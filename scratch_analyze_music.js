import axios from 'axios';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

async function analyzeAudio(filePath, label) {
  const audio = fs.readFileSync(filePath);
  const base64Audio = audio.toString('base64');
  const res = await axios.post(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=' + process.env.GEMINI_API_KEY,
    {
      contents: [{
        parts: [
          { text: `You are a professional music producer analyzing reference tracks for AI music generation.

Listen to this audio (${label}) and describe the BACKGROUND MUSIC ONLY (ignore voiceover/dialogue).

Provide:
1. **Genre/Style**: What genre is this? (e.g. lo-fi, cinematic, trap, ambient, etc.)
2. **Instruments**: What instruments/sounds do you hear? (synth pads, bass, drums, piano, etc.)
3. **Tempo**: Estimated BPM range
4. **Energy/Dynamics**: How does the energy change throughout? (builds up, stays steady, drops, etc.)
5. **Mood/Emotion**: What feeling does it create? (tension, confidence, urgency, warmth, etc.)
6. **Production Style**: Is it minimal or layered? Clean or gritty? Modern or traditional?
7. **Cultural Flavor**: Any Indian/Western/fusion elements?
8. **What makes it work for an ad**: Why does this music work well as ad background?
9. **Suno Style Tags**: Write the EXACT comma-separated style tags you would use to recreate this in Suno AI. Max 800 chars. Be very specific.
10. **What to AVOID**: What should the music NOT sound like?` },
          { inlineData: { mimeType: 'audio/mp3', data: base64Audio } }
        ]
      }]
    },
    { timeout: 120000 }
  );
  return res.data?.candidates?.[0]?.content?.parts?.[0]?.text || 'No response';
}

async function run() {
  console.log('=== PARAGON FEB R6.1 (Reference 1) ===\n');
  const r1 = await analyzeAudio('E:/Study/Projects/Video Agent/tmp/ref_paragon_audio.mp3', 'Paragon Feb R6.1 ad');
  console.log(r1);

  console.log('\n\n=== VIDEO-834 (Reference 2) ===\n');
  const r2 = await analyzeAudio('E:/Study/Projects/Video Agent/tmp/ref_video834_audio.mp3', 'Video-834 ad');
  console.log(r2);
}

run().catch(err => console.error(err.response?.data || err.message));
