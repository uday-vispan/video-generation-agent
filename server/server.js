import express from 'express'
import cors from 'cors'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import fsp from 'fs/promises'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import crypto from 'crypto'
import { createJob, getJob } from './jobs.js'
import { runPipeline, regenerateScene } from './pipeline.js'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const PORT = process.env.PORT || 3000

// ── Middleware ──
app.use(cors())
app.use(express.json())

// Serve generated videos
const videosDir = path.join(process.cwd(), 'public', 'videos')
fs.mkdirSync(videosDir, { recursive: true })

// ── Multer config for file uploads ──
const uploadsDir = path.join(process.cwd(), 'uploads')
fs.mkdirSync(uploadsDir, { recursive: true })

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const jobDir = path.join(uploadsDir, req.uploadId || 'temp')
    fs.mkdirSync(jobDir, { recursive: true })
    cb(null, jobDir)
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname)
    const name = `${file.fieldname}_${Date.now()}${ext}`
    cb(null, name)
  },
})

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'images') {
      const allowed = /\.(jpg|jpeg|png|webp)$/i
      if (!allowed.test(file.originalname)) {
        return cb(new Error('Only JPG, PNG, and WebP images are allowed'))
      }
    }
    if (file.fieldname === 'scriptFile') {
      if (!file.originalname.endsWith('.txt')) {
        return cb(new Error('Only .txt script files are allowed'))
      }
    }
    cb(null, true)
  },
})

// ── API Routes ──

// POST /api/generate — Start video generation
app.get('/api/health', (req, res) => {
  res.json({ ok: true, status: 'running' })
})

app.post('/api/generate', (req, res, next) => {
  const jobId = crypto.randomUUID()
  req.uploadId = jobId
  next()
}, upload.fields([
  { name: 'images', maxCount: 10 },
  { name: 'scriptFile', maxCount: 1 },
]), async (req, res) => {
  try {
    const jobId = req.uploadId

    // Get script text
    let script = req.body?.scriptText || ''

    if (!script && req.files?.scriptFile?.[0]) {
      const scriptFilePath = req.files.scriptFile[0].path
      script = await fsp.readFile(scriptFilePath, 'utf-8')
    }

    if (!script || script.trim().length === 0) {
      return res.status(400).json({ error: 'No script provided. Please enter text or upload a .txt file.' })
    }

    // Get image paths
    const imagePaths = (req.files?.images || []).map(f => f.path)

    // Get video settings from form
    const videoOptions = {
      aspectRatio: req.body?.aspectRatio || '9:16',
      quality: req.body?.quality || 'standard',
    }

    // Create job
    const job = createJob(jobId)

    // Start pipeline asynchronously
    runPipeline(jobId, script.trim(), imagePaths, videoOptions).catch(err => {
      console.error(`Pipeline error for ${jobId}:`, err)
    })

    res.json({ jobId, status: 'processing' })
  } catch (err) {
    console.error('Upload error:', err)
    res.status(500).json({ error: err.message || 'Failed to process upload' })
  }
})

// GET /api/status/:jobId — Poll job status
app.get('/api/status/:jobId', (req, res) => {
  const job = getJob(req.params.jobId)
  if (!job) {
    return res.status(404).json({ error: 'Job not found' })
  }

  res.json({
    jobId: job.jobId,
    status: job.status,
    currentStep: job.currentStep,
    stepLabel: job.stepDetail,
    stepDetail: job.stepDetail,
    progress: job.progress,
    videoUrl: job.videoUrl,
    scenes: job.scenes,
    totalDuration: job.totalDuration,
    error: job.error,
    warnings: job.warnings || [],
    createdAt: job.createdAt,
    previews: job.previews || {}, // Map of step -> preview URL
  })
})

// POST /api/cancel/:jobId — Cancel a job
app.post('/api/cancel/:jobId', (req, res) => {
  const job = getJob(req.params.jobId)
  if (!job) {
    return res.status(404).json({ error: 'Job not found' })
  }
  if (job.status !== 'processing') {
    return res.status(400).json({ error: 'Job is not processing' })
  }

  import('./jobs.js')
    .then(({ cancelJob }) => cancelJob(job.jobId))
    .catch(err => console.error('Failed to cancel job internally:', err));

  res.json({ success: true, message: 'Job cancelled' })
})

// POST /api/regenerate-scene — Regenerate a single scene with user feedback
app.post('/api/regenerate-scene', express.json(), async (req, res) => {
  try {
    const { jobId, sceneIndex, editNote } = req.body

    if (!jobId || sceneIndex === undefined || sceneIndex === null) {
      return res.status(400).json({ error: 'jobId and sceneIndex are required' })
    }
    if (!editNote || editNote.trim().length === 0) {
      return res.status(400).json({ error: 'editNote is required — describe what to change' })
    }

    const job = getJob(jobId)
    if (!job) {
      return res.status(404).json({ error: 'Job not found' })
    }
    if (!job.pipelineContext) {
      return res.status(400).json({ error: 'No pipeline context available. The full video must be generated first.' })
    }

    // Start regeneration asynchronously
    regenerateScene(jobId, Number(sceneIndex), editNote.trim()).catch(err => {
      console.error(`Scene regeneration error for ${jobId}:`, err)
    })

    res.json({ jobId, sceneIndex, status: 'processing', message: `Regenerating scene ${Number(sceneIndex) + 1}...` })
  } catch (err) {
    console.error('Scene regeneration request error:', err)
    res.status(500).json({ error: err.message || 'Failed to start scene regeneration' })
  }
})

// GET /api/preview/:jobId/:filename — Serve a preview file
app.get('/api/preview/:jobId/:filename', (req, res) => {
  const { jobId, filename } = req.params
  // Prevent directory traversal
  const safeFilename = path.basename(filename)
  const filePath = path.join(process.cwd(), 'tmp', `video_${jobId}`, safeFilename)

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Preview not found' })
  }
  res.sendFile(filePath)
})

// GET /api/video/:jobId — Serve the final video
app.get('/api/video/:jobId', (req, res) => {
  const videoPath = path.join(videosDir, `${req.params.jobId}.mp4`)

  if (!fs.existsSync(videoPath)) {
    return res.status(404).json({ error: 'Video not found' })
  }

  const stat = fs.statSync(videoPath)
  const fileSize = stat.size
  const range = req.headers.range

  if (range) {
    // Support range requests for video streaming
    const parts = range.replace(/bytes=/, '').split('-')
    const start = parseInt(parts[0], 10)
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1
    const chunkSize = end - start + 1

    const stream = fs.createReadStream(videoPath, { start, end })
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': 'video/mp4',
    })
    stream.pipe(res)
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': 'video/mp4',
    })
    fs.createReadStream(videoPath).pipe(res)
  }
})

// ── Error handling middleware ──
app.use((err, req, res, next) => {
  console.error('Server error:', err)

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 50MB.' })
    }
    return res.status(400).json({ error: err.message })
  }

  res.status(500).json({ error: err.message || 'Internal server error' })
})

// ── Start server ──
app.listen(PORT, () => {
  const falKeyName = process.env.FAL_API_KEY ? 'FAL_API_KEY' : process.env.FAL_KEY ? 'FAL_KEY' : process.env.FALAI_API_KEY ? 'FALAI_API_KEY' : null
  console.log(`\n🚀 AI Video Generator server running on http://localhost:${PORT}`)
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`)
  console.log(`   OpenAI API:   ${process.env.OPENAI_API_KEY ? '✅ configured' : '❌ missing'}`)
  console.log(`   Gemini API: ${process.env.GEMINI_API_KEY ? '✅ configured' : '❌ missing'}`)
  console.log(`   fal AI:     ${falKeyName ? `✅ configured (${falKeyName})` : '❌ missing (set FAL_API_KEY or FAL_KEY; LUMA_API_KEY is ignored)'}`)
  console.log(`   ElevenLabs: ${process.env.ELEVENLABS_API_KEY ? '✅ configured' : '❌ missing'}`)
  console.log(`   Suno AI:    ${process.env.SUNO_API_KEY ? '✅ configured' : '❌ missing'}\n`)
})
