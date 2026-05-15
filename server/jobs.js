// In-memory job state store
// Each job tracks: status, currentStep, progress, scenes, videoUrl, error, createdAt

const jobs = new Map()

export function createJob(jobId) {
  const job = {
    jobId,
    status: 'processing',
    currentStep: 'analyzing',
    stepDetail: 'Analyzing script and generating prompts...',
    progress: 0,
    scenes: [],
    videoUrl: null,
    totalDuration: 0,
    error: null,
    warnings: [],
    createdAt: new Date().toISOString(),
    isCancelled: false,
  }
  jobs.set(jobId, job)
  return job
}

export function getJob(jobId) {
  return jobs.get(jobId) || null
}

export function updateJob(jobId, updates) {
  const job = jobs.get(jobId)
  if (!job) return null
  Object.assign(job, updates)
  jobs.set(jobId, job)
  return job
}

export function addJobWarning(jobId, warning) {
  const job = jobs.get(jobId)
  if (!job) return null
  const warnings = Array.isArray(job.warnings) ? job.warnings : []
  const message = typeof warning === 'string' ? warning : warning?.message || 'A service is unavailable right now.'
  job.warnings = [...warnings, message]
  job.stepDetail = message
  jobs.set(jobId, job)
  return job
}

export function cancelJob(jobId) {
  const job = jobs.get(jobId)
  if (job && job.status === 'processing') {
    return updateJob(jobId, {
      status: 'cancelled',
      isCancelled: true,
      error: 'Job cancelled by user',
    })
  }
  return job
}

export function failJob(jobId, error) {
  return updateJob(jobId, {
    status: 'failed',
    error: typeof error === 'string' ? error : error?.message || 'Unknown error',
  })
}

export function completeJob(jobId, videoUrl, scenes, totalDuration) {
  return updateJob(jobId, {
    status: 'completed',
    currentStep: 'completed',
    progress: 100,
    videoUrl,
    scenes,
    totalDuration,
  })
}

// Store pipeline context so per-scene regeneration can re-use cached data
export function storeJobPipelineContext(jobId, context) {
  const job = jobs.get(jobId)
  if (!job) return null
  job.pipelineContext = context
  jobs.set(jobId, job)
  return job
}

// Progress step mappings with cumulative percentages
export const STEP_PROGRESS = {
  analyzing: { min: 0, max: 10 },
  generating_images: { min: 10, max: 30 },
  generating_videos: { min: 30, max: 70 },
  generating_voiceover: { min: 70, max: 80 },
  generating_music: { min: 80, max: 88 },
  merging: { min: 88, max: 98 },
  completed: { min: 100, max: 100 },
}

export function setStep(jobId, step, detail = '') {
  const stepProgress = STEP_PROGRESS[step]
  return updateJob(jobId, {
    currentStep: step,
    stepDetail: detail,
    progress: stepProgress ? stepProgress.min : 0,
  })
}

export function setStepProgress(jobId, step, fraction) {
  const stepProgress = STEP_PROGRESS[step]
  if (!stepProgress) return
  const progress = stepProgress.min + (stepProgress.max - stepProgress.min) * Math.min(fraction, 1)
  return updateJob(jobId, { progress: Math.round(progress) })
}
