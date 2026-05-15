import React, { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Loader2, X, Video } from 'lucide-react'

const BASE_STEPS = [
  { key: 'analyzing', label: 'Script Intelligence', estimate: 45 },
  { key: 'generating_images', label: 'Scene Visuals', estimate: 210 },
  { key: 'generating_videos', label: 'fal MiniMax Hailuo Render', estimate: 360 },
  { key: 'generating_voiceover', label: 'Voice Synthesis', estimate: 45 },
  { key: 'generating_music', label: 'Background Resonance', estimate: 45 },
  { key: 'merging', label: 'Final Convergence', estimate: 15 },
  { key: 'completed', label: 'Perfection Achieved', estimate: 0 },
]

const TOTAL_ETA_SECONDS = 720

export default function ProgressTracker({ status, onCancel }) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [startTime] = useState(Date.now())
  const [modalPreview, setModalPreview] = useState(null)

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [startTime])

  const currentStep = status?.currentStep || 'analyzing'
  const progress = status?.progress || 0
  const previews = status?.previews || {}
  const warnings = status?.warnings || []
  const steps = useMemo(() => BASE_STEPS, [])
  const currentStepIndex = Math.max(0, steps.findIndex(s => s.key === currentStep))
  const remainingEstimate = Math.max(0, TOTAL_ETA_SECONDS - elapsedSeconds)
  const previewItems = Object.entries(previews).map(([key, url], index) => ({ key, url, index }))

  const logs = useMemo(() => {
    const active = steps[currentStepIndex] || steps[0]
    return [
      { level: 'sys', text: `Pipeline authority accepted for job ${status?.jobId?.slice(0, 8) || 'pending'}.` },
      { level: progress > 0 ? 'ok' : 'wait', text: `${active.label} engaged at ${progress} percent.` },
      { level: previewItems.length ? 'ok' : 'wait', text: previewItems.length ? `${previewItems.length} preview artifact${previewItems.length === 1 ? '' : 's'} stabilized.` : 'Preview artifacts pending manifestation.' },
      ...warnings.slice(-3).map(text => ({ level: 'wait', text })),
      { level: status?.error ? 'err' : 'sys', text: status?.stepDetail || 'fal MiniMax Hailuo rendering can take 15 minutes or more.' },
    ]
  }, [currentStepIndex, previewItems.length, progress, status?.error, status?.jobId, status?.stepDetail, steps, warnings])

  const fmt = (sec) => {
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return m > 0 ? `${m}m ${s}s` : `${s}s`
  }

  return (
    <section id="pipeline" className="pipeline-layout">
      <div className="pipeline-main">
        <div className="section-label pipeline-title-row">
          <span>// TRANSCENDENCE LOG</span>
          <button onClick={onCancel} className="abort-button">
            <X size={14} /> ABORT
          </button>
        </div>

        <div className="mission-card pipeline-card">
          <div className="card-corners" aria-hidden="true" />
          <div className="progress-head">
            <h2>{steps[currentStepIndex]?.label || 'Pipeline Active'}</h2>
            <span>{progress}%</span>
          </div>
          <div className="progress-bar-container">
            <motion.div
              className="progress-bar-fill"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            />
          </div>
          <div className="time-strip">
            <span>Elapsed: {fmt(elapsedSeconds)}</span>
            <span>ETA: {fmt(remainingEstimate)}</span>
          </div>

          <div className="timing-table">
            <div className="timing-row timing-header">
              <span>Stage</span>
              <span>Start</span>
              <span>Live Timing</span>
              <span>Status</span>
            </div>
            {steps.slice(0, -1).map((step, i) => {
              const isDone = currentStepIndex > i
              const isActive = currentStepIndex === i
              const liveTiming = isActive ? fmt(elapsedSeconds) : isDone ? 'Done' : `~${fmt(step.estimate)}`
              return (
                <div key={step.key} className={`timing-row ${isActive ? 'active' : ''} ${isDone ? 'done' : ''}`}>
                  <span>{step.label}</span>
                  <span>{isDone || isActive ? 'Now' : '--'}</span>
                  <span>{liveTiming}</span>
                  <span>{isDone ? 'Ready' : isActive ? 'Generating' : 'Waiting'}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <aside className="pipeline-side">
        <div className="section-label">// PERFECT WORLD PREVIEW</div>
        <div className="mission-card preview-panel">
          <div className="card-corners" aria-hidden="true" />
          <div className="preview-scroll">
            {previewItems.length === 0 && (
              <div className="empty-preview">
                <Loader2 className="spin" size={24} />
                <span>Awaiting first manifestation</span>
              </div>
            )}
            <AnimatePresence>
              {previewItems.map(item => {
                const isVideo = item.key.includes('_video') || item.url.endsWith('.mp4')
                const title = item.key.replace(/_/g, ' ').replace('scene ', 'Scene ')
                return (
                  <motion.button
                    type="button"
                    key={item.key}
                    className={`preview-card ${isVideo ? 'ready' : 'generating'} ${item.index === previewItems.length - 1 ? 'active' : ''}`}
                    initial={{ opacity: 0, x: 40, y: 12 }}
                    animate={{ opacity: 1, x: 0, y: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ duration: 0.4 }}
                    onClick={() => setModalPreview({ ...item, isVideo, title })}
                  >
                    <div className="preview-media">
                      {isVideo ? (
                        <video src={item.url} autoPlay loop muted playsInline />
                      ) : (
                        <img src={item.url} alt={title} className="shatter-in" />
                      )}
                      {isVideo && <Video size={15} />}
                    </div>
                    <strong>{title}</strong>
                    <span>{isVideo ? 'Ready' : 'Generating'}</span>
                  </motion.button>
                )
              })}
            </AnimatePresence>
          </div>
        </div>

        <div className="section-label log-label">// SYSTEM SCRIPTURE</div>
        <div className="log-panel">
          {logs.map((log, i) => (
            <p key={`${log.level}-${i}-${log.text}`} className="log-line" style={{ animationDelay: `${i * 0.08}s` }}>
              <span className={log.level}>[{log.level.toUpperCase()}]</span> {log.text}
            </p>
          ))}
        </div>
      </aside>

      <AnimatePresence>
        {modalPreview && (
          <motion.div className="preview-modal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setModalPreview(null)}>
            <motion.div className="preview-modal-card" initial={{ scale: 0.94, y: 18 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.94, y: 18 }} onClick={(e) => e.stopPropagation()}>
              <button className="modal-close" onClick={() => setModalPreview(null)} aria-label="Close preview">
                <X size={18} />
              </button>
              {modalPreview.isVideo ? (
                <video src={modalPreview.url} controls autoPlay />
              ) : (
                <img src={modalPreview.url} alt={modalPreview.title} />
              )}
              <strong>{modalPreview.title}</strong>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}
