import React, { useRef, useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Download, RefreshCw, Play, Pause, Pencil, X, Loader2, Send } from 'lucide-react'

export default function ResultSection({ jobId, status, onRegenerate, onSceneEdit }) {
  const videoRef = useRef(null)
  const videoUrl = status?.videoUrl || `/api/video/${jobId}`
  const scenes = status?.scenes || []
  const [isPlaying, setIsPlaying] = useState(true)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [editingScene, setEditingScene] = useState(null) // { index, scene }
  const [editNote, setEditNote] = useState('')
  const [submittingEdit, setSubmittingEdit] = useState(false)

  const sceneStarts = useMemo(() => {
    let cursor = 0
    return scenes.map(scene => {
      const start = cursor
      cursor += Number(scene.duration_seconds) || 0
      return start
    })
  }, [scenes])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const onTime = () => setCurrentTime(video.currentTime || 0)
    const onMeta = () => setDuration(video.duration || status?.totalDuration || 0)
    video.addEventListener('timeupdate', onTime)
    video.addEventListener('loadedmetadata', onMeta)
    return () => {
      video.removeEventListener('timeupdate', onTime)
      video.removeEventListener('loadedmetadata', onMeta)
    }
  }, [status?.totalDuration])

  const togglePlay = () => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      video.play()
      setIsPlaying(true)
    } else {
      video.pause()
      setIsPlaying(false)
    }
  }

  const seekTo = (time) => {
    if (!videoRef.current) return
    videoRef.current.currentTime = time
    setCurrentTime(time)
  }

  const fmt = (sec) => {
    const safe = Number.isFinite(sec) ? sec : 0
    const m = Math.floor(safe / 60)
    const s = Math.floor(safe % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const activeScene = sceneStarts.findIndex((start, i) => {
    const next = sceneStarts[i + 1] ?? Infinity
    return currentTime >= start && currentTime < next
  })

  const openEditModal = (sceneIndex, scene) => {
    setEditingScene({ index: sceneIndex, scene })
    setEditNote('')
  }

  const closeEditModal = () => {
    setEditingScene(null)
    setEditNote('')
    setSubmittingEdit(false)
  }

  const handleEditSubmit = async () => {
    if (!editNote.trim() || !editingScene || !onSceneEdit) return
    setSubmittingEdit(true)
    try {
      await onSceneEdit(jobId, editingScene.index, editNote.trim())
      closeEditModal()
    } catch (err) {
      console.error('Scene edit failed:', err)
      setSubmittingEdit(false)
    }
  }

  return (
    <section id="result" className="result-section">
      <motion.div
        className="result-header"
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
      >
        <div className="section-label">// PERFECTION ACHIEVED - TRANSCENDENCE COMPLETE</div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12, ease: [0.16, 1, 0.3, 1] }}
        className="video-wrapper completion-burst"
      >
        <video
          ref={videoRef}
          id="result-video-player"
          src={videoUrl}
          autoPlay
          playsInline
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
        />
        <div className="custom-controls">
          <button type="button" onClick={togglePlay} aria-label={isPlaying ? 'Pause video' : 'Play video'}>
            {isPlaying ? <Pause size={17} /> : <Play size={17} />}
          </button>
          <input
            type="range"
            min="0"
            max={duration || 0}
            step="0.1"
            value={currentTime}
            onChange={(e) => seekTo(Number(e.target.value))}
            aria-label="Video progress"
          />
          <span>{fmt(currentTime)} / {fmt(duration)}</span>
        </div>
      </motion.div>

      <motion.div
        className="result-actions"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.22, ease: [0.16, 1, 0.3, 1] }}
      >
        <a href={videoUrl} download={`aizen-video-${jobId}.mp4`} id="download-button" className="btn-download">
          <Download size={18} /> ◈ DOWNLOAD MP4
        </a>
        <button onClick={onRegenerate} className="btn-outline">
          <RefreshCw size={16} /> ↺ REGENERATE
        </button>
      </motion.div>

      {scenes.length > 0 && (
        <motion.div
          className="scene-gallery-wrap"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.32, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="section-label">// SCENE GALLERY — Click a scene to jump, or edit to refine</div>
          <div className="scene-gallery">
            {scenes.map((scene, i) => {
              const numStr = (scene.scene_number || i + 1).toString().padStart(2, '0')
              return (
                <div
                  key={scene.scene_number || i}
                  className={`scene-card ${activeScene === i ? 'active' : ''}`}
                >
                  <button
                    type="button"
                    className="scene-card-body"
                    onClick={() => seekTo(sceneStarts[i] || 0)}
                  >
                    <div>
                      <strong>SCENE {numStr}</strong>
                      <span>{scene.duration_seconds}S</span>
                    </div>
                    <p>{scene.scene_description}</p>
                    {scene.key_message && <em>{scene.key_message}</em>}
                  </button>
                  <button
                    type="button"
                    className="scene-edit-btn"
                    onClick={(e) => {
                      e.stopPropagation()
                      openEditModal(i, scene)
                    }}
                    aria-label={`Edit scene ${numStr}`}
                    title="Edit this scene"
                  >
                    <Pencil size={14} />
                    <span>Edit</span>
                  </button>
                </div>
              )
            })}
          </div>
        </motion.div>
      )}

      {/* Edit Scene Modal */}
      <AnimatePresence>
        {editingScene && (
          <motion.div
            className="scene-edit-modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeEditModal}
          >
            <motion.div
              className="scene-edit-modal"
              initial={{ scale: 0.92, y: 24, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.92, y: 24, opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              onClick={(e) => e.stopPropagation()}
            >
              <button className="modal-close-btn" onClick={closeEditModal} aria-label="Close edit modal">
                <X size={18} />
              </button>

              <div className="scene-edit-header">
                <Pencil size={20} />
                <h3>Edit Scene {(editingScene.index + 1).toString().padStart(2, '0')}</h3>
              </div>

              <div className="scene-edit-context">
                <strong>Current Description:</strong>
                <p>{editingScene.scene?.scene_description}</p>
                {editingScene.scene?.key_message && (
                  <>
                    <strong>Key Message:</strong>
                    <p>{editingScene.scene.key_message}</p>
                  </>
                )}
              </div>

              <div className="scene-edit-input">
                <label htmlFor="edit-note-input">What should be changed?</label>
                <textarea
                  id="edit-note-input"
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                  placeholder="e.g. Remove the glitch on the product label, make the background darker, add more movement to the camera..."
                  rows={4}
                  disabled={submittingEdit}
                  autoFocus
                />
              </div>

              <div className="scene-edit-actions">
                <button
                  type="button"
                  className="btn-outline"
                  onClick={closeEditModal}
                  disabled={submittingEdit}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-bankai compact"
                  onClick={handleEditSubmit}
                  disabled={!editNote.trim() || submittingEdit}
                >
                  {submittingEdit ? (
                    <>
                      <Loader2 size={16} className="spin" />
                      REGENERATING...
                    </>
                  ) : (
                    <>
                      <Send size={16} />
                      REGENERATE SCENE
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}
