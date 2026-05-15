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
          { text: `Listen to this audio clip (${label}). Transcribe EXACTLY what is spoken. Then evaluate:\n1. Does it sound like natural Hindi speech or robotic AI?\n2. Are any Hindi words mispronounced with English accent?\n3. Are any English words (like scooter, uncle, tension) mangled into weird phonetics?\n4. Rate naturalness 1-10 and explain.` },
          { inlineData: { mimeType: 'audio/mp3', data: base64Audio } }
        ]
      }]
    },
    { timeout: 60000 }
  );
  return res.data?.candidates?.[0]?.content?.parts?.[0]?.text || 'No response';
}

async function run() {
  const tmpDir = 'E:/Study/Projects/Video Agent/tmp/video_958dab55-b043-4a98-917b-ff1f9b43966a';

  // Analyze full voiceover
  console.log('=== FULL VOICEOVER ===');
  const full = await analyzeAudio(`${tmpDir}/voiceover.mp3`, 'full combined voiceover');
  console.log(full);

  // Analyze scene 1 raw (before normalization)
  console.log('\n=== SCENE 1 RAW ===');
  const s1 = await analyzeAudio(`${tmpDir}/scene_1_vo_raw.mp3`, 'scene 1 raw voiceover');
  console.log(s1);
}

run().catch(err => console.error(err.response?.data || err.message));
