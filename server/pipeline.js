import fs from 'fs'
import fsp from 'fs/promises'
import path from 'path'
import { File } from 'node:buffer'
import axios from 'axios'
import ffmpeg from 'fluent-ffmpeg'
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg'
import ffprobeInstaller from '@ffprobe-installer/ffprobe'
ffmpeg.setFfmpegPath(ffmpegInstaller.path)
ffmpeg.setFfprobePath(ffprobeInstaller.path)
import { fal } from '@fal-ai/client'
import { setStep, setStepProgress, failJob, completeJob, updateJob, getJob, addJobWarning, storeJobPipelineContext } from './jobs.js'

// Configure fal.ai client
const FAL_API_KEY = () => process.env.FAL_API_KEY || process.env.FAL_KEY
const FAL_KEY = FAL_API_KEY
fal.config({ credentials: () => FAL_API_KEY() })

const OPENAI_API_KEY = () => process.env.OPENAI_API_KEY
const OPENAI_MODEL = () => process.env.OPENAI_MODEL || 'gpt-5.5'
const GEMINI_API_KEY = () => process.env.GEMINI_API_KEY
const GEMINI_IMAGE_MODEL = () => process.env.GEMINI_IMAGE_MODEL || 'gemini-3-pro-image-preview'
const ELEVENLABS_API_KEY = () => process.env.ELEVENLABS_API_KEY
// ─── ElevenLabs Voice IDs ─────────────────────────────────────────────────
// Indian voices: selected by narrator_gender for Hindi and Gujarati.
const ELEVENLABS_HINDI_FEMALE_VOICE_ID = process.env.ELEVENLABS_HINDI_FEMALE_VOICE_ID || process.env.ELEVENLABS_FEMALE_VOICE_ID || 'Ms9OTvWb99V6DwRHZn6q'
const ELEVENLABS_HINDI_MALE_VOICE_ID = process.env.ELEVENLABS_HINDI_MALE_VOICE_ID || process.env.ELEVENLABS_MALE_VOICE_ID || 'SGbOfpm28edC83pZ9iGb'
// Non-Hindi/non-Gujarati fallback voices
const ELEVENLABS_FEMALE_VOICE_ID   = process.env.ELEVENLABS_FEMALE_VOICE_ID  || ELEVENLABS_HINDI_FEMALE_VOICE_ID
const ELEVENLABS_MALE_VOICE_ID     = process.env.ELEVENLABS_MALE_VOICE_ID    || ELEVENLABS_HINDI_MALE_VOICE_ID
const FALLBACK_MUSIC_DIR = () => process.env.FALLBACK_MUSIC_DIR || './assets/music/'
const BRAND_NAME = () => process.env.BRAND_NAME || ''
const BRAND_TAGLINE = () => process.env.BRAND_TAGLINE || ''
const BRAND_COLOR = () => process.env.BRAND_COLOR || 'ffffff'

const ELEVENLABS_VOICE_ID = (languageCode, gender) => {
  if (languageCode === 'hi' || languageCode === 'gu') {
    return String(gender || '').toLowerCase().startsWith('f')
      ? ELEVENLABS_HINDI_FEMALE_VOICE_ID
      : ELEVENLABS_HINDI_MALE_VOICE_ID
  }
  // All other languages: route by narrator gender detected from script
  return String(gender || '').toLowerCase().startsWith('f')
    ? ELEVENLABS_FEMALE_VOICE_ID
    : ELEVENLABS_MALE_VOICE_ID
}
const SUNO_API_KEY = () => process.env.SUNO_API_KEY

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent'
const GEMINI_IMAGE_URL = () => `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL()}:generateContent`
const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses'
const SUNO_BASE_URL = 'https://api.sunoapi.org'
const PIXVERSE_V6_RUN_URL = 'https://fal.run/fal-ai/pixverse/v6/image-to-video'
const PIXVERSE_V6_QUEUE_URL = 'https://queue.fal.run/fal-ai/pixverse/v6/image-to-video'
const UNIFIED_GRADE = 'eq=brightness=0.03:saturation=1.10:contrast=1.03'
const OPENAI_MODEL_FALLBACKS = [
  'gpt-5.5',
  'gpt-5.4',
  'gpt-4o',
  'gpt-4.1',
  'gpt-5.4-mini',
  'gpt-4.1-mini',
  'gpt-4o-mini',
]

const VIDEO_SIZE_BY_ASPECT = {
  '9:16': { w: 1080, h: 1920, label: 'vertical 9:16' },
  '16:9': { w: 1920, h: 1080, label: 'horizontal 16:9' },
  '1:1': { w: 1080, h: 1080, label: 'square 1:1' },
}

const MAX_TOTAL_DURATION_SECONDS = 120
const VIDEO_CLIP_DURATION_SECONDS = 4
const MIN_SCENE_DURATION_SECONDS = 2
const MAX_SCENE_DURATION_SECONDS = 10
const SUPPORTED_ASPECT_RATIOS = new Set(['9:16', '16:9', '1:1'])
const MIN_SCENE_COUNT = 4
const MAX_SCENE_COUNT = 8
const PROMPT_CONCURRENCY = 3
const IMAGE_CONCURRENCY = 2
const VIDEO_CONCURRENCY = 2
const DEFAULT_PRODUCT_IDENTITY = 'the exact uploaded product with unchanged shape, color, materials, proportions, visible markings, and packaging details'
const DEFAULT_VISUAL_IDENTITY = 'preserve every visible person, clothing item, color, background, prop, product detail, and environment detail from the reference photos without changing their nature'
const FAL_PROMPT_MAX_CHARS = 1900
const TEXT_MODEL_IMAGE_MAX_BYTES = 3.5 * 1024 * 1024
const TEXT_MODEL_IMAGE_MAX_DIMENSION = 1024

const SCRIPT_LANGUAGE_HINTS = [
  { code: 'hi', name: 'Hindi', script: 'Devanagari', pattern: /[\u0900-\u097F]/g },
  { code: 'ar', name: 'Arabic', script: 'Arabic', pattern: /[\u0600-\u06FF]/g },
  { code: 'bn', name: 'Bengali', script: 'Bengali', pattern: /[\u0980-\u09FF]/g },
  { code: 'gu', name: 'Gujarati', script: 'Gujarati', pattern: /[\u0A80-\u0AFF]/g },
  { code: 'pa', name: 'Punjabi', script: 'Gurmukhi', pattern: /[\u0A00-\u0A7F]/g },
  { code: 'ta', name: 'Tamil', script: 'Tamil', pattern: /[\u0B80-\u0BFF]/g },
  { code: 'te', name: 'Telugu', script: 'Telugu', pattern: /[\u0C00-\u0C7F]/g },
  { code: 'kn', name: 'Kannada', script: 'Kannada', pattern: /[\u0C80-\u0CFF]/g },
  { code: 'ml', name: 'Malayalam', script: 'Malayalam', pattern: /[\u0D00-\u0D7F]/g },
  { code: 'th', name: 'Thai', script: 'Thai', pattern: /[\u0E00-\u0E7F]/g },
  { code: 'zh', name: 'Chinese', script: 'Han', pattern: /[\u4E00-\u9FFF]/g },
  { code: 'ja', name: 'Japanese', script: 'Japanese', pattern: /[\u3040-\u30FF]/g },
  { code: 'ko', name: 'Korean', script: 'Hangul', pattern: /[\uAC00-\uD7AF]/g },
]

const LANGUAGE_NAME_TO_CODE = {
  english: 'en',
  hindi: 'hi',
  urdu: 'ur',
  arabic: 'ar',
  bengali: 'bn',
  gujarati: 'gu',
  punjabi: 'pa',
  tamil: 'ta',
  telugu: 'te',
  kannada: 'kn',
  malayalam: 'ml',
  marathi: 'mr',
  nepali: 'ne',
  spanish: 'es',
  french: 'fr',
  german: 'de',
  italian: 'it',
  portuguese: 'pt',
  russian: 'ru',
  japanese: 'ja',
  chinese: 'zh',
  korean: 'ko',
}

const LANGUAGE_CODE_INFO = {
  en: { code: 'en', name: 'English', script: 'Latin' },
  hi: { code: 'hi', name: 'Hindi', script: 'Devanagari' },
  mr: { code: 'mr', name: 'Marathi', script: 'Devanagari' },
  ne: { code: 'ne', name: 'Nepali', script: 'Devanagari' },
  ur: { code: 'ur', name: 'Urdu', script: 'Arabic' },
  ar: { code: 'ar', name: 'Arabic', script: 'Arabic' },
  bn: { code: 'bn', name: 'Bengali', script: 'Bengali' },
  gu: { code: 'gu', name: 'Gujarati', script: 'Gujarati' },
  pa: { code: 'pa', name: 'Punjabi', script: 'Gurmukhi' },
  ta: { code: 'ta', name: 'Tamil', script: 'Tamil' },
  te: { code: 'te', name: 'Telugu', script: 'Telugu' },
  kn: { code: 'kn', name: 'Kannada', script: 'Kannada' },
  ml: { code: 'ml', name: 'Malayalam', script: 'Malayalam' },
  es: { code: 'es', name: 'Spanish', script: 'Latin' },
  fr: { code: 'fr', name: 'French', script: 'Latin' },
  de: { code: 'de', name: 'German', script: 'Latin' },
  it: { code: 'it', name: 'Italian', script: 'Latin' },
  pt: { code: 'pt', name: 'Portuguese', script: 'Latin' },
  ru: { code: 'ru', name: 'Russian', script: 'Cyrillic' },
  ja: { code: 'ja', name: 'Japanese', script: 'Japanese' },
  zh: { code: 'zh', name: 'Chinese', script: 'Han' },
  ko: { code: 'ko', name: 'Korean', script: 'Hangul' },
}

const ROMANIZED_HINDI_HINTS = new Set([
  // common pronouns / articles
  'yeh', 'woh', 'ye', 'wo', 'kya', 'kaun', 'kab', 'kahan', 'kaise', 'kitna', 'kitni', 'kitne',
  'main', 'mein', 'hum', 'tum', 'aap', 'uska', 'uski', 'uske', 'unka', 'unki', 'unke',
  'mera', 'mere', 'meri', 'hamara', 'hamari', 'hamare', 'tumhara', 'tumhari', 'tumhare',
  'apna', 'apne', 'apni', 'khud', 'isko', 'usko', 'inhe', 'unhe', 'sabko', 'kisi', 'kisine',
  // verbs / verb forms
  'hai', 'hain', 'tha', 'the', 'thi', 'hota', 'hoti', 'hote', 'hua', 'hui', 'hue',
  'karta', 'karte', 'karti', 'karna', 'karo', 'kiya', 'kiye', 'kar', 'karke', 'karein',
  'diya', 'diye', 'dena', 'dete', 'deti', 'deta', 'de', 'dedo', 'dedo',
  'gaya', 'gaye', 'gayi', 'jana', 'jata', 'jate', 'jati', 'jaate', 'jaao', 'jao',
  'aaya', 'aaye', 'aayi', 'aana', 'aata', 'aate', 'aati', 'aa', 'aao',
  'liya', 'liye', 'lena', 'leta', 'lete', 'leti', 'lo', 'lelo',
  'raha', 'rahe', 'rahi', 'rahega', 'rahegi', 'rehta', 'rehti', 'rehte',
  'hoga', 'hogi', 'honge', 'sakta', 'sakti', 'sakte', 'chahiye', 'chahte',
  'lagta', 'lagti', 'lagte', 'laga', 'lagi', 'lage', 'lagana',
  'dekho', 'dekha', 'dekhi', 'dekhna', 'dekhte', 'dekhti', 'dekha',
  'bola', 'boli', 'bolna', 'bolo', 'bolte', 'bolti',
  'milta', 'milti', 'milte', 'mila', 'mili', 'mile', 'milega', 'milegi',
  'chalta', 'chalti', 'chalte', 'chalo', 'chale', 'chali',
  'rakhna', 'rakho', 'rakh', 'rakhte', 'rakhti',
  'samajh', 'samjho', 'samajhna', 'samjhe',
  'pata', 'patah', 'puchho', 'puchha', 'pucho',
  'sochna', 'socho', 'socha', 'sochi',
  'baith', 'baitho', 'baitha', 'baithi',
  'uthna', 'utho', 'utha', 'uthi',
  // conjunctions / postpositions
  'aur', 'ya', 'par', 'pe', 'magar', 'lekin', 'kyunki', 'kyun', 'kyu', 'isliye', 'islye',
  'se', 'ka', 'ke', 'ki', 'ko', 'ne', 'mein', 'tak', 'bhi', 'hi', 'toh', 'to',
  'phir', 'fir', 'jab', 'tab', 'abhi', 'ab', 'agar', 'warna', 'nahi', 'nahin', 'na', 'mat',
  // adjectives / adverbs
  'acha', 'accha', 'achha', 'bura', 'bada', 'bade', 'badi', 'chhota', 'chhoti', 'chhote',
  'naya', 'naye', 'nayi', 'purana', 'purani', 'purane',
  'bahut', 'bohot', 'zyada', 'kam', 'thoda', 'thodi', 'thode',
  'bilkul', 'ekdum', 'sach', 'sachchi', 'asli', 'pakka',
  'pehle', 'baad', 'saath', 'sab', 'sabse', 'dusra', 'dusri', 'dusre',
  // nouns / common words
  'din', 'raat', 'subah', 'sham', 'ghar', 'gaadi', 'paisa', 'paise', 'kaam', 'log',
  'bachcha', 'bacche', 'ladka', 'ladki', 'aadmi', 'aurat', 'dost',
  'wale', 'wali', 'wala', 'waale', 'waali', 'waala',
  'roz', 'hamesha', 'kabhi', 'nazar', 'samne', 'andar', 'bahar',
  'scooty', 'scooter', 'gaadi', 'bike',
  // expressions
  'arrey', 'arre', 'chalo', 'bas', 'theek', 'thik', 'sahi', 'galat', 'zaroor', 'zaruri',
  'fikar', 'fikr', 'tension', 'problem', 'solution', 'pareshaan', 'pareshani',
  'khush', 'khushi', 'dukh', 'dukhi',
])

const ROMANIZED_GUJARATI_HINTS = new Set([
  // pronouns
  'hu', 'ame', 'tame', 'te', 'ena', 'eni', 'tamara', 'tamari', 'amara',
  // verbs
  'chhe', 'che', 'nathi', 'hato', 'hati', 'hata', 'thai', 'thay', 'karvu', 'karo',
  'karta', 'kari', 'kariye', 'jovu', 'jao', 'juo', 'levo', 'lo', 'aave', 'aavu',
  'joie', 'joiye', 'rehvo', 'maltu', 'malti', 'male', 'lidhu', 'lidha', 'lidhi',
  // conjunctions / postpositions
  'ane', 'ke', 'pan', 'kem', 'kyare', 'koi', 'mate', 'maate', 'ma', 'maa',
  'no', 'ni', 'nu', 'tyare', 'jyare', 'badha', 'badhu',
  // adjectives
  'saaru', 'saru', 'navu', 'junu', 'motu', 'nanu', 'monghu', 'monghi', 'sasto', 'sastu',
  'khub', 'ghanu', 'thodu', 'thodi',
  // nouns / expressions
  'parivar', 'parivaar', 'suraksha', 'surakshit', 'saheb', 'saab', 'seth', 'sheth',
  'lakh', 'hazar', 'arre', 'bus', 'haa', 'avo', 'aavo',
])


function compactText(value, maxChars = 300) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  if (text.length <= maxChars) return text
  const sliced = text.slice(0, Math.max(0, maxChars - 1)).trim()
  const lastSentence = Math.max(sliced.lastIndexOf('.'), sliced.lastIndexOf(';'), sliced.lastIndexOf(','))
  return `${(lastSentence > maxChars * 0.55 ? sliced.slice(0, lastSentence) : sliced).trim()}…`
}

function limitText(value, maxChars) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  if (text.length <= maxChars) return text
  return `${text.slice(0, Math.max(0, maxChars - 1)).trim()}…`
}

function countMatches(text, pattern) {
  return (text.match(pattern) || []).length
}

function detectScriptLanguage(script = '') {
  const text = String(script || '')
  const latinCount = countMatches(text, /[A-Za-z]/g)
  const candidates = SCRIPT_LANGUAGE_HINTS
    .map(lang => ({ ...lang, count: countMatches(text, lang.pattern) }))
    .filter(lang => lang.count > 0)
    .sort((a, b) => b.count - a.count)

  if (candidates.length > 0 && candidates[0].count >= Math.max(3, latinCount * 0.35)) {
    return candidates[0]
  }

  const latinWords = text
    .toLowerCase()
    .match(/[a-z]+/g) || []
  const romanizedHindiHits = latinWords.filter(word => ROMANIZED_HINDI_HINTS.has(word)).length
  const hasIndianRomanMarkers = /\b(kyun|kyunki|nahi|nahin|mein|main|hai|hain|hota|hoti|karte|karta|apne|apni|mere|mera|wale|wali|wala|se|ki|ka|ke|ko|toh|bhi|aur|par|lekin|phir|agar|dekho|chalo|acha|accha|bahut|bohot|kya|kaun|kab|kaise|hoga|hogi|sakta|sakti|chahiye|milta|milega|raha|rahi|gaadi|scooty|ghar|paisa|paise|dost|arrey|arre|theek|thik|sahi|zaroor|zaruri|fikar|fikr|pareshaan)\b/i.test(text)

  if (
    latinWords.length >= 3 &&
    (romanizedHindiHits >= 2 || hasIndianRomanMarkers) &&
    (romanizedHindiHits / latinWords.length >= 0.08 || hasIndianRomanMarkers)
  ) {
    return { code: 'hi', name: 'Hindi', script: 'Devanagari', sourceScript: 'Latin', romanized: true }
  }

  // Check for romanized Gujarati
  const romanizedGujaratiHits = latinWords.filter(word => ROMANIZED_GUJARATI_HINTS.has(word)).length
  const hasGujaratiRomanMarkers = /\b(chhe|che|nathi|joie|joiye|kem|tame|tamara|tamari|ane|maate|mate|monghu|sasto|sastu|saheb|seth|sheth|parivar|parivaar|suraksha|surakshit|jyare|tyare|kyare|thodu|thodi|lidhu|lidha)\b/i.test(text)

  if (
    latinWords.length >= 2 &&
    (romanizedGujaratiHits >= 1 || hasGujaratiRomanMarkers)
  ) {
    return { code: 'gu', name: 'Gujarati', script: 'Gujarati', sourceScript: 'Latin', romanized: true }
  }

  return { code: 'en', name: 'English', script: 'Latin' }
}

function normalizeLanguageInfo(modelLanguage, script = '') {
  const scriptDetected = detectScriptLanguage(script)
  const raw = String(modelLanguage || '').trim().toLowerCase()
  const firstToken = raw.split(/[-_\s]/)[0]
  const mappedCode = LANGUAGE_NAME_TO_CODE[raw] || LANGUAGE_NAME_TO_CODE[firstToken]
  const code = mappedCode || firstToken

  if (scriptDetected.code !== 'en') {
    if (scriptDetected.romanized) return scriptDetected
    const modelInfo = LANGUAGE_CODE_INFO[code]
    if (modelInfo && modelInfo.script === scriptDetected.script) return modelInfo
    return scriptDetected
  }
  if (code && /^[a-z]{2,3}$/.test(code)) {
    const known = LANGUAGE_CODE_INFO[code] || SCRIPT_LANGUAGE_HINTS.find(lang => lang.code === code)
    return known || { code, name: code, script: 'Latin' }
  }

  return scriptDetected
}

function isEnglishLanguage(language) {
  const code = typeof language === 'string' ? language : language?.code
  return /^en\b/i.test(String(code || ''))
}

function isHindiLanguage(language) {
  const code = typeof language === 'string' ? language : language?.code
  return /^hi\b/i.test(String(code || ''))
}

function isGujaratiLanguage(language) {
  const code = typeof language === 'string' ? language : language?.code
  return /^gu\b/i.test(String(code || ''))
}

function isIndianLanguage(language) {
  const code = typeof language === 'string' ? language : language?.code
  return /^(hi|gu|mr|bn|ta|te|kn|ml|pa|ne|ur)\b/i.test(String(code || ''))
}

function hasDevanagari(text) {
  return /[\u0900-\u097F]/.test(String(text || ''))
}

function hasGujaratiScript(text) {
  return /[\u0A80-\u0AFF]/.test(String(text || ''))
}

function hasNativeScript(text, languageInfo) {
  const code = typeof languageInfo === 'string' ? languageInfo : languageInfo?.code
  const scriptPatterns = {
    hi: /[\u0900-\u097F]/,
    mr: /[\u0900-\u097F]/,
    ne: /[\u0900-\u097F]/,
    gu: /[\u0A80-\u0AFF]/,
    bn: /[\u0980-\u09FF]/,
    pa: /[\u0A00-\u0A7F]/,
    ta: /[\u0B80-\u0BFF]/,
    te: /[\u0C00-\u0C7F]/,
    kn: /[\u0C80-\u0CFF]/,
    ml: /[\u0D00-\u0D7F]/,
    ar: /[\u0600-\u06FF]/,
    ur: /[\u0600-\u06FF]/,
  }
  const pattern = scriptPatterns[code]
  return pattern ? pattern.test(String(text || '')) : true
}

function buildVoiceoverLanguageRules(languageInfo) {
  if (isHindiLanguage(languageInfo) && languageInfo?.romanized) {
    return [
      '- The original script is romanized Hindi/Hinglish. Convert it into natural spoken Hindi in Devanagari script.',
      '- Do not output Latin-script Hindi such as "Mere samne"; write Hindi words in Devanagari.',
      '- Keep brand names and product names in their original spelling only when needed; do not turn the narration into English.',
      '- English technical words from the source may remain only if they are part of the product phrase.',
    ].join('\n')
  }

  if (isGujaratiLanguage(languageInfo) && languageInfo?.romanized) {
    return [
      '- The original script is romanized Gujarati. Convert it into natural spoken Gujarati using Gujarati script.',
      '- Do not output Latin-script Gujarati such as "suraksha" or "parivaar"; write Gujarati words in Gujarati script.',
      '- Do NOT translate to Hindi or English. Preserve the Gujarati tone, idioms, and sentence flow.',
      '- Keep brand names and product names in their original English spelling only when needed.',
    ].join('\n')
  }

  if (isHindiLanguage(languageInfo)) {
    return [
      '- Write the voiceover in natural Hindi using Devanagari script.',
      '- Do not output Latin-script Hindi; write Hindi words in Devanagari.',
      '- Keep brand names and product names in their original spelling only when needed; do not translate the narration to English.',
    ].join('\n')
  }

  if (isGujaratiLanguage(languageInfo)) {
    return [
      '- CRITICAL: Write the voiceover ENTIRELY in natural Gujarati using Gujarati script (ગુજરાતી).',
      '- The original script is in Gujarati. You MUST preserve the Gujarati language and script exactly.',
      '- Do NOT translate to Hindi or English. Do NOT write in Devanagari or Latin script.',
      '- Keep the natural conversational Gujarati tone — as if a Gujarati person is speaking naturally to another Gujarati person.',
      '- Preserve Gujarati grammar, idioms, and sentence structure. Do not Hindi-fy or English-fy the narration.',
      '- Keep brand names and product names (e.g., "Tata Tiscon 550SD") in their original English spelling.',
      '- All other words MUST be in Gujarati script: e.g., "સુરક્ષા", "પરિવાર", "ઘર", not "suraksha", "parivaar", "ghar".',
      '- ANTI-HINDI CONTAMINATION: Do NOT use Hindi grammar or Hindi words disguised as Gujarati. Common mistakes to AVOID:',
      '  • WRONG: "હોતા" or "હોયા" → CORRECT: "હોય"',
      '  • WRONG: "બાત છોડો" → CORRECT: "બાંધછોડ ના કરો" or "સમાધાન ના કરો"',
      '  • WRONG: "ક્યું" or "ક્યોંકિ" → CORRECT: "કેમ" or "કારણ કે"',
      '  • WRONG: "આપકે" or "આપના" → CORRECT: "તમારા" or "તમારું"',
      '  • WRONG: "કે લિયે" → CORRECT: "માટે"',
      '  • WRONG: "ચાહિએ" → CORRECT: "જોઈએ"',
      '  • WRONG: "ભી" → CORRECT: "પણ"',
      '  • WRONG: "લિયા/લિયે" → CORRECT: "લીધું/લીધો"',
      '  • WRONG: "મિલતા" → CORRECT: "મળતું"',
      '  • WRONG: "રહેના" → CORRECT: "રહેવું"',
      '  • WRONG: "સમજોતા" → CORRECT: "સમાધાન" or "બાંધછોડ"',
      '- Use the Gujarati unique consonant "ળ" where correct: "મળવું", "કળ", "ઢળવું".',
      '- Use correct Gujarati gender agreement: neuter nouns like "કવર", "ઘર" take "ું" endings (e.g., "મોંઘું" not "મોંઘા").',
    ].join('\n')
  }

  if (isIndianLanguage(languageInfo)) {
    return [
      `- CRITICAL: Write the voiceover ENTIRELY in natural ${languageInfo.name} using ${languageInfo.script} script.`,
      `- The original script is in ${languageInfo.name}. You MUST preserve the ${languageInfo.name} language and script exactly.`,
      '- Do NOT translate to Hindi or English. Do NOT change the script/writing system.',
      '- Keep the natural conversational tone of the language.',
      '- Keep brand names and product names in their original English spelling.',
      `- All other words MUST be in ${languageInfo.script} script.`,
    ].join('\n')
  }

  return `- IMPORTANT: Write the voiceover in EXACTLY the same language and writing system as the original script: ${languageInfo.name || languageInfo.code} (${languageInfo.code || 'auto'}, ${languageInfo.script || 'native'} script).`
}

function voiceoverNeedsLanguageRetry(text, languageInfo) {
  if (!text) return false
  // For all Indian languages, verify the output actually contains native script characters
  if (isIndianLanguage(languageInfo) && !languageInfo?.romanized) {
    return !hasNativeScript(text, languageInfo)
  }
  // For romanized Hindi, check for Devanagari (since we asked it to convert)
  if (isHindiLanguage(languageInfo) && languageInfo?.romanized) {
    return !hasDevanagari(text)
  }
  if (isGujaratiLanguage(languageInfo) && languageInfo?.romanized) {
    return !hasGujaratiScript(text)
  }
  return false
}

function getPipelineOptions(videoOptions = {}) {
  const requestedAspect = String(videoOptions.aspectRatio || '').trim()
  const aspectRatio = SUPPORTED_ASPECT_RATIOS.has(requestedAspect) ? requestedAspect : '9:16'
  return { aspectRatio, quality: 'fal-hailuo' }
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function normalizeSceneDuration(value) {
  const parsed = Number(value)
  const safe = Number.isFinite(parsed) ? parsed : VIDEO_CLIP_DURATION_SECONDS
  return clampNumber(Math.round(safe * 2) / 2, MIN_SCENE_DURATION_SECONDS, MAX_SCENE_DURATION_SECONDS)
}

function getScenesTotalDuration(scenes = []) {
  const total = scenes.reduce((sum, scene) => sum + normalizeSceneDuration(scene.duration_seconds), 0)
  return Math.round(total * 10) / 10
}

function fitScenesToMaxDuration(scenes = [], maxDuration = MAX_TOTAL_DURATION_SECONDS) {
  let fitted = scenes.map(scene => ({
    ...scene,
    duration_seconds: normalizeSceneDuration(scene.duration_seconds),
  }))
  let total = getScenesTotalDuration(fitted)

  while (total > maxDuration && fitted.some(scene => scene.duration_seconds > MIN_SCENE_DURATION_SECONDS)) {
    const idx = fitted.reduce((longestIdx, scene, i) => (
      scene.duration_seconds > fitted[longestIdx].duration_seconds ? i : longestIdx
    ), 0)
    fitted[idx] = {
      ...fitted[idx],
      duration_seconds: normalizeSceneDuration(fitted[idx].duration_seconds - 0.5),
    }
    total = getScenesTotalDuration(fitted)
  }

  return fitted
}

function rebalanceSceneDurationForVoice(sceneData, sceneIndex, rawVoiceDuration) {
  const scene = sceneData[sceneIndex]
  if (!scene || !Number.isFinite(rawVoiceDuration)) return

  const current = normalizeSceneDuration(scene.duration_seconds)
  const desired = normalizeSceneDuration(Math.ceil((rawVoiceDuration / 1.12) * 2) / 2)
  if (desired <= current) return

  let extraNeeded = desired - current
  let total = getScenesTotalDuration(sceneData)

  while (total + extraNeeded > MAX_TOTAL_DURATION_SECONDS) {
    const donorIndex = sceneData.reduce((best, candidate, i) => {
      if (i <= sceneIndex) return best
      if (candidate.duration_seconds <= MIN_SCENE_DURATION_SECONDS) return best
      if (best === -1 || candidate.duration_seconds > sceneData[best].duration_seconds) return i
      return best
    }, -1)

    if (donorIndex === -1) break
    sceneData[donorIndex].duration_seconds = normalizeSceneDuration(sceneData[donorIndex].duration_seconds - 0.5)
    total = getScenesTotalDuration(sceneData)
  }

  const availableExtra = Math.max(0, MAX_TOTAL_DURATION_SECONDS - total)
  const appliedExtra = Math.min(extraNeeded, availableExtra)
  if (appliedExtra > 0) {
    scene.duration_seconds = normalizeSceneDuration(current + appliedExtra)
    console.log(`[server] VO timing: expanded scene ${scene.scene_number || sceneIndex + 1} from ${current}s to ${scene.duration_seconds}s`)
  }
}

function buildContinuityBible({
  actualProduct = '',
  productContext = '',
  productIdentity = '',
  visualIdentity = '',
  characterIdentity = 'None',
  characterLock = null,
  problemSolved = '',
} = {}) {
  const lockPrimary = characterLock?.primary_person || characterIdentity
  const lockClothing = characterLock?.clothing || 'same exact clothing and accessories in every scene'
  const lockSecondary = characterLock?.secondary_person || 'same secondary person if one appears'
  return [
    `PRODUCT LOCK: ${actualProduct || productIdentity || 'the advertised product'}. ${productContext ? `Usage/context: ${productContext}.` : ''} ${productIdentity ? `Exact appearance: ${productIdentity}.` : ''}`,
    lockPrimary && lockPrimary !== 'None'
      ? `CHARACTER LOCK: ${lockPrimary}. Clothing: ${lockClothing}. Secondary: ${lockSecondary}. The same people must appear with the same face, age, skin tone, hairstyle, build, clothing, and expression logic in every relevant scene.`
      : 'CHARACTER LOCK: If a person appears, invent one specific person once and keep the exact same face, age, skin tone, hairstyle, build, and clothing palette in every relevant scene.',
    `VISUAL LOCK: ${visualIdentity || DEFAULT_VISUAL_IDENTITY}. Keep the same ad world, lens language, lighting palette, realism level, color grade, and Indian campaign environment across all scenes.`,
    problemSolved ? `STORY LOCK: Every scene must support this same problem/solution: ${problemSolved}.` : '',
    'CONTINUITY RULE: The finished video must feel like one continuous ad shoot, not unrelated stock clips stitched together.',
  ].filter(Boolean).join('\n')
}

function inferProductState(scene = {}, sceneIndex = 0) {
  const combined = [
    scene.product_state,
    scene.voiceover_script,
    scene.scene_description,
    scene.scene_role,
    scene.scene_type,
    scene.key_message,
  ].filter(Boolean).join(' ').toLowerCase()

  if (/before|without|no product|no accessory|scratch|problem|tension|worried|damage|issue/.test(combined)) {
    return sceneIndex <= 2 ? 'before_reveal_no_accessories' : 'problem_before_solution'
  }
  if (/suggest|recommend|intro|reveal|install|fit|front|side|bumper|guard|guards|all[- ]round|protection/.test(combined)) {
    return 'reveal_accessories_installed'
  }
  if (/after|resolution|worry[- ]free|benefit|cta|hero|final|protected|safe/.test(combined)) {
    return 'after_reveal_accessories_visible'
  }
  return sceneIndex === 0 ? 'before_reveal_no_accessories' : 'continuity_locked'
}

function buildProductStateLock(scene = {}) {
  const state = String(scene.product_state || '').toLowerCase()
  const mustShow = scene.must_show ? `Must show: ${scene.must_show}` : ''
  const mustNotShow = scene.must_not_show ? `Must NOT show: ${scene.must_not_show}` : ''

  let rule
  if (/before_reveal_no_accessories|problem_before_solution/.test(state)) {
    rule = [
      'PRODUCT TIMELINE LOCK: BEFORE SOLUTION.',
      'Show the base object/customer problem exactly as the script says.',
      'Do NOT show the advertised accessory/product installed yet.',
      'For the Paragon scooter-guard script specifically: the scooter must be plain before the suggestion line; no front guard, side guard, bumper guard, Paragon branding, or protection accessory is visible.',
    ].join(' ')
  } else if (/reveal|install|installed|after|hero|cta/.test(state)) {
    rule = [
      'PRODUCT TIMELINE LOCK: AFTER SOLUTION REVEAL.',
      'The advertised product/accessories must now be clearly visible in a realistic usage context.',
      'For the Paragon scooter-guard script specifically: show matching front guard, side guard, and bumper guard fitted on the same scooter only from the suggestion/product reveal scene onward.',
    ].join(' ')
  } else {
    rule = 'PRODUCT TIMELINE LOCK: Follow the exact before/after product state from the script. Never reveal the product before it is mentioned or suggested.'
  }

  return [rule, mustShow, mustNotShow].filter(Boolean).join('\n')
}

function sceneNeedsProductReference(scene = {}) {
  if (scene.use_product_image === false) return false
  const state = String(scene.product_state || '').toLowerCase()
  if (/before_reveal_no_accessories|problem_before_solution|not_applicable|context_only/.test(state)) return false
  if (/reveal|installed|after|hero|product|cta|benefit|proof/.test(state)) return true

  const role = String(scene.scene_role || scene.scene_type || '').toLowerCase()
  if (/product|feature|benefit|proof|resolution|cta|hero|closeup/.test(role)) return true

  const combined = [
    scene.voiceover_script,
    scene.scene_description,
    scene.key_message,
    scene.must_show,
  ].filter(Boolean).join(' ').toLowerCase()

  return /product|guard|guards|front|side|bumper|protection|accessor|brand|packshot|logo|installed|fit/.test(combined)
}

function buildGeminiImageGenerationConfig(aspectRatio = '9:16', attempt = 1) {
  const config = {
    responseModalities: ['TEXT', 'IMAGE'],
  }

  // Nano Banana Pro accepts sizing under imageConfig, not responseFormat.image.
  // If a preview backend rejects imageSize, retry with less config instead of failing the scene.
  if (attempt <= 2) {
    config.imageConfig = { aspectRatio }
    if (attempt === 1) config.imageConfig.imageSize = '2K'
  }

  return config
}


function warnAndSkipService(jobId, serviceName, detail, fallbackDetail = 'Continuing with a local fallback.') {
  const message = `${serviceName} is not available right now because of an issue: ${detail}. ${fallbackDetail}`
  console.warn(`[server] ${message}`)
  addJobWarning(jobId, message)
  return message
}

function getImageMimeType(imagePath) {
  const ext = path.extname(imagePath).toLowerCase()
  if (ext === '.png') return 'image/png'
  if (ext === '.webp') return 'image/webp'
  return 'image/jpeg'
}

async function prepareImageForTextModel(imagePath) {
  const stat = await fsp.stat(imagePath)
  const ext = path.extname(imagePath).toLowerCase()

  if (stat.size <= TEXT_MODEL_IMAGE_MAX_BYTES && ['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
    const imageBuffer = await fsp.readFile(imagePath)
    return {
      data: imageBuffer.toString('base64'),
      mediaType: getImageMimeType(imagePath),
    }
  }

  const cacheDir = path.join(process.cwd(), 'tmp', 'text_model_image_cache')
  await fsp.mkdir(cacheDir, { recursive: true })
  const safeBase = path.basename(imagePath).replace(/[^a-z0-9_.-]/gi, '_')
  const outputPath = path.join(cacheDir, `${safeBase}-${stat.size}-${Math.floor(stat.mtimeMs)}.jpg`)

  if (!fs.existsSync(outputPath)) {
    await new Promise((resolve, reject) => {
      ffmpeg(imagePath)
        .outputOptions([
          '-vf', `scale='if(gt(iw,ih),min(${TEXT_MODEL_IMAGE_MAX_DIMENSION},iw),-2)':'if(gt(iw,ih),-2,min(${TEXT_MODEL_IMAGE_MAX_DIMENSION},ih))'`,
          '-frames:v', '1',
          '-q:v', '6',
        ])
        .output(outputPath)
        .on('end', resolve)
        .on('error', reject)
        .run()
    })
  }

  const imageBuffer = await fsp.readFile(outputPath)
  return {
    data: imageBuffer.toString('base64'),
    mediaType: 'image/jpeg',
  }
}

function getOpenAIErrorMessage(err) {
  const data = err.response?.data
  if (typeof data === 'string') return data
  const detail = data?.error?.message || data?.message || data?.detail || err.message
  return detail ? String(detail) : 'OpenAI request failed'
}

function getOpenAIModelCandidates() {
  const configured = OPENAI_MODEL()
  return [...new Set([configured, ...OPENAI_MODEL_FALLBACKS].filter(Boolean))]
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length)
  let nextIndex = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex++
      results[currentIndex] = await mapper(items[currentIndex], currentIndex)
    }
  })
  await Promise.all(workers)
  return results
}

// ─────────────────────────────────────────────────────
// Helper: call Gemini 2.5 Pro for text generation
// ─────────────────────────────────────────────────────
function extractOpenAIResponseText(responseData) {
  if (responseData?.output_text) return responseData.output_text
  const parts = []
  for (const item of responseData?.output || []) {
    for (const contentItem of item.content || []) {
      if (contentItem.type === 'output_text' && contentItem.text) parts.push(contentItem.text)
      if (contentItem.type === 'text' && contentItem.text) parts.push(contentItem.text)
    }
  }
  return parts.join('')
}

async function callOpenAI(systemPrompt, userPrompt, imagePaths = [], { jsonMode = false } = {}) {
  const content = [{ type: 'input_text', text: userPrompt }]

  if (imagePaths && imagePaths.length > 0) {
    for (const imgPath of imagePaths) {
      try {
        const image = await prepareImageForTextModel(imgPath)
        content.push({
          type: 'input_image',
          image_url: `data:${image.mediaType};base64,${image.data}`,
          detail: 'low',
        })
      } catch (err) {
        console.warn('Failed to prepare image for OpenAI analysis:', err.message)
      }
    }
  }

  let res
  let lastError
  for (const model of getOpenAIModelCandidates()) {
    try {
      res = await axios.post(
        OPENAI_RESPONSES_URL,
        {
          model,
          instructions: systemPrompt,
          input: [{ role: 'user', content }],
          max_output_tokens: 8192,
          store: false,
        },
        {
          headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY()}`,
            'content-type': 'application/json'
          },
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
          timeout: 300000
        }
      )
      break
    } catch (err) {
      lastError = err
      console.warn(`[server] OpenAI request failed with model ${model}: ${getOpenAIErrorMessage(err)}`)
    }
  }

  if (!res) {
    throw new Error(`OpenAI request failed for all configured models: ${getOpenAIErrorMessage(lastError)}`)
  }

  const text = extractOpenAIResponseText(res.data)
  if (!text) {
    throw new Error('OpenAI returned empty response')
  }
  return text
}

async function callGeminiText(systemPrompt, userPrompt, imagePaths = [], { jsonMode = false } = {}) {
  const parts = [{ text: userPrompt }]

  for (const imgPath of imagePaths || []) {
    try {
      const image = await prepareImageForTextModel(imgPath)
      parts.push({
        inlineData: {
          data: image.data,
          mimeType: image.mediaType,
        },
      })
    } catch (err) {
      console.warn('Failed to prepare image for Gemini text analysis:', err.message)
    }
  }

  const generationConfig = {
    temperature: 0.4,
    maxOutputTokens: 8192,
  }
  if (jsonMode) generationConfig.responseMimeType = 'application/json'

  const body = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: 'user', parts }],
    generationConfig,
  }
  const opts = { headers: { 'Content-Type': 'application/json' }, maxBodyLength: Infinity, maxContentLength: Infinity, timeout: 300000 }

  // Retry with exponential backoff for transient 503/429 errors
  const maxRetries = 4
  let lastError
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await axios.post(`${GEMINI_URL}?key=${GEMINI_API_KEY()}`, body, opts)
      const text = res.data?.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('') || ''
      if (!text) throw new Error('Gemini returned empty response')
      return text
    } catch (err) {
      lastError = err
      const status = err.response?.status
      if ((status === 503 || status === 429 || status === 500) && attempt < maxRetries) {
        const waitMs = attempt * 3000 + Math.random() * 2000  // 3-5s, 6-8s, 9-11s
        console.warn(`[server] Gemini ${status} on attempt ${attempt}/${maxRetries}, retrying in ${Math.round(waitMs)}ms...`)
        await sleep(waitMs)
        continue
      }
      throw err
    }
  }
  throw lastError
}

// ─────────────────────────────────────────────────────
// Helper: extract JSON from Gemini response
// ─────────────────────────────────────────────────────
function extractJSON(text) {
  // Strip markdown code fences
  let cleaned = text.replace(/```(?:json)?\s*\n?([\s\S]*?)\n?```/g, '$1').trim()
  if (!cleaned) cleaned = text.trim()
  // Remove BOM and zero-width chars
  cleaned = cleaned.replace(/^\uFEFF/, '').replace(/[\u200B-\u200D\uFEFF]/g, '')

  // Try direct parse first
  try { return JSON.parse(cleaned) } catch { /* fall through */ }

  // Extract outermost JSON object
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('Could not find JSON object in Gemini response')
  let raw = cleaned.slice(start, end + 1)

  // Try with extracted object
  try { return JSON.parse(raw) } catch { /* fall through to sanitizer */ }

  // Character-level sanitizer: walk the JSON, find string values, fix unescaped " and newlines inside them
  let out = ''
  let inString = false
  let escaped = false
  let i = 0
  while (i < raw.length) {
    const ch = raw[i]
    if (escaped) {
      out += ch
      escaped = false
      i++
      continue
    }
    if (ch === '\\') {
      escaped = true
      out += ch
      i++
      continue
    }
    if (ch === '"') {
      if (!inString) {
        // opening quote — peek ahead: are we at a key or a value?
        inString = true
        out += ch
        i++
        continue
      } else {
        // closing quote of a string — but first, check if next non-ws char is : (then this was a key, fine)
        inString = false
        out += ch
        i++
        continue
      }
    }
    if (inString) {
      // Inside a string value — fix raw newlines and carriage returns
      if (ch === '\n') { out += '\\n'; i++; continue }
      if (ch === '\r') { out += '\\r'; i++; continue }
      if (ch === '\t') { out += '\\t'; i++; continue }
    }
    out += ch
    i++
  }

  try { return JSON.parse(out) } catch { /* fall through */ }

  // Final attempt: log for debug and give up
  console.error('[server] Gemini raw response (first 500 chars):', raw.slice(0, 500))
  throw new Error('Could not extract valid JSON from Gemini response — the model returned malformed JSON. Try again.')
}



// ─────────────────────────────────────────────────────
// STEP 1: Script Analysis
// ─────────────────────────────────────────────────────
async function analyzeScript(jobId, script, imagePaths = []) {
  setStep(jobId, 'analyzing', 'Sending script to ChatGPT for analysis...')

  const hasReferenceImages = Array.isArray(imagePaths) && imagePaths.length > 0
  const detectedLanguage = detectScriptLanguage(script)
  const langCode = detectedLanguage.code
  const langName = detectedLanguage.name
  const langScript = detectedLanguage.script

  const languageInstruction = detectedLanguage.romanized
    ? `CRITICAL: The script is written in romanized ${langName} (${langName} written in Roman/Latin script). Set "language" to "${langCode}". The voiceover_script for each scene MUST be in ${langScript} script, NOT romanized Latin script. Preserve brand/product names in English when needed.`
    : `The script language is ${langName} (${langCode}, ${langScript} script). Set "language" to "${langCode}". The voiceover_script for each scene MUST be in the SAME language and script as the original script — do NOT translate or transliterate.`

  const voiceoverSceneRule = detectedLanguage.romanized
    ? `Every scene MUST have a voiceover_script field adapted only from the original script lines for that scene, converted into natural ${langName} using ${langScript} script. Do NOT leave romanized Latin-script narration except brand/product names.`
    : `Every scene MUST have a voiceover_script field with the EXACT original lines for that scene in the SAME language and script as the original — do NOT translate or transliterate.`

  const referenceModeRules = hasReferenceImages
    ? `- Build visual_identity and product_identity from the uploaded product photos.
- Every scene_description must repeat the same character clothing colors, product appearance, and setting.
- The uploaded image is a product reference, not a raw frame. Set use_product_image true ONLY for scenes where the product/accessory is visible and important. Set false for setup, problem, emotion, lifestyle, reaction, location, or context scenes where the product is not needed.
- Never plan a scene that is just the raw uploaded photo; always describe a polished ad-reel shot built around the referenced product.
- Do not invent different outfits, different locations, or different product colors from what the reference shows.`
    : `- Build product_identity and visual_identity from the script text only.
- If no product image is uploaded, invent ONE specific product appearance, ONE specific primary character if needed, and ONE campaign world. Treat these as locked continuity references.
- Every scene_description must repeat the same character face/clothing details, product appearance, location logic, lighting palette, and ad world for visual consistency.
- Do not write vague identities like "a man", "a scooter", or "a market". Use specific locked details like age, skin tone, hairstyle, shirt color, scooter color/model style, product material/color, street type, shop/home/parking style.
- Set use_product_image to false for every scene.`

  const systemPrompt = `You are a professional video director and scriptwriter with 20 years of experience in commercial advertising, performance marketing, and short-form reel ads.

Your job is to analyze the provided marketing script and break it into a premium short-form ad reel. The script could be about ANYTHING — a physical product, a mobile app, a digital service, a brand, a social cause, a business tool, or any other subject. Understand the script's core subject and adapt your analysis accordingly. The final video must feel like a high-retention paid social ad that viewers cannot look away from.

SCRIPT LANGUAGE: ${languageInstruction}

RULES — follow every single one strictly:
- CRITICAL: Your analysis MUST be 100% accurate to the script. Do NOT invent subjects, products, characters, settings, or story elements that are not in the script. Every scene must directly correspond to a specific part of the script.
- Return ONLY valid JSON. No markdown. No explanation. No preamble.
- Generate between ${MIN_SCENE_COUNT} and ${MAX_SCENE_COUNT} scenes with a clear ad arc: hook, problem/context, product reveal, benefit/proof, and call-to-action when the script supports it
- Determine total_duration_seconds NATURALLY from the script — let the script's content dictate the length. A short script might be 15-20 seconds, a medium script 25-40 seconds, a longer script 45-90 seconds. Never exceed ${MAX_TOTAL_DURATION_SECONDS} seconds. Do NOT artificially inflate or deflate the duration — match it to the script's natural pacing.
- Estimate duration_seconds dynamically based on visual impact and natural voiceover pacing. Short punch-cut scenes can be ${MIN_SCENE_DURATION_SECONDS}-3 seconds. Important product/benefit scenes can be 4-${MAX_SCENE_DURATION_SECONDS} seconds. Do NOT make all scenes the same length.
- The voiceover_script must fit naturally inside duration_seconds. If duration_seconds is 2-3 seconds, use only a very short phrase from the script. Do not place a long sentence in a short scene.
- All scene duration_seconds must sum exactly to total_duration_seconds
- Set use_product_image = true ONLY when the uploaded product/reference must be visible in that scene: product reveal, installation, close-up, benefit proof, packshot, CTA, or after-state.
- Set use_product_image = false for setup, problem, emotion/reaction, lifestyle, location, context, or before-state scenes. Do not force product reference into every scene.
- When in doubt, choose false unless the voiceover line needs the product to be seen.
- CRITICAL NARRATIVE ARC RULE: Read the script as a story with a timeline. Understand WHEN the main subject first appears in the narrative. If the script starts with a problem, struggle, or situation BEFORE the subject is introduced or suggested, those early "before" scenes MUST show the person/environment WITHOUT the subject. The subject should only appear visually from the exact scene where the script first mentions, suggests, or reveals it. After that point, all subsequent scenes should show the subject in use or in focus. This before/after visual contrast is the core storytelling device — apply this to ANY script.
- PRODUCT STATE RULE: Every scene MUST include product_state, must_show, and must_not_show. Use product_state values like "before_reveal_no_accessories", "reveal_accessories_installed", "after_reveal_accessories_visible", "product_hero", or "not_applicable". This is non-negotiable because the image/video model must know exactly what is allowed on screen.
- ACCESSORY TIMELINE EXAMPLE: If the script says a scooter gets scratched first and only later says "Maine Paragon guards suggest kiye - front, side, bumper", then all scenes before that line must show the same scooter WITHOUT Paragon guards/accessories. From that line onward, the same scooter MUST show front, side, and bumper guards installed. Never show accessories early and never remove them after reveal.
- No text_overlay field at all — no text will appear on video
- Detect the script language and output it as language code
- scene_description must be 100% accurate to the script. Describe EXACTLY what the camera sees, focusing ONLY on the essential elements from the script. CRITICAL: ZERO irrelevant background elements — no random vehicles, no random passersby, no objects not directly required by that specific voiceover line. Every single object, person, and detail in the description must come DIRECTLY from the script line for that scene. If the script describes an app feature, describe exactly whose hands hold the phone, which way the screen faces (toward the person, not the camera), where the person's eyes are looking (at their own screen, not at the viewer), and the exact hand/finger positions. If the script talks about a physical product, describe the product's position relative to the person and camera. If the script talks about emotions, describe subtle, natural facial expressions and body language — NOT dramatic or theatrical reactions. Every scene_description must specify: who is doing what, with which body part, looking where, and how their hands/gaze interact with any objects. CRITICAL UI RULE: When a phone/computer screen is visible, the icons on the screen must look like REAL iOS/Android app icons — rounded squares with real app shapes (messages, photos, maps, dialer, settings) — NOT abstract symbols, colored circles with letters, or emoji. Describe the specific real-looking app icons visible on the screen.
- Every scene must preserve the same campaign world, visual identity, color palette, lighting logic, and ad mood. Do not change the theme between scenes.
- The video must feel like one ad shoot with continuity, not separate generated clips. When a person appears in multiple scenes, keep the same face, clothing, and build. But do NOT force characters into every scene.
- Every scene should feel like a polished ad/reel shot, not a random cinematic story scene, fantasy scene, documentary, or generic filler.
- For scenes featuring the subject (product/app/service), describe how it appears in a real ad shot — usage context, environment, hands interacting, screen content if digital (must look like real iOS/Android app icons — rounded squares with real app shapes, NOT abstract colored circles or emoji), reflections/scale if physical.
- Scenes must be accurate to the script. Do not invent a different subject, different user, different country, or unrelated story.
- Use retention-first ad pacing: strong opening hook, quick visual variety, clear product payoff, emotionally satisfying final beat.
- key_message must be the single core emotion or idea of the scene
- motion_feel must describe the energy — calm, dramatic, upbeat etc
- ${voiceoverSceneRule}
- ANTI-REPETITION RULE: Each line of the original script must appear in EXACTLY ONE scene. Never repeat the same words or phrases across two different scenes. If a sentence is long, keep it in one scene and give that scene enough duration — do NOT split it into two scenes with overlapping text.
- If the script has speaker labels like Owner: or Expert:, include those lines without the speaker label
${referenceModeRules}

CRITICAL JSON RULES:
- Return ONLY a raw JSON object. No markdown fences, no explanation, no comments.
- ALL string values must use only escaped double-quotes inside them.
- The voiceover_script values must contain the original script text with all inner quote characters properly escaped.
- Do NOT include newlines inside JSON string values, use a space instead.

JSON SCHEMA:
{
  "actual_product": "exact subject name — can be a product, app, service, brand, tool, etc.",
  "product_context": "what the subject is used with or what problem it solves",
  "subject_type": "physical_product or mobile_app or digital_service or brand or social_cause or other",
  "problem_being_solved": "one sentence pain point",
  "solution_provided": "one sentence solution",
  "language": "${langCode}",
  "narrator_gender": "male or female — detect from the primary speaking character in the script",
  "overall_mood": "professional or dramatic or warm or intense or uplifting or trustworthy",
  "music_keywords": "specific ad music direction matching the subject, pace, emotion, culture, and visuals",
  "music_energy": "low or medium or high or very high",
  "total_duration_seconds": 30,
  "character_lock": {
    "primary_person": "detailed face + age + build description",
    "clothing": "exact shirt color, pants, any accessories",
    "secondary_person": "engineer or second character description"
  },
  "character_identity": "REQUIRED if any person appears in the ad. Write a DETAILED face-lock description: approximate age, gender, skin tone, face shape, hairstyle, hair color, facial hair, build. Write 'None' only if no person appears.",
  "product_identity": "physical description of the subject. For apps: describe the app icon, UI colors, screen layouts. For physical products: color, shape, materials, size. For services: describe the visual representation.",
  "visual_identity": "PREMIUM visual style — describe like a high-budget TV commercial: specific lighting setup (e.g., warm golden-hour backlight with soft fill, studio three-point lighting, cinematic rim light), color grade (e.g., warm amber tones, cool steel-blue grade), environment quality (modern, clean, affluent). This must feel like a Rs 50 lakh production, not a phone camera shot.",
  "scenes": [
    {
      "scene_number": 1,
      "scene_role": "setup or problem or product_intro or product_closeup or resolution or cta",
      "scene_type": "intro or product_hero or lifestyle or testimonial or feature_highlight or emotional or action or cta or outro",
      "duration_seconds": 2,
      "use_product_image": false,
      "product_state": "before_reveal_no_accessories or reveal_accessories_installed or after_reveal_accessories_visible or product_hero or not_applicable",
      "must_show": "specific visible objects/actions required in this scene",
      "must_not_show": "specific objects/actions forbidden in this scene because of the story timeline",
      "voiceover_script": "scene voiceover in the required language/script with escaped inner quotes",
      "scene_description": "exact camera visual — describe EXACTLY what the camera sees in terms of spatial positions and physical interactions. CRITICAL RULES: (1) When a person holds a phone/device, state explicitly that the screen faces the person and the person looks at their own screen — never at the camera. (2) Describe hand positions precisely: which hand holds what, where fingers are placed, which side of the device hands appear on. (3) State where each person's gaze is directed — eyes point at their own device/object, not at the viewer. (4) Describe body orientation relative to the camera (e.g., 'person seen from behind-left as they look down at their phone held in right hand, phone screen angled toward them, left thumb swiping'). (5) CRITICAL UI RULE: If a phone/computer screen is visible, describe that icons look like REAL apps (rounded square icons like Messages, Photos, Maps, Settings) — NOT abstract symbols, random colored circles, or emoji. (6) Describe subtle, natural facial expressions (gentle half-smile, relaxed eyes, thoughtful gaze, slight head tilt) and understated body language (leaning in slightly, relaxed shoulders, hands resting naturally). NOT dramatic or theatrical. Describe where actions happen ON which object. CRITICAL: ZERO vehicles, random passersby, or objects not mentioned in the script.",
      "key_message": "single core emotion or idea of this scene",
      "motion_feel": "energy description — slow cinematic, dramatic tension, upbeat, calm etc",
      "color_mood": "warm golden or cool blue or high contrast or natural daylight",
      "camera_angle": "wide or medium or close-up or extreme close-up or overhead",
      "human_emotion": "AUTHENTIC REAL HUMAN EMOTION — subtle, natural, believable. Describe the internal feeling with MINIMAL external expression. Real people in ads show micro-expressions, not theatrical emotions. Examples: 'genuinely pleased — slight natural smile at corners of mouth, relaxed eyes, subtle eyebrow lift', 'thoughtful — soft neutral focus, slight head tilt, natural blink', 'satisfied — subtle nod, gentle exhale, relaxed shoulders', 'attentive — naturally focused eyes, upright but relaxed posture'. NEVER write theatrical or over-expressive descriptions. Real humans do NOT furrow brows dramatically, clench fists, or put hands on foreheads in ads. Keep it subtle, real, and documentary-like."
    }
  ]
}

Script to analyze:
${script}
`

  // Try up to 3 times — first with JSON mode forced, then plain text fallback
  let lastError
  for (let attempt = 1; attempt <= 3; attempt++) {
    const useJsonMode = attempt <= 2  // attempts 1 & 2 use responseMimeType=json, attempt 3 is plain
    const userPrompt = attempt === 1
      ? `Analyze this script and return ONLY valid JSON:\n\n${script}`
      : attempt === 2
        ? `Analyze this script. Return ONLY the JSON object with no extra text:\n\n${script}`
        : `Return a JSON object analyzing this advertising script. No markdown. No explanation. Raw JSON only:\n\n${script}`

    try {
      const rawText = await callOpenAI(systemPrompt, userPrompt, imagePaths, { jsonMode: useJsonMode })
      console.log(`[server] analyzeScript attempt ${attempt} raw (first 120 chars):`, rawText.slice(0, 120).replace(/\n/g, ' '))
      const analysis = extractJSON(rawText)
      setStepProgress(jobId, 'analyzing', 1.0)
      return analysis
    } catch (err) {
      lastError = err
      console.warn(`[server] analyzeScript JSON parse failed (attempt ${attempt}):`, err.message)
    }
  }

  if (GEMINI_API_KEY()) {
    try {
      console.warn(`[server] OpenAI analysis failed; falling back to Gemini text analysis: ${lastError?.message || 'unknown error'}`)
      const fallbackPrompt = `Analyze this advertising script and return ONLY the JSON object described by the schema. No markdown. No explanation. Raw JSON only:\n\n${script}`
      const rawText = await callGeminiText(systemPrompt, fallbackPrompt, imagePaths, { jsonMode: true })
      console.log('[server] analyzeScript Gemini fallback raw (first 120 chars):', rawText.slice(0, 120).replace(/\n/g, ' '))
      const analysis = extractJSON(rawText)
      setStepProgress(jobId, 'analyzing', 1.0)
      return analysis
    } catch (err) {
      console.warn(`[server] Gemini analyzeScript fallback failed: ${err.message}`)
    }
  }

  throw lastError
}


// ─────────────────────────────────────────────────────
// STEP 2A: Generate Voiceover Script per scene
// ─────────────────────────────────────────────────────
async function generateVoiceoverScript(scene, language, originalScript) {
  const languageInfo = typeof language === 'string'
    ? normalizeLanguageInfo(language, originalScript)
    : language

  // PRIORITY 1: use the pre-extracted voiceover_script from analyzeScript
  if (scene.voiceover_script && String(scene.voiceover_script).trim().length > 3) {
    let cleaned = String(scene.voiceover_script).trim()
      .replace(/^[A-Za-z\u0A00-\u0AFF\u0900-\u097F]+:\s*/gm, '') // strip "SpeakerName: " prefix
      .trim()

    if (cleaned.length > 3) {
      const isIndian = isIndianLanguage(language)
      const isLatin = !/[\u0900-\u0AFF\u0B00-\u0DFF\u0600-\u06FF]/.test(cleaned)

      // If the voiceover text came back as romanized (Latin) but we need native Indian script,
      // ask Gemini to convert it to the native script for proper TTS accent
      if (isIndian && isLatin) {
        const targetScript = isGujaratiLanguage(language) ? 'Gujarati (ગુજરાતી script)'
          : isHindiLanguage(language) ? 'Hindi (Devanagari script)' : 'its native script'
        try {
          const sysPrompt = `You are a language expert. Convert the following romanized Indian language text into ${targetScript}. Return ONLY the converted text in native script. Do not add any explanation, translation notes, or markdown. Keep brand names like "Tata Tiscon 550SD" in English.`
          const converted = await callOpenAI(sysPrompt, `Convert to native script: ${cleaned}`)
          if (converted && converted.trim().length > 3 && !/^[A-Za-z\s.,!?]+$/.test(converted.trim())) {
            console.log(`[server] Converted romanized ${languageInfo.code || 'voiceover'} voiceover to native script`)
            cleaned = converted.trim()
          }
        } catch (err) {
          console.warn(`[server] Native script conversion failed:`, err.message)
        }
      }
      if (voiceoverNeedsLanguageRetry(cleaned, languageInfo)) {
        cleaned = await rewriteVoiceoverToLanguage(cleaned, languageInfo, originalScript, scene)
      }
      return cleaned
    }
  }

  // FALLBACK: ask Gemini to extract the matching lines from the original script
  const languageLabel = `${languageInfo.name || languageInfo.code} (${languageInfo.code || 'auto'}, ${languageInfo.script || 'native'} script)`
  const languageRules = buildVoiceoverLanguageRules(languageInfo)
  const englishSymbolRule = isEnglishLanguage(languageInfo)
    ? '- Expand symbols into spoken English words ("and" not "&", "percent" not "%").'
    : '- Expand symbols only into natural spoken words in the same language and native script.'

  const scriptPreservationRule = languageInfo?.romanized
    ? '- Use only the matching meaning/words from the original script, but convert the narration into the required native script.'
    : '- DO NOT translate. DO NOT paraphrase. DO NOT add new words.'

  const systemPrompt = `You are a voiceover scriptwriter for Indian regional language commercials.

Your ONLY job: Find and return the EXACT lines from the original script that belong to scene ${scene.scene_number}.

CRITICAL LANGUAGE RULE:
${languageRules}
${scriptPreservationRule}
- If the script has speaker names like "Expert:" or "Owner:", remove the speaker names and return ONLY the spoken text.
- Return the exact dialogue for this scene only. No stage directions. No brackets.
- Return ONLY the voiceover text, nothing else.`

  let text = await callOpenAI(systemPrompt,
    `Extract the voiceover lines for scene ${scene.scene_number} in ${languageLabel}.
Scene description: ${scene.scene_description}
Key message: ${scene.key_message}
Original script:\n${originalScript}`
  )

  text = text.trim().replace(/^["']|["']$/g, '')

  if (voiceoverNeedsLanguageRetry(text, languageInfo)) {
    text = await rewriteVoiceoverToLanguage(text, languageInfo, originalScript, scene)
  }

  return text
}

async function rewriteVoiceoverToLanguage(text, languageInfo, originalScript, scene) {
  const targetLang = languageInfo.name || languageInfo.code
  const targetScript = languageInfo.script || 'native'
  const languageRules = buildVoiceoverLanguageRules(languageInfo)
  const rewritten = await callOpenAI(
    `You are a native ${targetLang} advertising voiceover editor.
${languageRules}
- Rewrite ONLY the provided voiceover line into ${targetLang} using ${targetScript} script.
- Preserve the meaning, brand/product names, intensity, and ad tone.
- Do not translate to English unless a brand/product name is already English.
- Return ONLY the corrected voiceover line.`,
    `Voiceover to correct: ${text}

Original full script:
${originalScript}

Scene: ${scene.scene_description || ''}`
  )
  return rewritten.trim().replace(/^["']|["']$/g, '')
}

// ─────────────────────────────────────────────────────
// STEP 2B: Generate Image Prompt per scene
// ─────────────────────────────────────────────────────
async function generateImagePrompt(scene, imagePaths = [], aspectRatio = '9:16', productIdentity = DEFAULT_PRODUCT_IDENTITY, visualIdentity = DEFAULT_VISUAL_IDENTITY, characterIdentity = 'None', actualProduct = '', productContext = '', problemSolved = '', continuityBible = '', characterLock = null) {
  const orientationMap = { '9:16': 'vertical portrait', '16:9': 'horizontal landscape', '1:1': 'square' }
  const orientation = orientationMap[aspectRatio] || 'vertical portrait'
  const hasReferenceImages = Array.isArray(imagePaths) && imagePaths.length > 0
  const sceneVoiceover = scene.voiceover_script ? `\nWhat is being said: "${scene.voiceover_script}"` : ''
  const useProductImage = scene.use_product_image !== false
  const productStateLock = buildProductStateLock(scene)
  const characterLockBlock = characterIdentity && characterIdentity !== 'None'
    ? `CHARACTER CONSISTENCY LOCK:
Primary character: ${characterLock?.primary_person || characterIdentity}
Clothing: ${characterLock?.clothing || 'same exact clothing and accessories'}
Secondary character: ${characterLock?.secondary_person || 'same specific secondary person if present'}
Include these characters ONLY in scenes where the voiceover or scene description calls for a person. Product closeups, packshots, and CTA scenes do NOT need a person unless the script specifically mentions one.
When a character DOES appear, they must have the same face, clothing, and build every time — no substitutions.`
    : ''

  const systemPrompt = `You are a world-class commercial photography and digital art director for premium short-form ads and social-media reels.
Your job is to write a precise, accurate image generation prompt that will produce a photorealistic scene image for a marketing video. The image prompt you write must result in an image that is 100% accurate to the script — no invented objects, no random background items, no unrelated props.
The subject could be a physical product, a mobile app, a digital service, a brand, or anything else. Adapt your visual approach accordingly:
- For PHYSICAL PRODUCTS: photorealistic product photography with real-world context, zero unrelated objects
- For MOBILE APPS / DIGITAL SERVICES: clean phone/laptop mockups with accurate UI screens, modern minimal backgrounds
- For BRANDS / SERVICES: lifestyle photography showing the brand experience
- For PEOPLE / STORIES: cinematic portrait photography with subtle, natural expressions — NOT theatrical or dramatic

${characterLockBlock}

SUBJECT REFERENCE — this must appear in the image exactly as described:
Subject: ${actualProduct || productIdentity}
Context: ${productContext || 'N/A'}
Description: ${productIdentity}
${characterIdentity !== 'None' ? `Character Profile: ${characterIdentity}` : ''}
${hasReferenceImages ? 'Reference images are attached — replicate appearance exactly.' : ''}

CONTINUITY BIBLE — keep this identical across the whole ad:
${continuityBible || buildContinuityBible({ actualProduct, productContext, productIdentity, visualIdentity, characterIdentity, problemSolved })}

${productStateLock}

SCENE REQUIREMENTS:
Scene role: ${scene.scene_role || scene.scene_type}
Product state: ${scene.product_state || 'follow script timeline exactly'}
Must show: ${scene.must_show || 'the exact scene action required by the script'}
Must NOT show: ${scene.must_not_show || 'anything that contradicts the script timeline'}
Scene description: ${scene.scene_description}${sceneVoiceover}
Key message: ${scene.key_message || ''}
Color mood: ${scene.color_mood || visualIdentity}
Camera angle: ${scene.camera_angle || 'cinematic'}
Human emotion: ${scene.human_emotion || 'neutral'}
Overall mood: ${visualIdentity}

STRICT RULES:
1. ${aspectRatio} composition — ${orientation} frame only. Generate a SINGLE continuous image — never a collage, grid, or multi-panel layout.
2. PRODUCTION-GRADE REALISM: Must look like a REAL photograph captured by a professional commercial photographer using a high-end camera. Natural lens perspective, genuine depth of field, real optical focus falloff, physically plausible lighting. Every pixel must be indistinguishable from a real photo. NO AI-generated look — no CGI glow, no over-sharpening, no plastic surfaces, no unrealistic symmetry.
3. REALISTIC INDIAN SETTINGS: Grounded in believable real-world locations — homes, offices, shops, streets, or service spaces. NOT a film set, NOT a fantasy version of India. People should look like real relatable humans, not fashion models (unless the script explicitly requires that).
4. CINEMATIC LIGHTING: Soft natural-looking light — window light, practical lamps, soft diffused fill. Mild warmth. No neon, no bloom, no haze, no AI-style glow. Should look like a real commercial lit by a professional DP, not an AI rendering.
5. TEXT AND UI HANDLING — CRITICAL: If the script requires an app interface, screen, or notification, the UI must look like a REAL production app (iOS or Android). Real app icons are rounded squares with consistent grid spacing — NOT random abstract symbols, NOT random colored circles with letters, NOT AI-hallucinated icon shapes. Screen content must be legible and realistic: real notification text, real app layouts, real navigation bars. The UI must match real-world OS design conventions. Do NOT invent fake app icons that look like clip art or emoji. If the scene does NOT require a screen interface, show NO text, logos, watermarks, or UI elements at all — the image must be a clean photograph with zero artificial overlay.
6. ABSOLUTE VEHICLE BAN — CRITICAL: ZERO vehicles of any kind — no cars, scooters, trucks, bicycles, auto-rickshaws, or any other vehicle anywhere in the frame. Not in the background, not parked, not passing by, not partially visible through windows. If the scene is indoors, show ONLY the indoor environment — no street views visible through windows or doors. If the scene is outdoors, the background must contain ONLY the described setting elements. No exceptions unless the script explicitly and specifically requires a vehicle as a core subject element.
7. ANATOMY & PHYSICS RULE — CRITICAL: Every human body part must obey real-world physics and anatomy. Hands must hold objects naturally — fingers wrap around phones, cups from the CORRECT side. When a person holds a phone, the screen faces THEM, not the camera. Thumbs are on the correct side of the device. Arms and wrists bend at anatomically correct angles. Exactly 5 fingers per hand with correct proportions. No contorted limbs, no backwards joints, no extra fingers, no fused fingers, no hands coming from nowhere.
8. GAZE & EYE CONTACT RULE — CRITICAL: The person looks AT their own device/screen/object, NOT at the camera/viewer unless the script explicitly calls for direct eye contact (e.g., testimonial). When reading from a phone, their eyes point DOWN toward the screen, not sideways at the camera. When typing, eyes are on the keyboard/screen, not the viewer. Gaze must be natural and relaxed — not staring intensely.
9. SCREEN & DEVICE ORIENTATION RULE — CRITICAL: If a phone/tablet/laptop screen is visible, the screen surface must face the PERSON using it. The camera sees the BACK of the device or a steep oblique angle — NEVER a perfectly flat screen facing the camera unless it is a product shot of the device itself. The person's hands must be ON the device (holding, tapping, swiping) with fingers in natural positions.
10. SCRIPT ACCURACY — CRITICAL: The scene image MUST directly and accurately illustrate ONLY what the script describes for that specific scene. The setting, action, emotion, objects, and people must all come directly from the script. Do NOT add any element not mentioned in the script — no random products, no random people, no random objects, no random background items. Actions must happen ON the correct object (e.g., a scratch must be on the product, not a random background object).
11. EXPRESSIONS — CRITICAL: Characters must show subtle, natural, realistic human expressions — NOT dramatic or theatrical. Real people in ads do not overact. Describe micro-expressions: a gentle half-smile, relaxed eyes, a thoughtful gaze, a natural nod. No furrowed brows, no clenched fists, no hands-on-forehead drama, no wide-eyed staring, no big fake smiles. The expression must look like a candid moment captured by a photographer, not an actor posing for the camera. Authentic, understated, believable.
12. FACE/CHARACTER RULES: Only include characters when the script calls for one. When a character appears across scenes, keep the EXACT same face, skin tone, age, hairstyle, build, and clothing. Characters should look like normal real humans, not models or actors.
13. SUBJECT CONSISTENCY: Keep product appearance, UI layout, location style, colors, and materials identical across scenes. 100% accurate to the script.
14. ANTI-AI REALISM: The image must pass as a real photograph to any human viewer. Natural skin texture (visible pores, fine hairs, natural blemishes), slight facial asymmetry, realistic fabric wrinkles and folds. Avoid smooth plastic skin, symmetrical AI faces, impossible hands, melted/disappeared fingers, extra/missing digits, CGI glow, over-sharpened edges, and the telltale "AI render" look. For UI/Apps, ensure crisp lines, accurate text, and modern clean layouts.
15. Subject must be sharp, in focus, and attractive but realistic. Background complements but never distracts.
16. Describe specifics: time of day, lighting, clothing, expressions, camera distance, UI screen content. Maximum 150 words.
17. Avoid fantasy, surreal, movie-poster, documentary, over-stylized, hyper-glossy, or obviously AI-generated looks. Keep it grounded, photorealistic, and professional.
18. Do not change the product, its category, UI appearance, color, or usage context from the script/reference.
19. BEFORE/AFTER LOCK: Respect Product state, Must show, and Must NOT show more strongly than style. If the script has a before/after reveal, the before scene must not contain the revealed product/accessory and the after scene must contain it.
20. Return ONLY the image prompt text — nothing else.

${useProductImage
  ? `use_product_image = TRUE:
Write a HIGH-BUDGET product/app ad shot. Product/App clearly visible, sharp, correctly scaled, in its real usage context from the script. If this is a mobile app, the screen UI must show REAL app icons (rounded squares like Messages, Photos, Maps, Settings) — NOT abstract colored circles, emoji, or AI symbols. Every icon must look like a real shipping OS. Cinematic lighting, professional feel.`
  : `use_product_image = FALSE:
Write a HIGH-BUDGET context shot. Capture the EXACT moment from the voiceover. Cinematic lighting, premium color grading. Professional, modern setting.`
}`

  const text = await callOpenAI(systemPrompt,
    `Generate the image prompt based on the instructions. Return ONLY the final prompt string, nothing else.`,
    imagePaths
  )

  return text.trim().replace(/^["']|["']$/g, '')
}

// ─────────────────────────────────────────────────────
// STEP 3: Generate Scene Image via Nano Banana Pro (gemini-3-pro-image-preview)
// ─────────────────────────────────────────────────────
async function generateSceneImage(imagePrompt, outputPath, aspectRatio = '9:16', referenceImagePaths = [], visualIdentity = DEFAULT_VISUAL_IDENTITY) {
  if (!GEMINI_API_KEY()) {
    throw new Error('GEMINI_API_KEY is required for Nano Banana Pro image generation')
  }

  console.log(`[server] Generating Nano Banana Pro image (${GEMINI_IMAGE_MODEL()}) for aspect ratio ${aspectRatio}...`)
  const hasReferenceImages = Array.isArray(referenceImagePaths) && referenceImagePaths.length > 0
  const useProductReference = referenceImagePaths.some(p => !/scene_\d+_image|continuity_fallback|visual_fallback/i.test(path.basename(String(p))))
  
  const referenceInstruction = hasReferenceImages
    ? (useProductReference
      ? `Use the attached product/reference image only for the product scenes that require it. ${visualIdentity}. Preserve the exact product identity, product color, materials, proportions, logos/markings, and visible details. Do not redesign the product, but do not force it into the frame unless the scene prompt says it must appear.`
      : `Use the attached prior scene frame only as continuity reference for people, location, lighting, lens, and color grade. Do NOT copy any product into this scene unless the prompt explicitly requires it. ${visualIdentity}.`)
    : `No reference image uploaded. Generate from script prompt only. ${visualIdentity}. Keep one exact invented product/person/location continuity across scenes.`

  const parts = [{
    text: `${imagePrompt}

${referenceInstruction}

NON-NEGOTIABLE OUTPUT:
- Generate exactly one photorealistic production-grade ad frame. This must be INDISTINGUISHABLE from a photograph taken with a real high-end camera by a professional commercial photographer. If a human cannot tell it is AI-generated, it passes.
- 100% PHYSICALLY ACCURATE ANATOMY: Hands must have exactly 5 fingers each with correct proportions, fingers bend at correct knuckles, thumbs oppose correctly. No extra, missing, fused, or deformed fingers. Arms and hands must attach at anatomically correct positions. No floating hands, no hands coming from outside the frame, no backwards-bending joints.
- CORRECT DEVICE ORIENTATION: If a person holds a phone/tablet, the screen face is directed TOWARD the person, not the camera. The camera must see either the back of the device or a natural oblique angle. The person's hands grip the device from the sides/bottom — not covering the screen. The person's gaze is directed AT their own screen, not at the camera.
- NATURAL EXPRESSIONS ONLY: Every person in the image must show subtle, natural, real-human expressions. No big fake smiles, no intense staring, no theatrical emotions. People should look like they were caught in a candid moment by a photographer — relaxed, natural, and believable. Micro-expressions only: a slight genuine smile, a soft thoughtful gaze, a natural relaxed face.
- NATURAL BODY POSTURE: The person's body, head, and limbs must be in a physically possible, natural, relaxed pose. No twisted torsos, no dislocated shoulders, no necks bent at impossible angles. People should look comfortable and natural, not stiff or posed.
- REALISTIC UI ONLY: If a phone/computer screen shows an app interface, every icon must look like a REAL iOS/Android app icon — rounded square grid, consistent spacing, recognizable real-app shapes (messages, photos, settings, maps, dialer). NOT abstract symbols, NOT random colored circles with letters, NOT clip-art emoji icons, NOT AI-hallucinated icon designs. Notification banners must show real readable text. The screen must look like a real device screenshot from a shipping operating system — never an AI's imagination.
- ABSOLUTE VEHICLE BAN: ZERO vehicles of any kind — no cars, scooters, trucks, bicycles, auto-rickshaws, or any other vehicle anywhere in the frame for any reason. Not in the background, not parked, not passing by, not partially visible. If the scene is indoors, show ONLY the indoor environment — no street visible through windows/doors. If the scene is outdoors, the background must contain ONLY the specific setting elements described in the script. No exceptions.
- No random objects, products, people, or elements of any kind that are not explicitly described in the script for this specific scene.
- No collage, split screen, text overlay, watermark, subtitles, or poster layout.
- Real Indian commercial photography aesthetic: realistic locations, real human expressions, real camera lens, natural skin texture (visible pores, fine hairs, natural blemishes), real depth of field.
- ABSOLUTELY NO AI look: no plastic skin, no symmetrical AI faces, no over-glossy CGI, no impossible beauty lighting, no fake smiles, no warped hands, no fantasy advertising looks, no smooth mannequin skin, no wax-figure faces.
- Product/reference identity must remain 100% unchanged whenever the product is intentionally visible.`
  }]

  for (const imgPath of (referenceImagePaths || []).slice(-3)) {
    try {
      const image = await prepareImageForTextModel(imgPath)
      parts.push({
        inlineData: {
          data: image.data,
          mimeType: image.mediaType,
        },
      })
    } catch (err) {
      console.warn('Failed to prepare reference image for Nano Banana Pro:', err.message)
    }
  }

  let lastError
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await axios.post(
        `${GEMINI_IMAGE_URL()}?key=${GEMINI_API_KEY()}`,
        {
          contents: [{ role: 'user', parts }],
          generationConfig: buildGeminiImageGenerationConfig(aspectRatio, attempt),
        },
        {
          headers: { 'Content-Type': 'application/json' },
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
          timeout: 300000,
        }
      )

      const responseParts = res.data?.candidates?.[0]?.content?.parts || []
      const imagePart = responseParts.find(part => part.inlineData?.data || part.inline_data?.data)
      const inlineData = imagePart?.inlineData || imagePart?.inline_data
      const imageData = inlineData?.data
      if (!imageData) {
        const text = responseParts.map(part => part.text || '').join(' ').trim()
        throw new Error(text ? `Nano Banana Pro returned text but no image: ${text.slice(0, 180)}` : 'Nano Banana Pro returned no image')
      }

      await fsp.writeFile(outputPath, Buffer.from(imageData, 'base64'))
      console.log(`[server] Nano Banana Pro image saved: ${outputPath}`)
      return outputPath
    } catch (err) {
      lastError = err
      console.warn(`[server] Nano Banana Pro image attempt ${attempt}/3 failed: ${err.response?.data?.error?.message || err.message}`)
      if (attempt === 3) throw err
      await sleep(attempt * 5000)
    }
  }

  throw lastError
}

// ─────────────────────────────────────────────────────
// STEP 4: Generate Video Clip via fal.ai (Kling V2.5 → PixVerse V6 → Ken Burns)
// ─────────────────────────────────────────────────────
async function generateVideoClip(imagePath, scene, outputPath, jobId, videoOptions = {}) {
  checkCancel(jobId)
  const clipDuration = Number(scene.duration_seconds) || videoOptions.clipDuration || VIDEO_CLIP_DURATION_SECONDS
  const aspectRatio = videoOptions.aspectRatio || '9:16'
  const sceneNum = scene.scene_number || '?'

  if (FAL_API_KEY()) {
    // Try Kling Video V2.5 Turbo first (primary model)
    try {
      console.log(`[server] Generating Kling Video V2.5 for scene ${sceneNum} (${scene.scene_role || 'scene'}, ${clipDuration}s)`)
      await generateKlingVideo(imagePath, scene, outputPath, clipDuration, aspectRatio, jobId)
      return outputPath
    } catch (err) {
      if (err.message === 'CANCELLED') throw err
      console.warn(`[server] Kling failed for scene ${sceneNum} (${err.message}), trying PixVerse V6...`)
    }

    // Try PixVerse V6 as fallback
    try {
      console.log(`[server] Generating PixVerse V6 AI video for scene ${sceneNum} (${scene.scene_role || 'scene'}, ${clipDuration}s)`)
      await generatePixVerseVideo(imagePath, scene, outputPath, clipDuration, aspectRatio, jobId)
      return outputPath
    } catch (err) {
      if (err.message === 'CANCELLED') throw err
      console.warn(`[server] PixVerse V6 failed for scene ${sceneNum} (${err.message}), falling back to Ken Burns`)
      if (jobId) addJobWarning(jobId, `Scene ${sceneNum}: AI video models unavailable. Using Ken Burns fallback.`)
    }
  }

  // Final fallback: FFmpeg Ken Burns effects
  console.log(`[server] Generating FFmpeg animated clip for scene ${sceneNum} (${scene.scene_role || 'scene'}, ${clipDuration}s)`)
  await createKenBurnsFallbackClip(imagePath, outputPath, clipDuration, aspectRatio, scene)
  return outputPath
}

// ─────────────────────────────────────────────────────
// FramePack AI Video Generation via fal.ai
// ─────────────────────────────────────────────────────

// Build a cinematic video motion prompt from the scene data
// Goal: natural, real-looking commercial footage — NOT AI-looking, NOT theatrical
async function buildVideoMotionPrompt(scene) {
  const role = String(scene.scene_role || scene.scene_type || 'scene').toLowerCase()
  const voiceover = scene.voiceover_script || scene.scene_description || ''
  const emotion = scene.human_emotion || ''
  const cameraAngle = scene.camera_angle || 'medium'
  const productStateLock = buildProductStateLock(scene)

  // Map scene roles to NATURAL, RESTRAINED camera motions — like real commercials
  const motionMap = {
    setup: 'Locked-off or very slow tripod pan, like a real establishing shot in a documentary.',
    problem: 'Tiny natural handheld drift — barely perceptible, like real footage. No dramatic movement.',
    product_intro: 'Slow gentle push-in or subtle slider move. Like a real commercial product reveal. No orbit, no whip, no flashy transition.',
    product_closeup: 'Extremely slow macro pan or locked-off. Like a real macro product shot. Every detail stays stable.',
    resolution: 'Natural slow tracking or locked-off. Relaxed, confident, believable.',
    cta: 'Clean locked-off professional framing with zero camera drift.',
  }

  const baseMotion = motionMap[role] || 'Smooth, slow, natural camera movement. Realistic, not dramatic.'

  // Natural, subtle human movement — real people, not actors
  const humanMotion = emotion
    ? `Real human characters with NATURAL, SUBTLE expressions. The person shows "${emotion}" but in a very understated way — the way a real person would behave if unaware of being filmed. Subtle micro-expressions only: a gentle shift of the eyes, a tiny lip movement, a slight head tilt. Natural breathing: chest rises and falls almost imperceptibly. Occasional natural blinks. Very slight body sway. The person should look like a real human going about their day — NOT an actor performing, NOT an AI animation. NO dramatic expressions, NO intense staring, NO theatrical gestures. Movement should be minimal, natural, and believable.`
    : 'The person moves like a real human being unaware of being filmed — natural, subtle, understated. Occasional gentle blinks, very slight body micro-movements, natural relaxed breathing. No dramatic expressions, no intense staring, no theatrical acting, no frozen faces, no mechanical looping. The person looks relaxed and natural, like a candid real person — not an actor and not an AI puppet.'

  const prompt = [
    `Real commercial footage shot on a high-end cinema camera. Natural filmic look, accurate depth of field, realistic lighting, true-to-life colors. NOT an AI animation, NOT a stylized render.`,
    baseMotion,
    `Camera: ${cameraAngle} angle.`,
    productStateLock,
    humanMotion,
    voiceover ? `Scene context: ${voiceover.slice(0, 80)}.` : '',
    `ABSOLUTE OBJECT PERMANENCE: Every single object, UI element, person, and detail visible at the start of the clip must remain perfectly stable and unchanged throughout the entire clip. Nothing disappears, nothing transforms, nothing melts, nothing distorts. No new objects of any kind may appear during the clip — no vehicles, no people, no random items entering the frame. The frame must contain ONLY what was present from the very first frame.`,
    `ABSOLUTE VEHICLE BAN: No cars, scooters, trucks, bicycles, auto-rickshaws, or any vehicles visible at any point. Zero vehicles in any state — moving, parked, or passing through background. The only object types allowed are those that were visible in the starting frame: the subject product, the person, the setting furniture, and the background environment.`,
    `HUMAN BEHAVIOR: The person must move like a genuine real human — subtle natural breathing, occasional real blinks, gentle micro-movements of eyes and head. No intense staring, no frozen faces, no robotic repetition, no dramatic expressions. The person should appear relaxed and natural, as if going about their normal day.`,
    `Transition style: the clip should start and end as continuous natural footage — no fade, no whip pan, no artificial transition. The editor must be able to cut naturally to the next shot.`,
    `CRITICAL: No morphing, no warping, no melting, no AI artifacts, no deformed faces or hands, no frozen or staring faces, no random objects spawning, no vehicles appearing, no repetitive loops. Real-world physics at all times. The video must look like real footage from a real commercial shoot.`,
  ].filter(Boolean).join(' ').slice(0, 500)

  return prompt
}

// Upload image to fal.ai storage and get a URL
async function uploadImageToFal(imagePath) {
  const imageBuffer = await fsp.readFile(imagePath)
  const ext = path.extname(imagePath).toLowerCase()
  const mimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg'

  // Create a Blob-like object for fal.storage.upload
  const blob = new Blob([imageBuffer], { type: mimeType })
  const file = new File([blob], path.basename(imagePath), { type: mimeType })
  const url = await fal.storage.upload(file)
  console.log(`[server] Uploaded scene image to fal.ai storage: ${url.slice(0, 80)}...`)
  return url
}

async function generatePixVerseVideo(imagePath, scene, outputPath, clipDuration, aspectRatio, jobId) {
  const motionPrompt = await buildVideoMotionPrompt(scene)
  console.log(`[server] PixVerse V6 prompt: "${motionPrompt.slice(0, 100)}..."`)

  const imageUrl = await uploadImageToFal(imagePath)
  const pvDuration = `${Math.min(8, Math.max(5, Math.round(clipDuration)))}`

  const result = await fal.subscribe('fal-ai/pixverse/v6/image-to-video', {
    input: {
      prompt: motionPrompt,
      image_url: imageUrl,
      negative_prompt: 'text, subtitles, watermark, blur, distortion, low quality, morphing, warping, melting, deformed hands, deformed face, extra fingers, missing fingers, fused fingers, unnatural motion, AI artifacts, plastic skin, CGI look, product changing, logo changing, object disappearing, frozen face, no expression, staring, looping movement, repetitive motion, robotic movement, stiff posture, floating objects, disconnected limbs, limbs bending wrong way, contorted body, face warping, skin melting, unnatural gaze, AI animation, puppet, mannequin, wax figure, still image effect, no breathing, cars, vehicles, trucks, scooters, bicycles, auto-rickshaws, background vehicles, passing cars, new objects appearing, extra objects appearing, irrelevant background objects, random items appearing, objects spawning, people appearing from nowhere, vehicle driving by, vehicle parked, street with traffic, road with cars',
      resolution: '1080p',
      duration: pvDuration,
      aspect_ratio: aspectRatio,
      generate_audio_switch: false,
      generate_multi_clip_switch: false,
      thinking_type: 'disabled',
    },
    logs: true,
    pollInterval: 8000,
    onQueueUpdate: (update) => {
      checkCancel(jobId)
      if (jobId) {
        updateJob(jobId, { stepDetail: `Scene ${scene.scene_number || '?'}: PixVerse V6 ${update.status || 'processing'}...` })
      }
    },
  })

  const videoUrl = result.data?.video?.url
  if (!videoUrl) throw new Error('PixVerse V6 returned no video URL')
  console.log(`[server] PixVerse V6 video ready: ${videoUrl.slice(0, 80)}...`)

  const rawVideoPath = outputPath.replace('.mp4', '_raw_pixverse.mp4')
  const response = await axios.get(videoUrl, { responseType: 'arraybuffer', timeout: 120000 })
  await fsp.writeFile(rawVideoPath, Buffer.from(response.data))

  const { w, h } = VIDEO_SIZE_BY_ASPECT[aspectRatio] || VIDEO_SIZE_BY_ASPECT['9:16']
  await new Promise((resolve, reject) => {
    ffmpeg(rawVideoPath)
      .outputOptions([
        '-t', `${clipDuration}`,
        '-vf', `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},${UNIFIED_GRADE},format=yuv420p,tpad=stop_mode=clone:stop_duration=${Math.max(0, clipDuration).toFixed(3)}`,
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-b:v', '4000k',
        '-maxrate', '5500k',
        '-bufsize', '9000k',
        '-pix_fmt', 'yuv420p',
        '-r', '24',
        '-an',
        '-movflags', '+faststart',
      ])
      .output(outputPath)
      .on('start', (cmd) => console.log(`[server] PixVerse postprocess ffmpeg: ${cmd}`))
      .on('end', () => resolve(outputPath))
      .on('error', (err) => {
        console.warn(`[server] PixVerse postprocess failed for scene ${scene.scene_number || '?'}: ${err.message}`)
        reject(err)
      })
      .run()
  })

  fsp.unlink(rawVideoPath).catch(() => {})
  return outputPath
}

async function generateKlingVideo(imagePath, scene, outputPath, clipDuration, aspectRatio, jobId) {
  const motionPrompt = await buildVideoMotionPrompt(scene)
  console.log(`[server] Kling prompt: "${motionPrompt.slice(0, 100)}..."`)

  const imageUrl = await uploadImageToFal(imagePath)
  const klDuration = `${Math.min(10, Math.max(5, Math.round(clipDuration)))}`

  const result = await fal.subscribe('fal-ai/kling-video/v2.5-turbo', {
    input: {
      prompt: motionPrompt,
      image_url: imageUrl,
      negative_prompt: 'text, subtitles, watermark, blur, distortion, low quality, morphing, warping, melting, deformed hands, deformed face, extra fingers, missing fingers, fused fingers, unnatural motion, AI artifacts, plastic skin, CGI look, product changing, logo changing, object disappearing, frozen face, no expression, staring, looping movement, repetitive motion, robotic movement, stiff posture, floating objects, disconnected limbs, limbs bending wrong way, contorted body, face warping, skin melting, unnatural gaze, AI animation, puppet, mannequin, wax figure, still image effect, no breathing, cars, vehicles, trucks, scooters, bicycles, auto-rickshaws, background vehicles, passing cars, new objects appearing, extra objects appearing, irrelevant background objects, random items spawning, objects spawning, people appearing from nowhere, vehicle driving by, vehicle parked, street with traffic, road with cars',
      duration: klDuration,
      aspect_ratio: aspectRatio,
    },
    logs: true,
    pollInterval: 8000,
    onQueueUpdate: (update) => {
      checkCancel(jobId)
      if (jobId) {
        updateJob(jobId, { stepDetail: `Scene ${scene.scene_number || '?'}: Kling ${update.status || 'processing'}...` })
      }
    },
  })

  const videoUrl = result.data?.video?.url
  if (!videoUrl) throw new Error('Kling returned no video URL')
  console.log(`[server] Kling video ready: ${videoUrl.slice(0, 80)}...`)

  const rawVideoPath = outputPath.replace('.mp4', '_raw_kling.mp4')
  const response = await axios.get(videoUrl, { responseType: 'arraybuffer', timeout: 120000 })
  await fsp.writeFile(rawVideoPath, Buffer.from(response.data))

  const { w, h } = VIDEO_SIZE_BY_ASPECT[aspectRatio] || VIDEO_SIZE_BY_ASPECT['9:16']
  await new Promise((resolve, reject) => {
    ffmpeg(rawVideoPath)
      .outputOptions([
        '-t', `${clipDuration}`,
        '-vf', `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},${UNIFIED_GRADE},format=yuv420p,tpad=stop_mode=clone:stop_duration=${Math.max(0, clipDuration).toFixed(3)}`,
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-b:v', '4000k',
        '-maxrate', '5500k',
        '-bufsize', '9000k',
        '-pix_fmt', 'yuv420p',
        '-r', '24',
        '-an',
        '-movflags', '+faststart',
      ])
      .output(outputPath)
      .on('start', (cmd) => console.log(`[server] Kling postprocess ffmpeg: ${cmd}`))
      .on('end', () => resolve(outputPath))
      .on('error', (err) => {
        console.warn(`[server] Kling postprocess failed for scene ${scene.scene_number || '?'}: ${err.message}`)
        reject(err)
      })
      .run()
  })

  fsp.unlink(rawVideoPath).catch(() => {})
  return outputPath
}

// Legacy generator retained only for rollback during development; production uses PixVerse V6.
async function legacyFramePackVideo(imagePath, scene, outputPath, clipDuration, aspectRatio, jobId) {
  throw new Error('Legacy image-to-video generator removed; PixVerse V6 is the production path')
/*
  // 1. Build the motion prompt
  const motionPrompt = await buildVideoMotionPrompt(scene)
  console.log(`[server] Legacy prompt: "${motionPrompt.slice(0, 100)}..."`)

  // 2. Upload the scene image to fal.ai storage
  const imageUrl = await uploadImageToFal(imagePath)

  // 3. Map duration for legacy provider
  const pvDuration = Math.min(15, Math.max(1, Math.round(clipDuration)))

  // 4. Call legacy provider via fal.ai
  const result = await fal.subscribe('fal-ai/legacy-disabled/image-to-video', {
    input: {
      prompt: motionPrompt,
      image_url: imageUrl,
      duration: pvDuration,
      resolution: '720p',
      generate_audio_switch: false,
    },
    logs: true,
    onQueueUpdate: (update) => {
      if (update.status === 'IN_PROGRESS' && jobId) {
        const sceneNum = scene.scene_number || '?'
        updateJob(jobId, { stepDetail: `Scene ${sceneNum}: legacy AI video generating...` })
      }
    },
    pollInterval: 3000,
  })

  if (!result?.data?.video?.url) {
    throw new Error('Legacy image-to-video returned no video URL')
  }

  const videoUrl = result.data.video.url
  console.log(`[server] Legacy image-to-video ready: ${videoUrl.slice(0, 80)}...`)

  // 5. Download the generated video
  const rawVideoPath = outputPath.replace('.mp4', '_raw_pv.mp4')
  const response = await axios.get(videoUrl, { responseType: 'arraybuffer', timeout: 60000 })
  await fsp.writeFile(rawVideoPath, Buffer.from(response.data))

  // 6. Trim/re-encode to exact duration with FFmpeg for consistent format
  const { w, h } = VIDEO_SIZE_BY_ASPECT[aspectRatio] || VIDEO_SIZE_BY_ASPECT['9:16']
  await new Promise((resolve, reject) => {
    ffmpeg(rawVideoPath)
      .outputOptions([
        '-t', `${clipDuration}`,
        '-vf', `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},format=yuv420p`,
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-pix_fmt', 'yuv420p',
        '-r', '24',
        '-an',
        '-movflags', '+faststart',
      ])
      .output(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', (err) => reject(err))
      .run()
  })

  // Clean up raw download
  fsp.unlink(rawVideoPath).catch(() => {})
  console.log(`[server] Legacy image-to-video scene ${scene.scene_number || '?'} complete: ${outputPath}`)
  return outputPath
*/
}

// ─────────────────────────────────────────────────────
// FFmpeg Ken Burns Fallback (used when PixVerse V6 is unavailable)
// ─────────────────────────────────────────────────────
function createKenBurnsFallbackClip(imagePath, outputPath, duration = VIDEO_CLIP_DURATION_SECONDS, aspectRatio = '9:16', scene = {}) {
  const { w, h } = VIDEO_SIZE_BY_ASPECT[aspectRatio] || VIDEO_SIZE_BY_ASPECT['9:16']
  const frames = Math.max(1, Math.round(duration * 24))
  const role = String(scene.scene_role || scene.scene_type || '').toLowerCase()
  // NOTE: NO spaces allowed inside zoompan expressions — FFmpeg rejects them
  let zoomExpr, xExpr, yExpr, eqFilter = ''

  if (role === 'setup') {
    zoomExpr = `min(1.025,1+0.025*on/${frames})`
    xExpr = `iw/2-(iw/zoom/2)`
    yExpr = `max(0,ih/2-(ih/zoom/2)-4*on/${frames})`
    eqFilter = 'eq=brightness=0.02:saturation=1.08:contrast=1.03'
  } else if (role === 'problem') {
    zoomExpr = `min(1.035,1+0.012*on/${frames})`
    xExpr = `iw/2-(iw/zoom/2)+sin(on*0.8)*1.5`
    yExpr = `ih/2-(ih/zoom/2)+cos(on*0.7)*1.2`
    eqFilter = 'eq=brightness=-0.01:saturation=1.02:contrast=1.03'
  } else if (role === 'product_intro') {
    zoomExpr = `max(1.0,1.025-0.025*on/${frames})`
    xExpr = `iw/2-(iw/zoom/2)`
    yExpr = `ih/2-(ih/zoom/2)`
    eqFilter = 'eq=brightness=0.03:saturation=1.10:contrast=1.04'
  } else if (role === 'product_closeup') {
    zoomExpr = `min(1.035,1+0.035*on/${frames})`
    xExpr = `(iw-iw/zoom)*0.55*on/${frames}`
    yExpr = `ih/2-(ih/zoom/2)`
    eqFilter = 'eq=saturation=1.12:contrast=1.05:brightness=0.02'
  } else if (role === 'resolution') {
    zoomExpr = `max(1.0,1.025-0.025*on/${frames})`
    xExpr = `iw/2-(iw/zoom/2)`
    yExpr = `ih/2-(ih/zoom/2)+2*on/${frames}`
    eqFilter = 'eq=brightness=0.03:saturation=1.10:contrast=1.03'
  } else if (role === 'cta') {
    zoomExpr = `min(1.03,1+0.03*on/${frames})`
    xExpr = `iw/2-(iw/zoom/2)`
    yExpr = `ih/2-(ih/zoom/2)`
    eqFilter = 'eq=brightness=0.03:saturation=1.08:contrast=1.04'
  } else {
    zoomExpr = `min(1.025,1+0.025*on/${frames})`
    xExpr = `iw/2-(iw/zoom/2)`
    yExpr = `ih/2-(ih/zoom/2)`
    eqFilter = ''
  }
  eqFilter = UNIFIED_GRADE

  const vfParts = [
    `scale=${w}:${h}:force_original_aspect_ratio=increase`,
    `crop=${w}:${h}`,
    `zoompan=z='${zoomExpr}':x='${xExpr}':y='${yExpr}':d=${frames}:s=${w}x${h}:fps=24`,
    ...(eqFilter ? [eqFilter] : []),
    'format=yuv420p',
  ]

  return new Promise((resolve, reject) => {
    ffmpeg(imagePath)
      .inputOptions(['-loop', '1'])
      .outputOptions([
        '-t', `${duration}`,
        '-vf', vfParts.join(','),
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-pix_fmt', 'yuv420p',
        '-r', '24',
        '-an',
        '-movflags', '+faststart',
      ])
      .output(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', (err) => reject(err))
      .run()
  })
}


function createVisualFallbackFrame(outputPath, aspectRatio = '9:16') {
  const { w, h } = VIDEO_SIZE_BY_ASPECT[aspectRatio] || VIDEO_SIZE_BY_ASPECT['9:16']
  const vf = [
    `drawbox=x=0:y=0:w=${w}:h=${h}:color=0x101010@1:t=fill`,
    `drawbox=x=0:y=${Math.round(h * 0.56)}:w=${w}:h=${Math.round(h * 0.44)}:color=0x202020@0.92:t=fill`,
    `drawbox=x=${Math.round(w * 0.12)}:y=${Math.round(h * 0.2)}:w=${Math.round(w * 0.76)}:h=${Math.round(h * 0.48)}:color=0x2f2f2f@0.45:t=fill`,
    UNIFIED_GRADE,
    'format=rgb24',
  ].join(',')

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(`color=c=0x080810:s=${w}x${h}:d=1`)
      .inputFormat('lavfi')
      .outputOptions(['-frames:v', '1', '-vf', vf])
      .output(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', (err) => reject(err))
      .run()
  })
}


// ─────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────
// STEP 5: Generate Voiceover via ElevenLabs
// ─────────────────────────────────────────────────────
// Cache for phonetic conversions to avoid redundant Gemini calls
const phoneticCache = new Map()

async function phoneticRomanize(text, langCode, langName) {
  const cacheKey = `${langCode}:${text}`
  if (phoneticCache.has(cacheKey)) return phoneticCache.get(cacheKey)

  // Language-specific example pairs so the model knows the exact style target
  const langExamples = {
    gu: [
      ['એન્જિનિયર સાહેબ, આ Tata Tiscon થોડું મોંઘું નથી પડતું?', 'engineer saaheb, aa Tata Tiscon thodu monghu nathi padtu?'],
      ['શેઠ, તમે દોઢ લાખનો iPhone લીધો ત્યારે 5 હજારનું મોંઘું cover કેમ લીધું? સસ્તું પણ મળતું હતું ને!', 'sheth, tame dodh laakhno iPhone lidho tyaare 5 hazaarnu monghu cover kem lidhu? sastu pan maltu hatu ne!'],
      ['અરે સાહેબ, ફોન surakshit રેહવો જોઈએ ને!', 'are saaheb, phone surakshit rehvo joiye ne!'],
    ],
    hi: [
      ['मेरे सामने वाले uncle रोज़ अपने scooter की सफ़ाई करते थे।', 'Mere samne wale uncle roz apne scooter ki safaee karte the.'],
      ['Uncle tension में आ गये।', 'Uncle tension mein aa gaye.'],
      ['मैंने Paragon guards suggest किये — front, side, bumper. All-round protection.', 'Maine Paragon guards suggest kiye — front, side, bumper. All-round protection.'],
      ['क्योंकि असली protection polish से नहीं, Paragon से होती है।', 'Kyunki asli protection polish se nahi, Paragon se hoti hai.'],
    ],
  }
  const examples = langExamples[langCode] || []
  const exampleBlock = examples.length
    ? `\n\nEXAMPLES (input → correct output):\n` + examples.map(([a, b]) => `Input: ${a}\nOutput: ${b}`).join('\n\n')
    : ''

  const prompt = `You are a phonetic transliteration specialist for Indian regional language TTS.

Convert the ${langName || langCode} text below into natural romanized form that an ElevenLabs multilingual voice will speak with correct ${langName || langCode} pronunciation.

CRITICAL RULES:
1. ENGLISH WORDS STAY ENGLISH: Words like scooter, uncle, tension, parking, scratch, office, market, highway, traffic, squeeze, jump, fly, guard, style, safety, confidence, promise, engineering, legacy, protection, suggest, worry, polish, front, side, bumper, round, long, ride, all, one, tight, free MUST be spelled exactly as normal English. NEVER phonetically mangle them (e.g. write "scooter" not "skootur", write "uncle" not "ankul").
2. HINDI/GUJARATI WORDS: Write them in simple, natural romanization that sounds correct when read aloud:
   - Use "aa" for long आ (e.g. "raat", "shaam", "raasta")
   - Use "ee" for long ई (e.g. "bheed", "safaee")
   - Use "oo" for long ऊ (e.g. "bhool")
   - Schwa vowels: keep natural (e.g. "subah", "dopahar", "shehar")
   - Aspirated consonants: "bh", "kh", "gh", "th", "dh", "ph"
   - Nasals: keep as "n" or "m" naturally
3. Brand names stay unchanged: Tata Tiscon, Paragon, Porsche 911 GT3 RS, iPhone
4. Keep punctuation: ? ! , . —
5. Do NOT add explanation. Return ONLY the romanized text.${exampleBlock}

TEXT:
${text}

OUTPUT:`.trim()

  try {
    const result = await callOpenAI(prompt, text, [])
    const romanized = String(result || '')
      .trim()
      .replace(/^["']|["']$/g, '')
      .replace(/^(OUTPUT|ROMANIZED OUTPUT|Output)[:\s]*/i, '')
      .trim()

    if (romanized && romanized.length > 2 && !/[\u0900-\u0AFF\u0A80-\u0AFF]/.test(romanized.slice(0, 5))) {
      console.log(`[server] Phonetic: "${romanized.slice(0, 100)}"`)
      phoneticCache.set(cacheKey, romanized)
      return romanized
    }
  } catch (err) {
    console.warn('[server] Phonetic romanization Gemini error:', err.message)
  }
  console.warn('[server] Phonetic romanization failed, sending raw text')
  return text
}


// ─────────────────────────────────────────────────────────────────────────────
// Deterministic pronunciation dictionary for Gujarati/Hindi romanized words.
// Applied AFTER Gemini romanization to guarantee correct ElevenLabs output.
// Key = what Gemini (or the user) writes, Value = what ElevenLabs should read.
// ─────────────────────────────────────────────────────────────────────────────
const GUJARATI_PRONUNCIATION_MAP = [
  // ── The user's reported list ──────────────────────────────────────────────
  [/\bmonghu\b/gi,    'monghun'],      // มอ heavy nasal ending
  [/\bmonghun\b/gi,   'monghun'],      // already correct — keep
  [/\bnathi\b/gi,     'nuthee'],       // short-a + long-ee
  [/\bpadtu\b/gi,     'pudtun'],       // schwa + nasal
  [/\bpadtun\b/gi,    'pudtun'],
  [/\btame\b/gi,      'tumeh'],        // NOT English "tame" (game/fame)
  [/\blidho\b/gi,     'leedho'],       // long-ee
  [/\blidhu\b/gi,     'leedhun'],      // long-ee + nasal
  [/\bleedhu\b/gi,    'leedhun'],
  [/\bsastu\b/gi,     'sustun'],       // short-a becomes schwa
  [/\bsastu\b/gi,     'sustun'],
  [/\bsastun\b/gi,    'sustun'],
  [/\b(?:pan|pun)\b/gi, 'pun'],        // NOT English "pan" (the frying pan)
  [/\bmaltu\b/gi,     'multun'],       // schwa vowel
  [/\bmadtu\b/gi,     'mudtun'],
  [/\bmultun\b/gi,    'multun'],
  [/\bhatu\b/gi,      'haatun'],       // long-aa + nasal
  [/\bhaatu\b/gi,     'haatun'],
  [/\b(?:ne|neh)\b/gi,'neh'],          // short "neh", not English "nee"
  [/\b(?:arre|are)\b/gi, 'ureh'],      // soft exclamation, schwa start
  [/\bsurakshit\b/gi, 'suraakshit'],   // long aa
  [/\bsurkshit\b/gi,  'suraakshit'],
  [/\bjoiye\b/gi,     'joiye'],        // keep as-is — already correct
  [/\b(?:bas|bass|bus)\b/gi, 'bus'],   // NOT English "bass" (music)
  [/\bto\b/gi,        'toh'],          // NOT English "to"
  [/\btoh\b/gi,       'toh'],          // already correct
  [/\btamare\b/gi,    'tumaare'],
  [/\btamara\b/gi,    'tumaara'],
  [/\bghar\b/gi,      'ghur'],         // NOT "gar" — hard gh + schwa
  [/\b(?:ane|une)\b/gi,'une'],         // NOT English "ane" (rhymes with "lane")
  [/\bparivar\b/gi,   'purivaar'],     // schwa + long aa
  [/\bparivaar\b/gi,  'purivaar'],
  [/\bpurivaar\b/gi,  'purivaar'],     // already correct
  [/\bni\b/gi,        'nee'],          // possessive — long ee
  [/\bsuraksha\b/gi,  'suraaksha'],    // long aa
  [/\bsuraaksha\b/gi, 'suraaksha'],    // already correct
  // ── Additional common Gujarati words that ElevenLabs mispronounces ─────────
  [/\bchhe\b/gi,      'chheh'],        // "is" — not "chee" or "ch-hee"
  [/\bkaro\b/gi,      'kuro'],         // imperative, schwa vowel
  [/\bnakaro\b/gi,    'nukuro'],
  [/\bkaru\b/gi,      'kurun'],
  [/\bmate\b/gi,      'maate'],        // NOT English "mate"
  [/\bmaate\b/gi,     'maate'],        // already correct
  [/\bjyaare\b/gi,    'jyaare'],       // keep as-is
  [/\btyaare\b/gi,    'tyaare'],       // keep as-is
  [/\bbaandhchhod\b/gi, 'baandhchhod'], // keep as-is
  [/\bkevun\b/gi,     'kevun'],
  [/\bkemi\b/gi,      'kemee'],
  [/\bkem\b/gi,       'kem'],
  [/\bthay\b/gi,      'thuy'],         // becomes "thuy" not "they"
  [/\bthai\b/gi,      'thuy'],
  [/\bhoy\b/gi,       'hoy'],          // keep as-is
  [/\bvaat\b/gi,      'vaat'],         // keep as-is
  [/\bsaaheb\b/gi,    'saaheb'],       // already correct
  [/\bsheth\b/gi,     'sheth'],        // already correct
  [/\blaakh\b/gi,     'laakh'],        // already correct
  [/\bhuzaar\b/gi,    'huzaar'],       // already correct
  [/\bhazar\b/gi,     'huzaar'],
  [/\bengineer\b/gi,  'injineer'],     // Indian English "injineer"
  [/\binjineer\b/gi,  'injineer'],     // already correct

  // ── Missing Gujarati words from user scripts ─────────────────────────
  [/\bnu\b/gi,        'nun'],          // nu  → nasal possessive ending
  [/\bje\b/gi,        'jeh'],          // જે  → "jeh" (which/that)
  [/\btene\b/gi,      'teneh'],        // તેને → "teneh" (to it)
  [/\be\b/gi,         'eh'],           // એ  → "eh" Gujarati demonstrative
  [/\brehvo\b/gi,     'rehvoh'],       // રેહવો → "rehvoh"
  [/\brakhse\b/gi,    'rakhsheh'],     // રાખશે → "rakhsheh"
  [/\baajivan\b/gi,   'aajeevun'],     // આજીવન → "aajeevun"
  [/\blaiye\b/gi,     'laiyeh'],       // લઈએ → "laiyeh"
  [/\bchhiye\b/gi,    'chhiyeh'],      // છીએ → "chhiyeh"
  [/\baapde\b/gi,     'aapdeh'],       // આપડે → "aapdeh" (we/our)
  [/\bvastu\b/gi,     'vastoo'],       // વસ્તુ → "vastoo"
  [/\bshahab\b/gi,    'saaheb'],       // variant spelling
  [/\bmonghi\b/gi,    'monghee'],      // મોંઘી → "monghee"
  [/\bthodu\b/gi,     'thodun'],       // થોડું → "thodun"
  [/\bthodi\b/gi,     'thodee'],       // થોડી → "thodee"
  [/\bnahi\b/gi,      'nahee'],        // નહિ/નહીં → "nahee"
]

// ─────────────────────────────────────────────────────────────────────────────
// Hindi Hinglish Collision Map
// These are Hindi words written in Roman/Latin script that LOOK EXACTLY like
// English words. ElevenLabs reads them with English pronunciation by default.
// We remap them to phonetically unambiguous spellings so the TTS reads them
// with the correct Hindi sound.
//
// Format: [regex with word boundary, phonetic replacement]
// Applied ONLY for Hindi (hi) language code.
// ─────────────────────────────────────────────────────────────────────────────
const HINDI_HINGLISH_COLLISION_MAP = [
  // ── Pronouns ────────────────────────────────────────────────────────────────
  [/\buse\b/gi,      'usay'],    // उसे  → "usay"  (NOT English "you-z")
  [/\bise\b/gi,      'isay'],    // इसे  → "isay"
  [/\bwo\b/gi,       'woh'],     // वो   → "woh"   (NOT "woe")
  [/\bwoh\b/gi,      'woh'],     // already correct
  [/\byeh\b/gi,      'yeh'],     // यह   → already ok but reinforce
  [/\bham\b/gi,      'hum'],     // हम   → "hum"   (NOT English "ham")
  [/\bhum\b/gi,      'hum'],     // already correct
  [/\btum\b/gi,      'tum'],     // तुम  → already fine phonetically
  [/\bap\b/gi,       'aap'],     // आप   → "aap"   (NOT "app")
  [/\baap\b/gi,      'aap'],     // already correct
  [/\bmere\b/gi,     'meray'],   // मेरे  → "meray" (NOT English "mere" = only/just)
  [/\bmera\b/gi,     'mera'],    // मेरा  → phonetically fine
  [/\bmeri\b/gi,     'meree'],   // मेरी  → "meree" long-ee
  [/\btera\b/gi,     'tera'],    // तेरा  → ok
  [/\bteri\b/gi,     'teree'],   // तेरी  → "teree"
  [/\btere\b/gi,     'teray'],   // तेरे  → "teray"
  [/\bhum\b/gi,      'hum'],     // हम

  // ── Common particles & postpositions ────────────────────────────────────────
  [/\bhi\b/gi,       'hee'],     // ही   → "hee"   (NOT English "hi" greeting)
  [/\bna\b/gi,       'naa'],     // ना   → "naa"   (NOT English "na" = not applicable)
  [/\bna,\b/gi,      'naa,'],    // ना,  with comma
  [/\bna\./gi,       'naa.'],    // ना.
  [/\bna\?/gi,       'naa?'],    // ना?
  [/\bna!/gi,        'naa!'],    // ना!
  [/\bpar\b/gi,      'purr'],    // पर   → "purr"
  [/\bse\b/gi,       'say'],     // से   → "say"   (NOT English "se")
  [/\bne\b/gi,       'nay'],     // ने   → "nay"   (NOT English "ne" or "knee")
  [/\bke\b/gi,       'kay'],     // के   → "kay"   (NOT English "key" sound)
  [/\bko\b/gi,       'koh'],     // को   → "koh"   (NOT "coe")
  [/\bka\b/gi,       'kaa'],     // का   → "kaa"   (NOT English "ka")
  [/\bki\b/gi,       'kee'],     // की   → "kee"   (NOT English "ki")
  [/\bjo\b/gi,       'joh'],     // जो   → "joh"   (NOT "joe")
  [/\bin\b/gi,       'inn'],     // इन   → "inn"   (NOT English "in" preposition accent)
  [/\bab\b/gi,       'ub'],      // अब   → "ub"    (NOT "ab" as in muscles)
  [/\bho\b/gi,       'hoh'],     // हो   → "hoh"   (NOT English "ho")
  [/\bhai\b/gi,      'hay'],     // है   → "hay"   (NOT "high" or "hi")
  [/\bhain\b/gi,     'hayn'],    // हैं  → "hayn"  (NOT English rhyme)
  [/\btha\b/gi,      'thaa'],    // था   → "thaa"  long-aa
  [/\bthi\b/gi,      'thee'],    // थी   → "thee"  (NOT English "thee" the article)
  [/\bthe\b/gi,      'thay'],    // थे   → "thay"  (NOT English "the")
  [/\bdo\b/gi,       'doh'],     // दो   → "doh"   (NOT English "do" = perform)
  [/\bmat\b/gi,      'mut'],     // मत   → "mut"   (NOT English "mat")
  [/\bman\b/gi,      'mun'],     // मन   → "mun"   (NOT English "man")
  [/\bban\b/gi,      'bun'],     // बन   → "bun"   (NOT English "ban" = prohibit)
  [/\bbar\b/gi,      'baar'],    // बार  → "baar"  (NOT English "bar")
  [/\bsub\b/gi,      'sub'],     // सब   → "sub"   hmm, actually Hinglish "sab" = all
  [/\bsab\b/gi,      'sub'],     // सब   → "sub"   (same schwa vowel)
  [/\bek\b/gi,       'eck'],     // एक   → "eck"   (NOT "eek")
  [/\bfir\b/gi,      'fir'],     // फिर  → fine phonetically
  [/\bphir\b/gi,     'fir'],     // फिर  → "fir"   (ph → f)
  [/\bagar\b/gi,     'ugur'],    // अगर  → "ugur"  schwa
  [/\bjab\b/gi,      'jub'],     // जब   → "jub"   (NOT English "jab" = punch)
  [/\bjub\b/gi,      'jub'],     // already correct
  [/\btab\b/gi,      'tub'],     // तब   → "tub"   (NOT English "tab")
  [/\byahan\b/gi,    'yahaan'],  // यहाँ → "yahaan" long-aa
  [/\bwahan\b/gi,    'wahaan'],  // वहाँ → "wahaan"
  [/\bkab\b/gi,      'kub'],     // कब   → "kub"   (NOT English "cab")
  [/\bkaise\b/gi,    'kaysay'],  // कैसे → "kaysay"
  [/\bkyu\b/gi,      'kyoo'],    // क्यू → "kyoo"
  [/\bkyun\b/gi,     'kyoon'],   // क्यों → "kyoon"
  [/\bkyon\b/gi,     'kyoon'],   // क्यों → "kyoon"
  [/\bkya\b/gi,      'kyaa'],    // क्या → "kyaa"  long-aa
  [/\baur\b/gi,      'or'],      // और   → "or"    (actually close enough)
  [/\bnahi\b/gi,     'nahee'],   // नहीं → "nahee" long-ee
  [/\bnhee\b/gi,     'nahee'],
  [/\bhaan\b/gi,     'haan'],    // हाँ  → "haan"  (NOT "haan" English = nothing, keep as haan)
  [/\bhan\b/gi,      'haan'],    // हाँ  (short form)
  [/\bkaro\b/gi,     'kuroh'],   // करो  → "kuroh" (NOT English "caro" = dear)
  [/\bkarna\b/gi,    'kurnaa'],  // करना → "kurnaa"
  [/\bkarta\b/gi,    'kurtaa'],  // करता → "kurtaa"
  [/\bkarte\b/gi,    'kurtay'],  // करते → "kurtay"
  [/\bjao\b/gi,      'jaoh'],    // जाओ  → "jaoh"
  [/\bjaao\b/gi,     'jaoh'],
  [/\baao\b/gi,      'aaoh'],    // आओ   → "aaoh"
  [/\bpas\b/gi,      'paas'],    // पास  → "paas"  long-aa (NOT English "pass")
  [/\bpaas\b/gi,     'paas'],    // already correct
  [/\bliye\b/gi,     'liyay'],   // लिए  → "liyay"
  [/\bsath\b/gi,     'saath'],   // साथ  → "saath" long-aa
  [/\bsaath\b/gi,    'saath'],   // already correct
  [/\bage\b/gi,      'aagay'],   // आगे  → "aagay" (NOT English "age")
  [/\bpiche\b/gi,    'peechay'], // पीछे → "peechay"
  [/\bupar\b/gi,     'oopur'],   // ऊपर  → "oopur"
  [/\bneeche\b/gi,   'neechay'], // नीचे → "neechay"
  [/\bghar\b/gi,     'ghurr'],   // घर   → "ghurr"


  // ── HIGH-PRIORITY: Most common Hinglish words colliding with English ────────
  [/\bmein\b/gi,     'mayn'],     // में
  [/\bpe\b/gi,       'pay'],      // पे
  [/\b(?:wale|waale)\b/gi, 'waalay'], // वाले
  [/\bwali\b/gi,     'waalee'],   // वाली
  [/\bhar\b/gi,      'hurr'],     // हर   → "hurr"
  [/\btak\b/gi,      'tuck'],     // तक   → "tuck"
  [/\balag\b/gi,     'alug'],     // अलग  → "alug"
  [/\braat\b/gi,     'raat'],     // रात
  [/\bshor\b/gi,     'shohr'],    // शोर
  [/\bmod\b/gi,      'modd'],     // मोड़
  [/\ble\b/gi,       'lay'],      // ले   → "lay"   (NOT "lee" or "le")
  [/\bde\b/gi,       'day'],      // दे   → "day"   (NOT "dee" or French "de")
  [/\bkarle\b/gi,    'kurlay'],   // कर ले → "kurlay"
  [/\bkar\s+le\b/gi, 'kurlay'],   // कर ले with space
  [/\bbana\b/gi,     'bunaa'],    // बना  → "bunaa"  schwa
  [/\bbane\b/gi,     'bunay'],    // बने  → "bunay"
  [/\blaga\b/gi,     'lugaa'],    // लगा  → "lugaa"  schwa
  [/\blage\b/gi,     'lugay'],    // लगे  → "lugay"
  [/\bnaya\b/gi,     'nuyaa'],    // नया  → "nuyaa"
  [/\bnaye\b/gi,     'nuyay'],    // नए   → "nuyay"
  [/\bdikhta\b/gi,   'dikhtaa'],  // दिखता → "dikhtaa"
  [/\bdikhti\b/gi,   'dikhtee'],  // दिखती → "dikhtee"
  [/\bdikhte\b/gi,   'dikhtay'],  // दिखते → "dikhtay"
  [/\bkarti\b/gi,    'kurtee'],   // करती → "kurtee"
  [/\bkaam\b/gi,     'kaam'],     // काम  → long-aa, reinforce
  [/\bguzarta\b/gi,  'guzurtaa'], // गुज़रता → "guzurtaa"
  [/\bsunti\b/gi,    'suntee'],   // सुनती → "suntee"
  [/\bsunte\b/gi,    'suntay'],   // सुनते → "suntay"
  [/\bbhul\b/gi,     'bhool'],    // भूल  → "bhool" long-oo
  [/\bwahi\b/gi,     'wahee'],    // वही  → "wahee"  (NOT "wah-hee")
  [/\btumhara\b/gi,  'tumhaara'], // तुम्हारा → "tumhaara"
  [/\btumhari\b/gi,  'tumhaaree'],// तुम्हारी → "tumhaaree"
  [/\bsubah\b/gi,    'subuh'],    // सुबह → "subuh"  (morning — NOT "sue-bah")
  [/\bdopahar\b/gi,  'dohpuhr'], // दोपहर → "dohpuhr"
  [/\bshaam\b/gi,    'shaam'],    // शाम  → "shaam"  long-aa (evening)
  [/\bbheed\b/gi,    'bheed'],    // भीड़  → "bheed"  long-ee (crowd)
  [/\braasta\b/gi,   'raastaa'], // रास्ता → "raastaa" long-aa
  [/\braaste\b/gi,   'raastay'], // रास्ते → "raastay"
  [/\braftaar\b/gi,  'ruftaar'], // रफ्तार → "ruftaar"
  [/\bkhamoshi\b/gi, 'khaamoshee'], // खामोशी → "khaamoshee"
  [/\bshehar\b/gi,   'shehur'],  // शहर  → "shehur"
  [/\bhausla\b/gi,   'hawslaa'], // हौसला → "hawslaa"
  [/\bkhali\b/gi,    'khaalee'], // खाली → "khaalee"  long-aa (empty)
  [/\bduniya\b/gi,   'duniyaa'], // दुनिया → "duniyaa"
  [/\bawaaz\b/gi,    'aawaaz'],  // आवाज़ → "aawaaz"  long-aa
  [/\bjunoon\b/gi,   'junoon'],  // जुनून → "junoon"  (passion)
  [/\bbaje\b/gi,     'bujay'],   // बजे  → "bujay"    (o'clock — NOT "baj")
]

function fixIndianPronunciation(text, langCode) {
  if (langCode !== 'gu' && langCode !== 'hi') return text
  let result = text
  // Apply Gujarati-specific fixes
  if (langCode === 'gu') {
    for (const [pattern, replacement] of GUJARATI_PRONUNCIATION_MAP) {
      result = result.replace(pattern, replacement)
    }
  }
  // Apply Hindi Hinglish collision fixes (English words that are actually Hindi)
  if (langCode === 'hi') {
    for (const [pattern, replacement] of HINDI_HINGLISH_COLLISION_MAP) {
      result = result.replace(pattern, replacement)
    }
  }
  return result
}

async function polishVoiceoverForTts(text, langCode) {
  if (langCode !== 'hi' && langCode !== 'gu') return text

  const target = langCode === 'gu'
    ? 'natural spoken Gujarati in Gujarati script'
    : 'natural spoken Hindi in Devanagari script'
  const guardrails = langCode === 'gu'
    ? [
      '- Use pure Gujarati sentence flow, not Hindi grammar.',
      '- Use Gujarati words like "ને", "માટે", "જોઈએ", "પણ", "મળતું" where appropriate.',
      '- Do not output Devanagari or romanized Gujarati, except English brand/product words.',
    ].join('\n')
    : [
      '- Use natural Hindi sentence flow, not Gujarati grammar.',
      '- Do not output romanized Hindi, except English brand/product words.',
    ].join('\n')

  try {
    const polished = await callOpenAI(
      `You are a native Indian commercial voiceover dialogue editor.
Rewrite the line for fluent TTS delivery in ${target}.

Rules:
- Preserve the exact meaning, product claims, brand names, and ad tone.
- Keep English words that Indians naturally say in English in Latin script: scooter, uncle, tension, parking, scratch, protection, guards, front, side, bumper, all-round, free, style, safety, promise, engineering.
- Keep brand/product names in Latin script.
- Keep the line concise enough for the scene timing.
${guardrails}
- Return ONLY the final voiceover line. No explanation.`,
      `Voiceover line:\n${text}`
    )
    const cleaned = String(polished || '').trim().replace(/^["']|["']$/g, '')
    if (cleaned.length > 2) return cleaned
  } catch (err) {
    console.warn(`[server] ${langCode} voiceover polish failed, using existing text:`, err.message)
  }

  return text
}

async function generateVoiceover(text, outputPath, language) {
  const isIndian = isIndianLanguage(language)
  const code    = typeof language === 'object' ? (language?.code || 'en') : (language || 'en')
  const langName = typeof language === 'object' ? (language?.name || code) : code
  const gender  = typeof language === 'object' ? language?.gender : null
  const voiceId = ELEVENLABS_VOICE_ID(code, gender)

  // 1. Basic text cleanup
  let spokenText = String(text || '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')  // zero-width chars
    .replace(/[◈◆◇]/g, '')                  // decorators
    .replace(/₹/g, ' rupees ')
    .replace(/\s+/g, ' ')
    .trim()

  // 2. Language-specific text processing strategy
  //    - HINDI: Send Devanagari directly to ElevenLabs eleven_turbo_v2_5
  //      The multilingual model handles Hindi natively — romanization + collision maps
  //      actually HURT pronunciation by introducing English phonetic artifacts.
  //    - GUJARATI: The custom Gujarati voice needs romanized Latin input,
  //      so we romanize and apply the Gujarati collision map.
  //    - OTHER: Leave as-is for the multilingual model to handle.

  const isHindi = code === 'hi'
  const isGujarati = code === 'gu'
  const hasNativeScript = /[\u0900-\u0DFF]/.test(spokenText)
  const isLatin = !hasNativeScript

  if (isHindi) {
    // HINDI STRATEGY: Convert to Devanagari if not already, then send directly
    if (isLatin) {
      // Text is in Hinglish (romanized) — convert to Devanagari for native pronunciation
      console.log(`[server] Converting Hinglish to Devanagari for native TTS...`)
      try {
        const sysPrompt = `You are a Hindi language expert. Convert the following Hinglish (romanized Hindi) text into proper Hindi using Devanagari script. Return ONLY the converted text. Keep English brand names and English words like "scooter", "uncle", "tension", "parking", "scratch", "protection", "guard", "front", "side", "bumper" in English. Keep punctuation intact.`
        const converted = await callOpenAI(sysPrompt, spokenText, [])
        if (converted && converted.trim().length > 3 && /[\u0900-\u097F]/.test(converted)) {
          spokenText = converted.trim()
          console.log(`[server] Converted to Devanagari: "${spokenText.slice(0, 80)}"`)
        }
      } catch (err) {
        console.warn(`[server] Devanagari conversion failed, using Hinglish as-is:`, err.message)
      }
    }
    // Do NOT apply collision maps or romanization for Hindi — send Devanagari directly
    console.log(`[server] Hindi: sending Devanagari directly to multilingual model`)

  } else if (isGujarati) {
    // GUJARATI STRATEGY: Send native Gujarati script directly to ElevenLabs multilingual model.
    // The romanize + collision map approach was causing severe mispronunciations
    // (tested: native speaker scored it 2/10). ElevenLabs' eleven_turbo_v2_5
    // handles Gujarati natively — same proven approach as Hindi.
    if (isLatin) {
      // Text is in romanized Gujarati — convert to native Gujarati script
      console.log(`[server] Converting romanized Gujarati to native Gujarati script...`)
      try {
        const sysPrompt = `You are a native Gujarati language expert. Convert the following romanized Gujarati text into proper Gujarati using the Gujarati script (ગુજરાતી લિપિ).

CRITICAL RULES:
- Return ONLY the converted Gujarati script text. No explanation.
- Keep English brand names (like "Tata Tiscon", "iPhone", etc.) in English.
- Keep English technical terms in English.
- Use correct Gujarati grammar — do NOT use Hindi grammar patterns.
- Use proper Gujarati words: "ને" not "ना", "માટે" not "के लिए", "જોઈએ" not "चाहिए", "પણ" not "भी".
- Use correct gender forms: "મોંઘું" (neuter) not "મોંઘા/મોંઘો" for neuter nouns.
- Numbers should be in Gujarati words: "પાંચસો પચાસ" not "five so pachas".
- Ensure the unique Gujarati consonant "ળ" is used where needed (e.g., "મળતું" not "મિલતું").
- Keep punctuation intact.`
        const converted = await callOpenAI(sysPrompt, spokenText, [])
        if (converted && converted.trim().length > 3 && /[\u0A80-\u0AFF]/.test(converted)) {
          spokenText = converted.trim()
          console.log(`[server] Converted to native Gujarati: "${spokenText.slice(0, 80)}"`)
        }
      } catch (err) {
        console.warn(`[server] Gujarati script conversion failed, using romanized as-is:`, err.message)
      }
    }
    // Do NOT apply collision maps or romanization — send Gujarati script directly
    console.log(`[server] Gujarati: sending native script directly to multilingual model`)

  } else if (isIndian && hasNativeScript) {
    // Other Indian languages: send native script directly to multilingual model
    console.log(`[server] ${langName}: sending native script directly to multilingual model`)
  }

  // 4. Voice settings — tuned for natural, human-like Indian commercial delivery
  //    Higher stability = less robotic warble, higher similarity = stays closer to voice clone
  //    Lower style = less exaggerated "AI announcer" effect
  if (isHindi || isGujarati) {
    spokenText = await polishVoiceoverForTts(spokenText, code)
  }

  const voiceSettings = isGujarati
    ? { stability: 0.40, similarity_boost: 0.85, style: 0.50, use_speaker_boost: true }
    : isHindi
      ? { stability: 0.45, similarity_boost: 0.82, style: 0.48, use_speaker_boost: true }
      : isIndian
        ? { stability: 0.48, similarity_boost: 0.80, style: 0.45, use_speaker_boost: true }
        : { stability: 0.65, similarity_boost: 0.80, style: 0.10, use_speaker_boost: true }

  console.log(`[server] ElevenLabs TTS | voiceId=${voiceId} | lang=${code} | gender=${gender||'male'} | text: ${spokenText.slice(0, 80).replace(/\n/g, ' ')}`)

  const res = await axios.post(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      text: spokenText,
      model_id: 'eleven_turbo_v2_5',
      voice_settings: voiceSettings,
      apply_text_normalization: 'auto',
    },
    {
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY(),
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
      },
      responseType: 'arraybuffer',
      timeout: 120000,
    }
  )

  await fsp.writeFile(outputPath, Buffer.from(res.data))
  return outputPath
}

// Transliterate native Indian script to romanized English
// This lets ElevenLabs read phonetically with the correct voice accent
function transliterateToRoman(text, langCode) {
  // Gujarati character → roman phonetic map
  const gujaratiMap = {
    'અ':'a','આ':'aa','ઇ':'i','ઈ':'ee','ઉ':'u','ઊ':'oo','એ':'e','ઐ':'ai','ઓ':'o','ઔ':'au',
    'ક':'k','ખ':'kh','ગ':'g','ઘ':'gh','ચ':'ch','છ':'chh','જ':'j','ઝ':'jh',
    'ટ':'t','ઠ':'th','ડ':'d','ઢ':'dh','ણ':'n',
    'ત':'t','થ':'th','દ':'d','ધ':'dh','ન':'n',
    'પ':'p','ફ':'f','બ':'b','ભ':'bh','મ':'m',
    'ય':'y','ર':'r','લ':'l','વ':'v','શ':'sh','ષ':'sh','સ':'s','હ':'h','ળ':'l',
    'ા':'aa','િ':'i','ી':'ee','ુ':'u','ૂ':'oo','ે':'e','ૈ':'ai','ો':'o','ૌ':'au',
    'ં':'n','ઃ':'h','્':'','ૃ':'ri','ૄ':'ree',
    '।':'.','॥':'.','!':'!','?':'?',',':',',
    '૦':'0','૧':'1','૨':'2','૩':'3','૪':'4','૫':'5','૬':'6','૭':'7','૮':'8','૯':'9',
  }
  // Hindi/Devanagari character → roman phonetic map
  const hindiMap = {
    'अ':'a','आ':'aa','इ':'i','ई':'ee','उ':'u','ऊ':'oo','ए':'e','ऐ':'ai','ओ':'o','औ':'au',
    'क':'k','ख':'kh','ग':'g','घ':'gh','च':'ch','छ':'chh','ज':'j','झ':'jh',
    'ट':'t','ठ':'th','ड':'d','ढ':'dh','ण':'n',
    'त':'t','थ':'th','द':'d','ध':'dh','न':'n',
    'प':'p','फ':'f','ब':'b','भ':'bh','म':'m',
    'य':'y','र':'r','ल':'l','व':'v','श':'sh','ष':'sh','स':'s','ह':'h',
    'ा':'aa','ि':'i','ी':'ee','ु':'u','ू':'oo','े':'e','ै':'ai','ो':'o','ौ':'au',
    'ं':'n','ः':'h','्':'','ृ':'ri',
    '।':'.','॥':'.',
    '०':'0','१':'1','२':'2','३':'3','४':'4','५':'5','६':'6','७':'7','८':'8','९':'9',
  }
  const map = langCode === 'hi' ? hindiMap : gujaratiMap
  let result = ''
  for (const char of String(text || '')) {
    result += map[char] !== undefined ? map[char] : char
  }
  return result.replace(/\s+/g, ' ').trim()
}

function prepareTextForTTS(text) {
  return String(text || '')
    .replace(/[◈◆◇]/g, '')
    .replace(/&/g, ' and ')
    .replace(/%/g, ' percent ')
    .replace(/\+/g, ' plus ')
    .replace(/₹/g, ' rupees ')
    .replace(/\$/g, ' dollars ')
    .replace(/€/g, ' euros ')
    .replace(/°/g, ' degrees ')
    .replace(/\bAI\b/g, 'A I')
    .replace(/\bMP4\b/g, 'M P 4')
    .replace(/\b(\d+)x\b/gi, '$1 times')
    .replace(/\s*\/\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.!?])/g, '$1')
    .trim()
}

function prepareTextForTTSByLanguage(text, language) {
  const spoken = String(text || '')
    .replace(/[◈◆◇]/g, '')
    .replace(/[â—ˆâ—†â—‡]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.!?।،؛؟])/g, '$1')
    .trim()

  if (!isEnglishLanguage(language)) {
    return spoken
  }

  return prepareTextForTTS(spoken)
}

async function generateTimedVoiceoverSegment(jobId, scene, text, outputPath, language, options = {}) {
  const duration = Number(scene.duration_seconds) || VIDEO_CLIP_DURATION_SECONDS
  const rawOutputPath = outputPath.replace(/\.mp3$/i, '_raw.mp3')

  // Retry up to 3 times with backoff for ElevenLabs rate limit (409) errors
  const maxRetries = 3
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await generateVoiceover(text, rawOutputPath, language)
      const rawDuration = await getMediaDuration(rawOutputPath, duration)
      if (!options.deferNormalize) {
        await normalizeVoiceoverSegment(rawOutputPath, outputPath, Number(scene.duration_seconds) || duration, rawDuration)
      }
      return { outputPath, rawDuration }
    } catch (err) {
      if (err.message === 'CANCELLED') throw err
      const status = err.response?.status
      if ((status === 409 || status === 429) && attempt < maxRetries) {
        const waitMs = attempt * 3000 // 3s, then 6s
        console.warn(`Voiceover rate-limited (${status}) for scene ${scene.scene_number}, retrying in ${waitMs}ms (attempt ${attempt}/${maxRetries})`)
        await sleep(waitMs)
        continue
      }
      // Non-retryable error or final attempt
      console.warn(`Voiceover failed for scene ${scene.scene_number}:`, err.message)
      warnAndSkipService(
        jobId,
        'ElevenLabs voiceover',
        err.response?.data?.detail?.message || err.response?.data?.message || err.message || 'unknown error',
        'Using silent voiceover for this scene.'
      )
      await generateSilentAudio(outputPath, duration)
      return { outputPath, rawDuration: duration }
    }
  }
}

async function normalizeVoiceoverSegment(inputPath, outputPath, duration, measuredRawDuration = null) {
  const rawDuration = Number.isFinite(measuredRawDuration) ? measuredRawDuration : await getMediaDuration(inputPath, duration)

  console.log(`[server] VO normalize: raw=${rawDuration.toFixed(2)}s → scene=${duration}s`)

  const filters = []
  if (rawDuration > duration + 0.1) {
    // Voice runs over — speed up gently only as a last resort after duration rebalancing.
    const speedFactor = Math.min(1.03, rawDuration / duration)
    console.log(`[server] VO speeding up ${speedFactor.toFixed(2)}x to fit scene`)
    filters.push(...buildAtempoFilters(speedFactor))
  }
  // Pad silence to fill scene if voice is shorter — center the speech with breathing room
  // Add a small lead-in silence (0.3s) and let trailing silence fill the rest
  const leadSilence = 0.15
  filters.push(`adelay=${Math.round(leadSilence * 1000)}|${Math.round(leadSilence * 1000)}`, 'apad', `atrim=0:${duration}`, 'asetpts=PTS-STARTPTS')

  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .audioFilters(filters)
      .outputOptions([
        '-t', `${duration}`,
        '-c:a', 'libmp3lame',
        '-q:a', '3',      // VBR quality ~175kbps — varied file sizes, better quality
        '-ar', '44100',
        '-ac', '2',
      ])
      .output(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', (err) => reject(err))
      .run()
  })
}

async function shortenVoiceoverForDuration(text, scene, language, targetDuration) {
  const languageInfo = typeof language === 'string'
    ? normalizeLanguageInfo(language, text)
    : language
  const languageRules = buildVoiceoverLanguageRules(languageInfo)
  const maxWords = Math.max(4, Math.floor(Number(targetDuration || 3) * 2.1))

  try {
    const shortened = await callOpenAI(
      `You are a senior Indian ad voiceover editor.
Rewrite the voiceover so it fits naturally in ${targetDuration}s without sounding rushed.

Rules:
${languageRules}
- Keep the same meaning, same product claim, and same emotion.
- Make it shorter and punchier. Target ${maxWords} words or fewer.
- Keep brand/product names unchanged.
- Do not add new claims.
- Return ONLY the final voiceover line.`,
      `Scene role: ${scene.scene_role || scene.scene_type || ''}
Scene message: ${scene.key_message || ''}
Original voiceover:
${text}`
    )
    const cleaned = String(shortened || '').trim().replace(/^["']|["']$/g, '')
    if (cleaned.length > 2) {
      console.log(`[server] VO timing: shortened scene ${scene.scene_number || '?'} voiceover for ${targetDuration}s`)
      return cleaned
    }
  } catch (err) {
    console.warn(`[server] VO timing: shorten failed for scene ${scene.scene_number || '?'}:`, err.message)
  }

  return text
}

function buildAtempoFilters(speedFactor) {
  const filters = []
  let remaining = Math.max(0.5, speedFactor)

  while (remaining > 2) {
    filters.push('atempo=2')
    remaining /= 2
  }
  while (remaining < 0.5) {
    filters.push('atempo=0.5')
    remaining /= 0.5
  }

  filters.push(`atempo=${remaining.toFixed(4)}`)
  return filters
}

// ─────────────────────────────────────────────────────
// STEP 6: Generate Background Music via Suno AI
// Falls back to local FFmpeg synthesis if Suno is unavailable
// ─────────────────────────────────────────────────────
async function generateMusic(musicKeywords, mood, outputPath, totalDuration = 30, jobId = null) {
  // Try Suno first if API key is configured
  if (SUNO_API_KEY()) {
    try {
      console.log(`[server] Requesting Suno music (mood: ${mood}, duration: ${totalDuration}s)`)
      if (jobId) updateJob(jobId, { stepDetail: `Generating ${mood || 'cinematic'} background music with Suno...` })
      await generateSunoMusic(musicKeywords, mood, outputPath, totalDuration, jobId)
      return outputPath
    } catch (err) {
      if (err.message === 'CANCELLED') throw err
      console.warn(`[server] Suno failed (${err.message}), using royalty-free fallback music`)
      if (jobId) warnAndSkipService(jobId, 'Suno background music', err.message, 'Using royalty-free fallback music when available.')
    }
  }

  const fallbackPath = getFallbackMusicPath(mood, musicKeywords)
  if (fallbackPath) {
    console.log(`[server] Using fallback royalty-free music: ${fallbackPath}`)
    if (jobId) updateJob(jobId, { stepDetail: `Using fallback ${path.basename(fallbackPath)} music...` })
    return trimFallbackMusic(fallbackPath, outputPath, totalDuration)
  }

  console.warn('[server] No fallback music file found, using silence')
  if (jobId) warnAndSkipService(jobId, 'Background music', 'No Suno track or royalty-free fallback MP3 found.', 'Using silent background music.')
  return await generateSilentAudio(outputPath, totalDuration)
}

function getFallbackMusicPath(mood, musicKeywords) {
  const dir = path.resolve(process.cwd(), FALLBACK_MUSIC_DIR())
  if (!fs.existsSync(dir)) return null
  // Scan all MP3 files in the assets/music directory
  const allMp3 = fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.mp3'))
  if (allMp3.length === 0) return null
  // Pick a random track from available files
  const pick = allMp3[Math.floor(Math.random() * allMp3.length)]
  console.log(`[server] Fallback music: picked "${pick}" from ${allMp3.length} available tracks`)
  return path.join(dir, pick)
}

function trimFallbackMusic(inputPath, outputPath, duration) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .inputOptions(['-stream_loop', '-1'])
      .outputOptions([
        '-t', `${duration}`,
        '-c:a', 'libmp3lame',
        '-b:a', '192k',
        '-ar', '44100',
        '-ac', '2',
        '-af', `afade=t=in:st=0:d=0.4,afade=t=out:st=${Math.max(0, duration - 0.6)}:d=0.6`,
      ])
      .output(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', (err) => reject(err))
      .run()
  })
}

async function generateSunoMusic(musicBrief, mood, outputPath, totalDuration, jobId) {
  // musicBrief is now an object: { style, title, prompt }
  const style = typeof musicBrief === 'object' ? musicBrief.style : `${mood || 'cinematic'}, premium short-form ad, instrumental, modern, rhythmic, polished`
  const title = typeof musicBrief === 'object' ? musicBrief.title : 'Ad Score'

  console.log(`[server] Suno custom mode | style: ${style.slice(0, 100)}... | title: ${title}`)

  const res = await axios.post(
    `${SUNO_BASE_URL}/api/v1/generate`,
    {
      customMode: true,
      instrumental: true,
      model: 'V4_5ALL',
      style: style.slice(0, 1000),
      title: title.slice(0, 100),
      // callBackUrl is required by the API even in custom mode
      // We use a placeholder since we poll for status instead of waiting for callback
      callBackUrl: process.env.SUNO_CALLBACK_URL || process.env.PUBLIC_BASE_URL
        ? `${(process.env.SUNO_CALLBACK_URL || process.env.PUBLIC_BASE_URL).replace(/\/$/, '')}/api/suno/callback`
        : 'https://example.com/suno-callback',
    },
    {
      headers: { 'Authorization': `Bearer ${SUNO_API_KEY()}`, 'Content-Type': 'application/json' },
      timeout: 30000,
    }
  )

  const taskId = res.data?.data?.taskId || res.data?.taskId
  if (!taskId) throw new Error(res.data?.msg || res.data?.message || 'No Suno taskId returned')
  console.log(`[server] Suno taskId: ${taskId}`)

  // Poll every 10s — streamAudioUrl ready in ~30-40s, audioUrl in ~2-3min
  const maxAttempts = 20  // 200s max then fall back to royalty-free local MP3 or silence
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    checkCancel(jobId)
    await sleep(10000)

    const poll = await axios.get(`${SUNO_BASE_URL}/api/v1/generate/record-info`, {
      params: { taskId },
      headers: { 'Authorization': `Bearer ${SUNO_API_KEY()}`, 'Accept': 'application/json' },
      timeout: 15000,
    })

    const data = poll.data?.data || {}
    const status = data.status
    const sunoData = data.response?.sunoData || []
    const track = Array.isArray(sunoData) && sunoData[0]
    // Use streamAudioUrl first (ready in ~30s), fall back to audioUrl (~2-3min)
    const audioUrl = track?.streamAudioUrl || track?.audioUrl

    if (jobId) updateJob(jobId, { stepDetail: `Suno music: ${status || 'PENDING'} (${attempt * 10}s elapsed)` })
    console.log(`[server] Suno poll ${attempt}: status=${status} hasAudio=${audioUrl ? 'yes' : 'no'}`)

    if (audioUrl && (status === 'SUCCESS' || status === 'FIRST_SUCCESS')) {
      const audioRes = await axios.get(audioUrl, { responseType: 'arraybuffer', timeout: 120000 })
      await fsp.writeFile(outputPath, Buffer.from(audioRes.data))
      console.log(`[server] Suno music saved (${Math.round(audioRes.data.byteLength / 1024)}KB)`)
      return outputPath
    }
    if (status === 'CREATE_TASK_FAILED' || status === 'GENERATE_AUDIO_FAILED' || status === 'SENSITIVE_WORD_ERROR') {
      throw new Error(`Suno task failed: ${status} — ${data.errorMessage || ''}`)
    }
  }
  throw new Error('Suno timed out — falling back to local music')
}

// ─────────────────────────────────────────────────────
function generateSilentAudio(outputPath, duration) {
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input('anullsrc=r=44100:cl=stereo')
      .inputFormat('lavfi')
      .outputOptions(['-t', `${duration}`, '-c:a', 'libmp3lame', '-b:a', '128k', '-ar', '44100', '-ac', '2'])
      .output(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', (err) => reject(err))
      .run()
  })
}

function getSceneCarSfxType(scene, sceneIndex = 0) {
  const text = [
    scene?.scene_type,
    scene?.scene_description,
    scene?.key_message,
    scene?.motion_direction,
  ].join(' ').toLowerCase()

  const hasCar = /\b(car|vehicle|auto|automobile|suv|sedan|engine|wheel|road|drive|driving|garage|ignition)\b/.test(text)
  if (!hasCar) return 'none'

  if (sceneIndex === 0 || /\b(start|starting|starts|ignition|ignite|turns on|turn on|key|engine wakes|engine start|rev|revs|startup|launch)\b/.test(text)) {
    return 'car_start'
  }
  if (/\b(run|running|drive|driving|moving|road|highway|street|accelerate|acceleration|speed|cruise|cruising|wheels|motion|passes|travel)\b/.test(text)) {
    return 'car_running'
  }

  return 'none'
}

async function generateSceneSoundEffects(jobId, sceneData, tmpDir) {
  const sfxPaths = []

  for (let i = 0; i < sceneData.length; i++) {
    checkCancel(jobId)
    const scene = sceneData[i]
    const duration = normalizeSceneDuration(scene.duration_seconds)
    const sfxType = getSceneCarSfxType(scene, i)
    const sfxPath = path.join(tmpDir, `scene_${i + 1}_sfx.mp3`)
    await generateSceneSoundEffect(sfxType, sfxPath, duration)
    sfxPaths.push(sfxPath)
  }

  if (sfxPaths.length === 1) return sfxPaths[0]

  const combinedSfxPath = path.join(tmpDir, 'sound_effects.mp3')
  const filelistPath = path.join(tmpDir, 'sfx_filelist.txt')
  return concatAudioFiles(sfxPaths, combinedSfxPath, filelistPath)
}

function generateSceneSoundEffect(sfxType, outputPath, duration) {
  if (sfxType === 'car_start') return generateCarStartSound(outputPath, duration)
  if (sfxType === 'car_running') return generateCarRunningSound(outputPath, duration)
  return generateSilentAudio(outputPath, duration)
}

function generateCarStartSound(outputPath, duration) {
  const fadeOutStart = Math.max(0, duration - 0.9)
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(`sine=frequency=58:duration=${duration}:sample_rate=44100`)
      .inputFormat('lavfi')
      .input(`sine=frequency=112:duration=${duration}:sample_rate=44100`)
      .inputFormat('lavfi')
      .input(`anoisesrc=color=brown:duration=${duration}:sample_rate=44100:amplitude=0.08`)
      .inputFormat('lavfi')
      .complexFilter([
        `[0:a]volume=0.22,lowpass=f=180,afade=t=in:st=0:d=0.12,afade=t=out:st=${fadeOutStart}:d=0.9[low]`,
        `[1:a]volume=0.12,tremolo=f=13:d=0.35,lowpass=f=420,afade=t=in:st=0:d=0.08,afade=t=out:st=${fadeOutStart}:d=0.9[mid]`,
        `[2:a]volume=0.11,lowpass=f=950,afade=t=in:st=0:d=0.08,afade=t=out:st=${fadeOutStart}:d=0.9[noise]`,
        `[low][mid][noise]amix=inputs=3,volume=0.38,atrim=0:${duration},asetpts=PTS-STARTPTS[sfx]`,
      ])
      .outputOptions(['-map', '[sfx]', '-c:a', 'libmp3lame', '-b:a', '160k', '-ar', '44100', '-ac', '2'])
      .output(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', (err) => reject(err))
      .run()
  })
}

function generateCarRunningSound(outputPath, duration) {
  const fadeOutStart = Math.max(0, duration - 0.8)
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(`sine=frequency=68:duration=${duration}:sample_rate=44100`)
      .inputFormat('lavfi')
      .input(`sine=frequency=136:duration=${duration}:sample_rate=44100`)
      .inputFormat('lavfi')
      .input(`anoisesrc=color=brown:duration=${duration}:sample_rate=44100:amplitude=0.06`)
      .inputFormat('lavfi')
      .complexFilter([
        `[0:a]volume=0.16,tremolo=f=9:d=0.18,lowpass=f=190,afade=t=in:st=0:d=0.4,afade=t=out:st=${fadeOutStart}:d=0.8[low]`,
        `[1:a]volume=0.08,tremolo=f=17:d=0.16,lowpass=f=520,afade=t=in:st=0:d=0.4,afade=t=out:st=${fadeOutStart}:d=0.8[mid]`,
        `[2:a]volume=0.08,lowpass=f=850,afade=t=in:st=0:d=0.4,afade=t=out:st=${fadeOutStart}:d=0.8[road]`,
        `[low][mid][road]amix=inputs=3,volume=0.30,atrim=0:${duration},asetpts=PTS-STARTPTS[sfx]`,
      ])
      .outputOptions(['-map', '[sfx]', '-c:a', 'libmp3lame', '-b:a', '160k', '-ar', '44100', '-ac', '2'])
      .output(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', (err) => reject(err))
      .run()
  })
}

function concatAudioFiles(audioPaths, outputPath, filelistPath) {
  return new Promise(async (resolve, reject) => {
    const content = audioPaths.map(p => `file '${p.replace(/\\/g, '/')}'`).join('\n')
    await fsp.writeFile(filelistPath, content)

    ffmpeg()
      .input(filelistPath)
      .inputOptions(['-f', 'concat', '-safe', '0'])
      .outputOptions(['-c:a', 'libmp3lame', '-b:a', '160k', '-ar', '44100', '-ac', '2'])
      .output(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', (err) => reject(err))
      .run()
  })
}

// ─────────────────────────────────────────────────────
// STEP 7: FFmpeg Merge with Scene Transitions
// ─────────────────────────────────────────────────────
// Helper: Get video duration using ffprobe
function getMediaDuration(mediaPath, fallbackDuration = VIDEO_CLIP_DURATION_SECONDS) {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(mediaPath, (err, metadata) => {
      if (err) {
        console.warn(`Could not get duration for ${mediaPath}:`, err.message)
        return resolve(fallbackDuration)
      }
      resolve(Number(metadata.format.duration) || fallbackDuration)
    })
  })
}

function getVideoDuration(videoPath) {
  return getMediaDuration(videoPath, VIDEO_CLIP_DURATION_SECONDS)
}

// ─────────────────────────────────────────────────────
// Helper: Concatenate video clips with realistic editorial straight cuts
// ─────────────────────────────────────────────────────
async function concatVideos(videoPaths, outputPath, aspectRatio = '9:16') {
  return simpleConcatVideos(videoPaths, outputPath, aspectRatio)
}

async function xfadeConcatVideos(videoPaths, outputPath, aspectRatio = '9:16') {
  if (videoPaths.length <= 1) {
    await fsp.copyFile(videoPaths[0], outputPath)
    return outputPath
  }

  const { w, h } = VIDEO_SIZE_BY_ASPECT[aspectRatio] || VIDEO_SIZE_BY_ASPECT['9:16']
  const durations = await Promise.all(videoPaths.map(p => getVideoDuration(p)))
  const transitionDuration = 0.3
  const filters = videoPaths.map((_, i) =>
    `[${i}:v]fps=24,scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1,format=yuv420p,settb=AVTB,setpts=PTS-STARTPTS[v${i}]`
  )
  let previousLabel = '[v0]'
  let elapsed = durations[0]
  const totalTransitionOverlap = transitionDuration * (videoPaths.length - 1)

  for (let i = 1; i < videoPaths.length; i++) {
    const outLabel = i === videoPaths.length - 1 ? '[xfout]' : `[xf${i}]`
    // Correct xfade offset: cumulative duration of all previous clips minus cumulative transitions
    const offset = Math.max(0.01, elapsed - transitionDuration)
    filters.push(`${previousLabel}[v${i}]xfade=transition=fade:duration=${transitionDuration}:offset=${offset.toFixed(3)}${outLabel}`)
    previousLabel = outLabel
    elapsed = offset + durations[i]
  }
  // Add a small pad at the end to compensate for transition overlap
  const finalPad = Math.max(0, totalTransitionOverlap)
  if (finalPad > 0.05) {
    filters.push(`${previousLabel}tpad=stop_mode=clone:stop_duration=${finalPad.toFixed(3)}[vout]`)
  } else {
    // No padding needed, just rename the label
    filters[filters.length - 1] = filters[filters.length - 1].replace('[xfout]', '[vout]')
  }

  return new Promise((resolve, reject) => {
    const cmd = ffmpeg()
    for (const p of videoPaths) cmd.input(p)
    cmd
      .complexFilter(filters)
      .outputOptions([
        '-map', '[vout]',
        '-an',
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-b:v', '4000k',
        '-maxrate', '5500k',
        '-bufsize', '9000k',
        '-r', '24',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
      ])
      .output(outputPath)
      .on('start', (cmdLine) => console.log(`[server] xfade ffmpeg: ${cmdLine}`))
      .on('end', () => resolve(outputPath))
      .on('error', (err) => {
        console.warn(`[server] xfade ffmpeg failed: ${err.message}`)
        reject(err)
      })
      .run()
  })
}

// Simple concat fallback (no transitions)
function simpleConcatVideos(videoPaths, outputPath, aspectRatio = '9:16') {
  return new Promise(async (resolve, reject) => {
    const dir = path.dirname(outputPath)
    const filelistPath = path.join(dir, 'filelist.txt')
    const content = videoPaths.map(p => `file '${p.replace(/\\/g, '/')}'`).join('\n')
    await fsp.writeFile(filelistPath, content)
    const { w, h } = VIDEO_SIZE_BY_ASPECT[aspectRatio] || VIDEO_SIZE_BY_ASPECT['9:16']

    ffmpeg()
      .input(filelistPath)
      .inputOptions(['-f', 'concat', '-safe', '0'])
      .outputOptions([
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-b:v', '4000k',
        '-maxrate', '5500k',
        '-bufsize', '9000k',
        '-r', '24',
        '-vf', `fps=24,scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1,${UNIFIED_GRADE},format=yuv420p`,
        '-pix_fmt', 'yuv420p',
        '-an',
        '-movflags', '+faststart',
      ])
      .output(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', (err) => reject(err))
      .run()
  })
}

function reencodeVideo(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .outputOptions([
        '-c:v', 'libx264',
        '-c:a', 'aac',
        '-b:v', '4000k',
        '-maxrate', '5500k',
        '-bufsize', '9000k',
        '-r', '24',
        '-ar', '44100',
        '-ac', '2',
        '-pix_fmt', 'yuv420p',
      ])
      .output(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', (err) => reject(err))
      .run()
  })
}

async function mixAudio(videoPath, musicPath, voiceoverPath, outputPath, sfxPath = null) {
  const videoDuration = await getVideoDuration(videoPath)

  // Safety: if both audio sources are missing, just copy the video as-is
  const hasMusic = musicPath && fs.existsSync(musicPath)
  const hasVoiceover = voiceoverPath && fs.existsSync(voiceoverPath)
  const hasSfx = sfxPath && fs.existsSync(sfxPath)

  if (!hasMusic && !hasVoiceover) {
    console.warn('[server] mixAudio: no music or voiceover found — copying video without audio mix')
    await fsp.copyFile(videoPath, outputPath)
    return outputPath
  }

  return new Promise((resolve, reject) => {
    const cmd = ffmpeg().input(videoPath)

    const audioLabels = []
    let inputIndex = 1

    if (hasMusic) {
      cmd.input(musicPath)
      const label = `[bg]`
      // 0.22 volume — subtle but present under the voiceover
      audioLabels.push({ label, filter: `[${inputIndex}:a]volume=0.22,apad,atrim=0:${videoDuration},asetpts=PTS-STARTPTS${label}` })
      inputIndex++
    }
    if (hasVoiceover) {
      cmd.input(voiceoverPath)
      const label = `[vo]`
      audioLabels.push({ label, filter: `[${inputIndex}:a]volume=1.0,apad,atrim=0:${videoDuration},asetpts=PTS-STARTPTS${label}` })
      inputIndex++
    }
    if (hasSfx) {
      cmd.input(sfxPath)
      const label = `[sfx]`
      audioLabels.push({ label, filter: `[${inputIndex}:a]volume=0.28,apad,atrim=0:${videoDuration},asetpts=PTS-STARTPTS${label}` })
      inputIndex++
    }

    const mixInputs = audioLabels.map(a => a.label).join('')
    const n = audioLabels.length
    // amix divides output by N — compensate with a volume boost so levels aren't attenuated
    const postBoost = n > 1 ? n.toFixed(1) : '1.0'
    const filters = [
      ...audioLabels.map(a => a.filter),
      `${mixInputs}amix=inputs=${n}:duration=first,loudnorm=I=-14:TP=-1.5:LRA=11,volume=${postBoost}[mix]`,
    ]

    cmd
      .complexFilter(filters)
      .outputOptions([
        '-map', '0:v',
        '-map', '[mix]',
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-ac', '2',
      ])
      .output(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', (err) => reject(err))
      .run()
  })
}

// ─────────────────────────────────────────────────────
// Cancellation Check
// ─────────────────────────────────────────────────────

function escapeDrawtext(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\n/g, ' ')
}

async function addBrandEndCard(inputPath, outputPath) {
  const brandName = BRAND_NAME().trim()
  const brandTagline = BRAND_TAGLINE().trim()
  if (!brandName && !brandTagline) {
    await fsp.copyFile(inputPath, outputPath)
    return outputPath
  }

  const duration = await getVideoDuration(inputPath)
  const brandStart = Math.max(0, duration - 2.5)
  const fadeStart = Math.max(0, duration - 0.5)
  const color = BRAND_COLOR().replace(/^#/, '') || 'ffffff'
  const vf = [
    `drawtext=text='${escapeDrawtext(brandName)}':fontsize=72:fontcolor=${color}:x=(w-text_w)/2:y=(h/2-60):enable='gte(t,${brandStart.toFixed(3)})'`,
    `drawtext=text='${escapeDrawtext(brandTagline)}':fontsize=36:fontcolor=${color}@0.8:x=(w-text_w)/2:y=(h/2+20):enable='gte(t,${brandStart.toFixed(3)})'`,
    `fade=t=out:st=${fadeStart.toFixed(3)}:d=0.5`,
  ].join(',')

  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .outputOptions([
        '-vf', vf,
        '-codec:a', 'copy',
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-b:v', '4000k',
        '-maxrate', '5500k',
        '-bufsize', '9000k',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
      ])
      .output(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', (err) => reject(err))
      .run()
  })
}

function checkCancel(jobId) {
  const job = getJob(jobId)
  if (job && job.isCancelled) {
    throw new Error('CANCELLED')
  }
}

// ─────────────────────────────────────────────────────
// MAIN PIPELINE
// ─────────────────────────────────────────────────────
export async function runPipeline(jobId, script, imagePaths, videoOptions = {}) {
  const tmpDir = path.join(process.cwd(), 'tmp', `video_${jobId}`)
  const publicDir = path.join(process.cwd(), 'public', 'videos')

  const { aspectRatio, quality } = getPipelineOptions(videoOptions)

  try {
    await fsp.mkdir(tmpDir, { recursive: true })
    await fsp.mkdir(publicDir, { recursive: true })

    checkCancel(jobId)
    // ── STEP 1: Analyze Script ──
    const analysis = await analyzeScript(jobId, script, imagePaths)
    let { language, overall_mood, music_keywords, music_energy, total_duration_seconds, scenes, actual_product, product_context, problem_being_solved } = analysis
    const narratorGender = String(analysis.narrator_gender || 'male').toLowerCase()
    language = normalizeLanguageInfo(language, script)
    // Attach gender to language so voice routing can use it
    if (typeof language === 'object') {
      language.gender = narratorGender
    } else {
      language = { code: language, gender: narratorGender }
    }
    console.log(`[server] Script language: ${typeof language === 'object' ? language.code : language}, narrator gender: ${narratorGender}`)
    const productIdentity = analysis.product_identity || analysis.productIdentity || DEFAULT_PRODUCT_IDENTITY
    const visualIdentity = analysis.visual_identity || analysis.visualIdentity || productIdentity || DEFAULT_VISUAL_IDENTITY
    const characterIdentity = analysis.character_identity || analysis.characterIdentity || 'None'
    const characterLock = analysis.character_lock || analysis.characterLock || {
      primary_person: characterIdentity,
      clothing: analysis.clothing || 'same exact clothing and accessories in every scene',
      secondary_person: analysis.secondary_person || 'same secondary person if one appears',
    }
    const continuityBible = buildContinuityBible({
      actualProduct: actual_product,
      productContext: product_context,
      productIdentity,
      visualIdentity,
      characterIdentity,
      characterLock,
      problemSolved: problem_being_solved,
    })

    if (!Array.isArray(scenes) || scenes.length === 0) {
      throw new Error('Script analysis did not return any scenes')
    }

    scenes = scenes.slice(0, MAX_SCENE_COUNT).map((sc, index) => {
      const productState = sc.product_state || inferProductState(sc, index)
      const beforeReveal = /before_reveal_no_accessories|problem_before_solution/.test(String(productState).toLowerCase())
      const productVisibleByState = /reveal|installed|after|hero|cta|product/.test(String(productState).toLowerCase())
      return {
        ...sc,
        scene_number: index + 1,
        duration_seconds: normalizeSceneDuration(sc.duration_seconds),
        product_state: productState,
        must_show: sc.must_show || (beforeReveal
          ? 'the same base object/customer problem before the advertised solution appears'
          : productVisibleByState
            ? 'the advertised product/accessories clearly visible in the real usage context'
            : 'the exact visual action described by the script'),
        must_not_show: sc.must_not_show || (beforeReveal
          ? 'the advertised product/accessories, product branding, or solved/protected state'
          : 'ZERO random vehicles (no cars, scooters, trucks, bicycles, auto-rickshaws, or any other vehicle not explicitly part of the scene). ZERO random products, brands, logos, or objects not described in the script. Only the exact subject, people, setting, and props described in the scene description are allowed.'),
        use_product_image: beforeReveal ? false : sceneNeedsProductReference({ ...sc, product_state: productState }),
        product_identity: productIdentity,
        visual_identity: visualIdentity,
        character_identity: characterIdentity,
        character_lock: characterLock,
        motion_direction: sc.motion_direction || 'slow cinematic camera push with gentle foreground parallax',
        transition_hint: sc.transition_hint || 'natural straight cut into the next realistic shot',
      }
    })
    scenes = fitScenesToMaxDuration(scenes, MAX_TOTAL_DURATION_SECONDS)
    total_duration_seconds = getScenesTotalDuration(scenes)

    updateJob(jobId, { scenes, totalDuration: total_duration_seconds })

    // ── STEP 2: Generate voiceover scripts & image prompts ──
    setStep(jobId, 'generating_images', 'Generating scene content...')

    let preparedScenes = 0
    const sceneData = await mapWithConcurrency(scenes, PROMPT_CONCURRENCY, async (scene, i) => {
      checkCancel(jobId)

      const [voiceoverScript, imagePrompt] = await Promise.all([
        generateVoiceoverScript(scene, language, script),
        generateImagePrompt(scene, imagePaths, aspectRatio, productIdentity, visualIdentity, characterIdentity, actual_product, product_context, problem_being_solved, continuityBible, characterLock),
      ])

      const voPath = path.join(tmpDir, `scene_${i + 1}_vo.mp3`)

      const sceneImagePath = null
      preparedScenes++
      setStepProgress(jobId, 'generating_images', (preparedScenes / scenes.length) * 0.35)

      return {
        ...scene,
        language,
        voiceoverScript,
        imagePrompt,
        sceneImagePath,
        voPath,
        voPromise: null, // populated in the sequential voiceover pass below
      }
    })

    // ── STEP 2B: Generate voiceovers sequentially to avoid ElevenLabs 409 rate limits ──
    // ElevenLabs enforces one active request per voice ID — running them in parallel causes 409.
    for (let i = 0; i < sceneData.length; i++) {
      checkCancel(jobId)
      const sd = sceneData[i]
      updateJob(jobId, { stepDetail: `Generating voiceover ${i + 1}/${sceneData.length}...` })
      let voResult = await generateTimedVoiceoverSegment(jobId, sd, sd.voiceoverScript, sd.voPath, language, { deferNormalize: true })
      sd.voPromise = Promise.resolve(voResult)
      sd.rawVoiceDuration = voResult?.rawDuration || Number(sd.duration_seconds)
      rebalanceSceneDurationForVoice(sceneData, i, sd.rawVoiceDuration)

      for (let rescueAttempt = 1; rescueAttempt <= 2 && sd.rawVoiceDuration > (Number(sd.duration_seconds) * 1.03) + 0.05; rescueAttempt++) {
        const targetDuration = Number(sd.duration_seconds)
        console.warn(`[server] VO timing: scene ${sd.scene_number || i + 1} raw ${sd.rawVoiceDuration.toFixed(2)}s still does not fit ${targetDuration}s; shortening voiceover`)
        sd.voiceoverScript = await shortenVoiceoverForDuration(sd.voiceoverScript, sd, language, targetDuration)
        voResult = await generateTimedVoiceoverSegment(jobId, sd, sd.voiceoverScript, sd.voPath, language, { deferNormalize: true })
        sd.voPromise = Promise.resolve(voResult)
        sd.rawVoiceDuration = voResult?.rawDuration || Number(sd.duration_seconds)
        rebalanceSceneDurationForVoice(sceneData, i, sd.rawVoiceDuration)
      }

      if (Number(sd.duration_seconds) !== Number(scenes[i]?.duration_seconds)) {
        scenes[i].duration_seconds = sd.duration_seconds
        total_duration_seconds = getScenesTotalDuration(sceneData)
        updateJob(jobId, { scenes: sceneData, totalDuration: total_duration_seconds })
      }
      await normalizeVoiceoverSegment(sd.voPath.replace(/\.mp3$/i, '_raw.mp3'), sd.voPath, sd.duration_seconds, sd.rawVoiceDuration)
      // Stagger requests by 1.2s to stay within rate limits
      if (i < sceneData.length - 1) await sleep(1200)
    }
    scenes = sceneData.map((sd, index) => ({
      ...scenes[index],
      duration_seconds: sd.duration_seconds,
    }))
    total_duration_seconds = getScenesTotalDuration(sceneData)
    updateJob(jobId, { scenes: sceneData, totalDuration: total_duration_seconds })


    // ── STEP 3: Generate Scene Images (Nano Banana Pro) ──
    let completedImages = 0
    const generatedContinuityRefs = []
    for (let i = 0; i < sceneData.length; i++) {
      checkCancel(jobId)
      const sd = sceneData[i]
      if (!sd.sceneImagePath && sd.imagePrompt) {
        const productReferenceImages = sd.use_product_image ? imagePaths : []
        const continuityReferenceImages = generatedContinuityRefs.slice(-3)
        const sceneReferenceImages = sd.use_product_image
          ? [...new Set([...productReferenceImages, ...continuityReferenceImages])]
          : continuityReferenceImages.slice(-2)

        const imgPath = path.join(tmpDir, `scene_${i + 1}_image.png`)
        try {
          await generateSceneImage(sd.imagePrompt, imgPath, aspectRatio, sceneReferenceImages, visualIdentity)
          sd.sceneImagePath = imgPath
          generatedContinuityRefs.push(imgPath)
          
          const job = getJob(jobId)
          if (job) {
            if (!job.previews) job.previews = {}
            job.previews[`scene_${i + 1}_image`] = `/api/preview/${jobId}/scene_${i + 1}_image.png`
          }
        } catch (err) {
          console.error(`Nano Banana Pro image generation failed for scene ${i + 1}:`, err.message)
          if (imagePaths.length === 0 || !sd.use_product_image) {
            const continuityFallback = generatedContinuityRefs[generatedContinuityRefs.length - 1] || generatedContinuityRefs[0]
            warnAndSkipService(
              jobId,
              'Nano Banana Pro scene image generation',
              err.response?.data?.error?.message || err.message || 'unknown error',
              continuityFallback
                ? 'Reusing the previous generated frame as a continuity fallback.'
                : 'Using a local visual fallback frame.'
            )

            const fallbackPath = path.join(tmpDir, continuityFallback ? `scene_${i + 1}_continuity_fallback.png` : `scene_${i + 1}_visual_fallback.png`)
            if (continuityFallback) {
              await fsp.copyFile(continuityFallback, fallbackPath)
            } else {
              await createVisualFallbackFrame(fallbackPath, aspectRatio)
            }
            sd.sceneImagePath = fallbackPath
            generatedContinuityRefs.push(fallbackPath)

            const job = getJob(jobId)
            if (job) {
              if (!job.previews) job.previews = {}
              job.previews[`scene_${i + 1}_image`] = `/api/preview/${jobId}/` + path.basename(fallbackPath)
            }
            completedImages++
            setStepProgress(jobId, 'generating_images', 0.35 + (completedImages / sceneData.length) * 0.65)
            continue
          }

          warnAndSkipService(
            jobId,
            'Nano Banana Pro scene image generation',
            err.response?.data?.error?.message || err.message || 'unknown error',
            'Using the uploaded product reference as a fallback scene frame.'
          )

          const fallbackExt = path.extname(imagePaths[0]) || '.png'
          const fallbackPath = path.join(tmpDir, `scene_${i + 1}_fallback_reference${fallbackExt}`)
          await fsp.copyFile(imagePaths[0], fallbackPath)
          sd.sceneImagePath = fallbackPath
          generatedContinuityRefs.push(fallbackPath)

          const job = getJob(jobId)
          if (job) {
            if (!job.previews) job.previews = {}
            job.previews[`scene_${i + 1}_image`] = `/api/preview/${jobId}/` + path.basename(fallbackPath)
          }
        }
      }
      completedImages++
      setStepProgress(jobId, 'generating_images', 0.35 + (completedImages / sceneData.length) * 0.65)
    }

    checkCancel(jobId)
    // ── STEP 4: Generate Video Clips (PixVerse V6, Ken Burns fallback) ──
    setStep(jobId, 'generating_videos', `Generating ${aspectRatio} cinematic clips with PixVerse V6...`)

    // Also start STEP 6 (music) in parallel.
    const musicPromise = generateMusicTrack(jobId, music_keywords, overall_mood, tmpDir, total_duration_seconds, {
      musicEnergy: music_energy,
      actualProduct: actual_product,
      productContext: product_context,
      problemSolved: problem_being_solved,
      scenes,
      language: typeof language === 'object' ? (language.name || language.code || '') : (language || ''),
    })
    musicPromise.catch(() => {}) // Prevent UnhandledPromiseRejection

    // Generate video clips in parallel
    const videoClipPaths = new Array(sceneData.length)
    let completedVideos = 0

    await mapWithConcurrency(sceneData, VIDEO_CONCURRENCY, async (sd, i) => {
      checkCancel(jobId)
      const clipPath = path.join(tmpDir, `scene_${i + 1}_clip.mp4`)

      await generateVideoClip(sd.sceneImagePath, sd, clipPath, jobId, {
        aspectRatio,
        quality,
      })

      completedVideos++
      setStepProgress(jobId, 'generating_videos', completedVideos / sceneData.length)
      updateJob(jobId, { stepDetail: `Generated clip ${completedVideos}/${sceneData.length}...` })
      
      const job = getJob(jobId)
      if (job) {
        if (!job.previews) job.previews = {}
        job.previews[`scene_${i + 1}_video`] = `/api/preview/${jobId}/scene_${i + 1}_clip.mp4`
      }
      
      videoClipPaths[i] = clipPath
      return clipPath
    })

    checkCancel(jobId)
    // Wait for all voiceover promises to settle (don't let one failure kill all audio)
    setStep(jobId, 'generating_voiceover', 'Waiting for voiceovers to finish...')
    await Promise.allSettled(sceneData.map(sd => sd.voPromise))

    // Collect voiceover paths — voPath is always written (fallback to silence on ElevenLabs error)
    const voiceoverPaths = sceneData.map(sd => sd.voPath).filter(Boolean)
    let voiceoverPath = voiceoverPaths.length > 0 ? voiceoverPaths[0] : null

    // Concatenate all voiceover clips if multiple
    if (voiceoverPaths.length > 1) {
      const combinedVoPath = path.join(tmpDir, 'voiceover.mp3')
      const filelistPath = path.join(tmpDir, 'vo_filelist.txt')
      const content = voiceoverPaths.map(p => `file '${p.replace(/\\/g, '/')}'`).join('\n')
      await fsp.writeFile(filelistPath, content)

      voiceoverPath = await new Promise((resolve, reject) => {
        ffmpeg()
          .input(filelistPath)
          .inputOptions(['-f', 'concat', '-safe', '0'])
          .outputOptions(['-c:a', 'libmp3lame', '-b:a', '192k', '-ar', '44100', '-ac', '2'])
          .output(combinedVoPath)
          .on('end', () => resolve(combinedVoPath))
          .on('error', (err) => reject(err))
          .run()
      })
    }

    checkCancel(jobId)
    setStep(jobId, 'generating_music', 'Waiting for music...')
    const musicPath = await musicPromise
    const sfxPath = await generateSceneSoundEffects(jobId, sceneData, tmpDir)

    checkCancel(jobId)
    // ── STEP 7: FFmpeg Merge ──
    setStep(jobId, 'merging', 'Merging video clips...')

    // Step A: Concat all video clips
    const mergedRawPath = path.join(tmpDir, 'merged_raw.mp4')
    await concatVideos(videoClipPaths, mergedRawPath, aspectRatio)
    setStepProgress(jobId, 'merging', 0.3)

    checkCancel(jobId)
    // Step B: Re-encode for consistency
    const mergedPath = path.join(tmpDir, 'merged.mp4')
    await reencodeVideo(mergedRawPath, mergedPath)
    setStepProgress(jobId, 'merging', 0.6)

    checkCancel(jobId)
    // Step C: Mix audio (voiceover + music)
    const mixedPath = path.join(tmpDir, 'mixed_audio.mp4')
    await mixAudio(mergedPath, musicPath, voiceoverPath, mixedPath, sfxPath)
    const finalPath = path.join(tmpDir, 'final.mp4')
    await addBrandEndCard(mixedPath, finalPath)
    setStepProgress(jobId, 'merging', 0.9)

    // Move to public directory
    const publicPath = path.join(publicDir, `${jobId}.mp4`)
    await fsp.copyFile(finalPath, publicPath)

    // NOTE: We keep the tmp directory so per-scene regeneration can reuse cached clips
    // Store pipeline context for scene-level edits
    storeJobPipelineContext(jobId, {
      tmpDir,
      sceneData: sceneData.map((sd, i) => ({
        sceneIndex: i,
        scene: { ...sd, voPromise: undefined },
        imagePrompt: sd.imagePrompt,
        voiceoverScript: sd.voiceoverScript,
        sceneImagePath: sd.sceneImagePath,
        clipPath: videoClipPaths[i],
        voPath: sd.voPath,
      })),
      videoClipPaths,
      voiceoverPath,
      musicPath,
      sfxPath,
      script,
      imagePaths,
      aspectRatio,
      quality,
      language,
      productIdentity,
      visualIdentity,
      characterIdentity,
      characterLock,
      actualProduct: actual_product,
      productContext: product_context,
      problemSolved: problem_being_solved,
    })

    const videoUrl = `/api/video/${jobId}`
    completeJob(jobId, videoUrl, scenes, total_duration_seconds)

  } catch (err) {
    if (err.message === 'CANCELLED') {
      console.log(`Job ${jobId} was cancelled`)
    } else {
      console.error(`Pipeline failed for job ${jobId}:`, err)
      failJob(jobId, err.message || 'Pipeline failed unexpectedly')
    }

    // Cleanup
    try {
      await fsp.rm(tmpDir, { recursive: true, force: true })
    } catch (e) { /* ignore */ }
  }
}

// ─────────────────────────────────────────────────────
// Generate all voiceovers and concatenate
// ─────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────
// Generate music track
// ─────────────────────────────────────────────────────
function buildAdMusicBrief(musicKeywords, mood, options = {}) {
  const product = options.actualProduct || options.productContext || 'the advertised product'
  const energy = options.musicEnergy || 'medium-high'
  const problem = options.problemSolved ? `Problem being solved: ${options.problemSolved}` : ''
  const sceneArc = Array.isArray(options.scenes)
    ? options.scenes
      .map(scene => `${scene.scene_number || ''} ${scene.scene_role || scene.scene_type || 'scene'}: ${scene.key_message || scene.motion_feel || ''}`.trim())
      .filter(Boolean)
      .join(' | ')
    : ''
  const voiceoverSummary = Array.isArray(options.scenes)
    ? options.scenes
      .map(scene => scene.voiceover_script || '')
      .filter(Boolean)
      .join(' ')
      .slice(0, 300)
    : ''
  const langHint = options.language || ''

  // Pass all context to LLM so it can generate perfect style tags
  return {
    product,
    energy,
    mood: mood || 'premium commercial',
    problem,
    sceneArc,
    voiceoverSummary,
    musicKeywords: musicKeywords || '',
    langHint,
  }
}

// Use LLM to generate script-aware Suno style tags & title
// Reference style: Cinematic Corporate Underscore (from user's reference ads)
// - Driving staccato synth pulse, deep synth bass, atmospheric swelling pads
// - Clean electric guitar arpeggios, minimal piano motifs
// - Tension → confidence arc, serious → reassuring mood
// - Western/global sound, NO traditional Indian instruments
// - Clean, modern, premium production
async function generateMusicStyleTags(briefData) {
  const systemPrompt = `You are a music director for premium product commercials.
Your job is to generate precise Suno AI style tags for background music.

REFERENCE STYLE (this is EXACTLY what the client wants — follow it closely):
The music must sound like a cinematic corporate underscore / dramatic product reveal score.
Think: premium TV commercials for Tata, Paragon, automotive brands, tech products.

SONIC DNA (from approved reference tracks):
- Driving staccato synth pulse (short, sharp, repetitive — like pizzicato strings)
- Deep, sustained synth bass foundation
- Atmospheric swelling synth pads (build tension, then resolve)
- Clean electric guitar arpeggios (hopeful, human touch)
- Minimal piano motifs (thoughtful, serious)
- Cinematic percussion impacts at key moments
- Light rhythmic synth elements for forward momentum

MOOD ARC:
- Start: tense, serious, concerned — match the "problem" part of the ad
- Middle: building confidence, layers increase
- End: resolved, confident, reassuring, premium — match the "solution" reveal

ABSOLUTE RULES:
- Return ONLY valid JSON with two fields: "style" and "title"
- "style" = comma-separated Suno tags (max 800 chars)
- "title" = short track title (max 80 chars)
- MUST sound like a GLOBAL premium ad — NOT cheerful, NOT playful, NOT Bollywood
- NO tabla, NO dhol, NO sitar, NO Indian folk instruments, NO Indian classical
- NO ukulele, NO happy claps, NO upbeat pop, NO EDM drops
- NO lo-fi, NO gritty, NO distorted sounds
- NO prominent complex melody that competes with voiceover
- Clean, spacious, modern production ONLY
- 115-130 BPM, steady driving rhythm
- Instrumental only, no vocals, no lyrics
- Return RAW JSON only. No markdown.`

  const userPrompt = `Generate background music style tags for this ad:

Product: ${briefData.product}
Mood: ${briefData.mood}
Energy: ${briefData.energy}
${briefData.problem ? `Problem: ${briefData.problem}` : ''}
${briefData.sceneArc ? `Scene arc: ${briefData.sceneArc}` : ''}
${briefData.musicKeywords ? `Music direction: ${briefData.musicKeywords}` : ''}
${briefData.voiceoverSummary ? `Script summary: ${briefData.voiceoverSummary.slice(0, 200)}` : ''}

Return JSON with "style" (comma-separated Suno tags matching the cinematic corporate underscore reference) and "title" fields.`

  try {
    const raw = await callOpenAI(systemPrompt, userPrompt, [])
    const parsed = extractJSON(raw)
    if (parsed && parsed.style && parsed.title) {
      console.log(`[server] LLM music style: ${parsed.style.slice(0, 120)}...`)
      console.log(`[server] LLM music title: ${parsed.title}`)
      return parsed
    }
  } catch (err) {
    console.warn(`[server] LLM music style generation failed, using fallback:`, err.message)
  }

  // Fallback: hardcoded style tags matching the reference tracks exactly
  const fallbackStyle = [
    'Cinematic Corporate',
    'Dramatic Underscore',
    'premium ad music',
    'driving staccato synth pulse',
    'deep synth bass',
    'atmospheric swelling pads',
    'clean electric guitar arpeggios',
    'minimal piano motif',
    'cinematic percussion impacts',
    'serious to confident mood arc',
    'tense intro building to reassuring climax',
    `${briefData.energy} energy`,
    'modern clean production',
    'spacious mix',
    '120 BPM',
    'instrumental',
    'no vocals',
  ].join(', ')

  return {
    style: fallbackStyle,
    title: `${briefData.product} Ad Score`,
  }
}

async function generateMusicTrack(jobId, musicKeywords, mood, tmpDir, totalDuration, options = {}) {
  const musicPath = path.join(tmpDir, 'music.mp3')
  try {
    checkCancel(jobId)
    const briefData = buildAdMusicBrief(musicKeywords, mood, options)
    briefData.language = options.language || ''

    // Use LLM to generate context-aware style tags
    setStep(jobId, 'generating_music', 'Analyzing script to compose matching background music...')
    const musicStyle = await generateMusicStyleTags(briefData)

    const musicMood = [mood, options.musicEnergy].filter(Boolean).join(', ')
    await generateMusic(musicStyle, musicMood || mood, musicPath, totalDuration, jobId)
  } catch (err) {
    if (err.message === 'CANCELLED') throw err
    console.warn('Music generation failed, using silent track:', err.message)
    warnAndSkipService(
      jobId,
      'Background music fallback',
      err.message || 'unknown error',
      'Using silent background music.'
    )
    await generateSilentAudio(musicPath, totalDuration)
  }
  return musicPath
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ─────────────────────────────────────────────────────
// PER-SCENE REGENERATION
// ─────────────────────────────────────────────────────
export async function regenerateScene(jobId, sceneIndex, editNote) {
  const job = getJob(jobId)
  if (!job) throw new Error('Job not found')
  if (!job.pipelineContext) throw new Error('No pipeline context saved for this job. Please regenerate the full video.')

  const ctx = job.pipelineContext
  const { tmpDir, sceneData, videoClipPaths, script, imagePaths, aspectRatio, quality, language, productIdentity, visualIdentity, characterIdentity, actualProduct, productContext, problemSolved } = ctx

  if (sceneIndex < 0 || sceneIndex >= sceneData.length) {
    throw new Error(`Invalid scene index ${sceneIndex}. Valid range: 0-${sceneData.length - 1}`)
  }

  const publicDir = path.join(process.cwd(), 'public', 'videos')
  const sd = sceneData[sceneIndex]
  const scene = sd.scene
  const i = sceneIndex

  // Mark job as processing again
  updateJob(jobId, {
    status: 'processing',
    currentStep: 'generating_images',
    stepDetail: `Regenerating scene ${i + 1} based on your feedback...`,
    progress: 10,
    error: null,
  })

  try {
    // Ensure tmp directory still exists
    await fsp.mkdir(tmpDir, { recursive: true })

    // ── Step 1: Ask Gemini to refine the image prompt based on the edit note ──
    const refineSystemPrompt = `You are an expert visual prompt engineer. You will be given:
1. The ORIGINAL image prompt that was used to generate a scene image.
2. The user's EDIT NOTE describing what they want changed or fixed.
3. The original script context.

Your job is to write an IMPROVED image prompt that incorporates the user's feedback while preserving all the good elements from the original prompt.

Rules:
- Keep the same product identity, visual style, aspect ratio instructions, and cinematic quality.
- Specifically address every point in the user's edit note.
- Keep motion language slow, smooth, and controlled; avoid fast zooms, rapid orbiting, shaky movement, or whip-like camera motion.
- Return ONLY the new prompt text, nothing else. No markdown, no explanation.`

    const refineUserPrompt = `ORIGINAL PROMPT:\n${sd.imagePrompt}\n\nUSER EDIT NOTE:\n${editNote}\n\nCHARACTER LOCK (Must strictly maintain): ${characterIdentity || 'None'}\nSCRIPT CONTEXT:\n${script}\n\nWrite the improved image generation prompt:`

    let newImagePrompt = sd.imagePrompt
    try {
      const refined = await callOpenAI(refineSystemPrompt, refineUserPrompt, imagePaths)
      if (refined && refined.length > 20) {
        newImagePrompt = refined
      }
    } catch (err) {
      console.warn(`[server] Failed to refine prompt for scene ${i + 1}, using original with edit appended:`, err.message)
      newImagePrompt = `${sd.imagePrompt}\n\nIMPORTANT CORRECTIONS: ${editNote}`
    }

    console.log(`[server] Regenerating scene ${i + 1} with refined prompt for job ${jobId}`)

    // ── Step 2: Generate new scene image ──
    updateJob(jobId, { stepDetail: `Generating new image for scene ${i + 1}...`, progress: 25 })

    const newImagePath = path.join(tmpDir, `scene_${i + 1}_image_v2.png`)
    try {
      await generateSceneImage(newImagePrompt, newImagePath, aspectRatio, imagePaths, visualIdentity)
      sd.sceneImagePath = newImagePath
      sd.imagePrompt = newImagePrompt

      const jobObj = getJob(jobId)
      if (jobObj) {
        if (!jobObj.previews) jobObj.previews = {}
        jobObj.previews[`scene_${i + 1}_image`] = `/api/preview/${jobId}/scene_${i + 1}_image_v2.png`
      }
    } catch (err) {
      console.error(`[server] Scene image regeneration failed for scene ${i + 1}:`, err.message)
      throw new Error(`Failed to regenerate scene image: ${err.message}`)
    }

    // ── Step 3: Generate new video clip ──
    updateJob(jobId, {
      currentStep: 'generating_videos',
      stepDetail: `Rendering new video clip for scene ${i + 1}...`,
      progress: 40,
    })

    const newClipPath = path.join(tmpDir, `scene_${i + 1}_clip_v2.mp4`)
    await generateVideoClip(sd.sceneImagePath, scene, newClipPath, jobId, {
      aspectRatio,
      quality,
    })

    // Update references
    videoClipPaths[i] = newClipPath
    sd.clipPath = newClipPath

    const jobObj2 = getJob(jobId)
    if (jobObj2) {
      if (!jobObj2.previews) jobObj2.previews = {}
      jobObj2.previews[`scene_${i + 1}_video`] = `/api/preview/${jobId}/scene_${i + 1}_clip_v2.mp4`
    }

    // ── Step 4: Regenerate voiceover for this scene ──
    updateJob(jobId, {
      currentStep: 'generating_voiceover',
      stepDetail: `Generating voiceover for scene ${i + 1}...`,
      progress: 65,
    })

    const newVoPath = path.join(tmpDir, `scene_${i + 1}_vo_v2.mp3`)
    try {
      await generateTimedVoiceoverSegment(jobId, scene, sd.voiceoverScript, newVoPath, language)
      sd.voPath = newVoPath
    } catch (err) {
      console.warn(`[server] Voiceover regen failed for scene ${i + 1}:`, err.message)
      // Keep the original voiceover
    }

    // ── Step 5: Concatenate all voiceovers ──
    const allVoPaths = sceneData.map(s => s.voPath)
    let voiceoverPath = allVoPaths[0]

    if (allVoPaths.length > 1) {
      const combinedVoPath = path.join(tmpDir, 'voiceover_v2.mp3')
      const filelistPath = path.join(tmpDir, 'vo_filelist_v2.txt')
      const content = allVoPaths.map(p => `file '${p.replace(/\\/g, '/')}'`).join('\n')
      await fsp.writeFile(filelistPath, content)

      voiceoverPath = await new Promise((resolve, reject) => {
        ffmpeg()
          .input(filelistPath)
          .inputOptions(['-f', 'concat', '-safe', '0'])
          .outputOptions(['-c:a', 'libmp3lame', '-b:a', '192k', '-ar', '44100', '-ac', '2'])
          .output(combinedVoPath)
          .on('end', () => resolve(combinedVoPath))
          .on('error', (err) => reject(err))
          .run()
      })
    }

    // ── Step 6: Re-merge all clips + audio ──
    updateJob(jobId, {
      currentStep: 'merging',
      stepDetail: 'Re-merging video with updated scene...',
      progress: 80,
    })

    const mergedRawPath = path.join(tmpDir, 'merged_raw_v2.mp4')
    await concatVideos(videoClipPaths, mergedRawPath, aspectRatio)

    const mergedPath = path.join(tmpDir, 'merged_v2.mp4')
    await reencodeVideo(mergedRawPath, mergedPath)

    const sfxPath = await generateSceneSoundEffects(jobId, sceneData.map(s => s.scene || s), tmpDir)
    const musicPath = ctx.musicPath
    const mixedPath = path.join(tmpDir, 'mixed_audio_v2.mp4')
    await mixAudio(mergedPath, musicPath, voiceoverPath, mixedPath, sfxPath)
    const finalPath = path.join(tmpDir, 'final_v2.mp4')
    await addBrandEndCard(mixedPath, finalPath)

    // Copy to public directory
    const publicPath = path.join(publicDir, `${jobId}.mp4`)
    await fsp.copyFile(finalPath, publicPath)

    // Update pipeline context with new paths
    ctx.voiceoverPath = voiceoverPath
    ctx.sfxPath = sfxPath

    // Mark complete
    const videoUrl = `/api/video/${jobId}`
    completeJob(jobId, videoUrl, job.scenes, job.totalDuration)

    console.log(`[server] Scene ${i + 1} regenerated successfully for job ${jobId}`)
    return videoUrl
  } catch (err) {
    if (err.message === 'CANCELLED') {
      console.log(`Job ${jobId} scene regen was cancelled`)
    } else {
      console.error(`Scene regeneration failed for job ${jobId}, scene ${i + 1}:`, err)
      failJob(jobId, `Scene ${i + 1} regeneration failed: ${err.message}`)
    }
    throw err
  }
}
