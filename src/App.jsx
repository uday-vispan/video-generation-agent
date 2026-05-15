import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle } from 'lucide-react'
import HeroSection from './components/HeroSection.jsx'
import UploadForm from './components/UploadForm.jsx'
import ProgressTracker from './components/ProgressTracker.jsx'
import ResultSection from './components/ResultSection.jsx'
import HogyokuIcon from './components/HogyokuIcon.jsx'
import axios from 'axios'

const API_BASE = '/api'

function getApiErrorMessage(err, fallback = 'Request failed. Please try again.') {
  if (err.code === 'ERR_NETWORK' || err.message === 'Network Error') {
    return 'Backend connection unavailable. Please make sure the server is running on http://localhost:3000, then try again.'
  }
  return err.response?.data?.error || err.message || fallback
}

function App() {
  const [stage, setStage] = useState('upload')
  const [jobId, setJobId] = useState(null)
  const [jobStatus, setJobStatus] = useState(null)
  const [error, setError] = useState(null)
  const [ripples, setRipples] = useState([])
  const [activating, setActivating] = useState(false)
  const [introVisible, setIntroVisible] = useState(true)

  const particles = useMemo(() => (
    Array.from({ length: 38 }, (_, i) => ({
      id: i,
      left: `${(i * 23) % 100}vw`,
      size: `${2 + (i % 5)}px`,
      duration: `${9 + (i % 8)}s`,
      delay: `${(i % 9) * 0.6}s`,
      color: i % 4 === 0 ? 'rgba(255,255,255,0.88)' : 'rgba(157,78,221,0.85)',
    }))
  ), [])

  useEffect(() => {
    const introTimer = setTimeout(() => setIntroVisible(false), 1200)
    return () => clearTimeout(introTimer)
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      const id = Date.now()
      setRipples(prev => [
        ...prev.slice(-3),
        { id, left: `${Math.random() * 100}%`, top: `${Math.random() * 100}%` },    
      ])
      setTimeout(() => {
        setRipples(prev => prev.filter(r => r.id !== id))
      }, 6200)
    }, 6000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    let errorCount = 0
    if (stage !== 'processing' || !jobId) return
    const interval = setInterval(async () => {
      try {
        const { data } = await axios.get(`${API_BASE}/status/${jobId}`)
        errorCount = 0
        setJobStatus(data)
        if (data.status === 'completed') {
          setStage('done')
          clearInterval(interval)
        } else if (data.status === 'failed') {
          setStage('error')
          setError(data.error || 'Video generation failed. Please try again.')
          clearInterval(interval)
        }
      } catch (err) {
        console.error('Status poll error:', err)
        errorCount += 1
        if (errorCount >= 4) {
          setStage('error')
          setError(getApiErrorMessage(err, 'Server connection lost. Please check if the backend is running.'))
          clearInterval(interval)
        }
      }
    }, 3000)
    return () => clearInterval(interval)
  }, [stage, jobId])

  const triggerActivation = useCallback(() => {
    setActivating(true)
    setTimeout(() => setActivating(false), 700)
  }, [])

  const handleSubmit = useCallback(async (formData) => {
    try {
      triggerActivation()
      setError(null)
      setStage('processing')
      setJobStatus(null)
      const { data } = await axios.post(`${API_BASE}/generate`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setJobId(data.jobId)
    } catch (err) {
      setStage('error')
      setError(getApiErrorMessage(err, 'Failed to start video generation'))
    }
  }, [triggerActivation])

  const handleReset = useCallback(() => {
    setStage('upload')
    setJobId(null)
    setJobStatus(null)
    setError(null)
  }, [])

  const handleCancel = useCallback(async () => {
    if (!jobId || stage !== 'processing') return
    try {
      await axios.post(`${API_BASE}/cancel/${jobId}`)
    } catch (err) {
      console.error('Failed to cancel on backend:', err)
    } finally {
      setStage('error')
      setError('Generation cancelled by user.')
    }
  }, [jobId, stage])

  const handleSceneEdit = useCallback(async (editJobId, sceneIndex, editNote) => {
    try {
      setError(null)
      setStage('processing')
      setJobId(editJobId)
      await axios.post(`${API_BASE}/regenerate-scene`, {
        jobId: editJobId,
        sceneIndex,
        editNote,
      })
    } catch (err) {
      setStage('error')
      setError(getApiErrorMessage(err, 'Failed to start scene regeneration'))
    }
  }, [])

  return (
    <div className="aizen-app">
      <div className="void-field" aria-hidden="true" />
      <div className="mirror-cracks" aria-hidden="true" />
      <div className="hogyoku-page-pulse" aria-hidden="true" />
      <div className="particle-layer" aria-hidden="true">
        {particles.map(p => (
          <span
            key={p.id}
            className="particle"
            style={{
              left: p.left,
              width: p.size,
              height: p.size,
              background: p.color,
              animationDuration: p.duration,
              animationDelay: p.delay,
            }}
          />
        ))}
      </div>
      {ripples.map(ripple => (
        <span
          key={ripple.id}
          className="spiritual-ripple"
          style={{ left: ripple.left, top: ripple.top }}
          aria-hidden="true"
        />
      ))}
      {activating && <span className="activation-ring" aria-hidden="true" />}

      <AnimatePresence>
        {introVisible && (
          <motion.div
            className="intro-veil"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <HogyokuIcon className="intro-orb" size={86} />
          </motion.div>
        )}
      </AnimatePresence>

      <nav className="navbar">
        <a href="#" className="nav-brand" onClick={(e) => { e.preventDefault(); handleReset(); }}>
          <HogyokuIcon className="brand-orb" size={32} />
          <span>AIZEN</span>
        </a>
      </nav>

      <main className="app-content">
        <HeroSection />

        <div className="main-container">
          <AnimatePresence mode="wait">
            {stage === 'upload' && (
              <motion.div
                key="upload"
                initial={{ opacity: 0, y: 22 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              >
                <UploadForm onSubmit={handleSubmit} onActivate={triggerActivation} />
              </motion.div>
            )}

            {stage === 'processing' && (
              <motion.div
                key="processing"
                initial={{ opacity: 0, y: 22 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              >
                <ProgressTracker status={jobStatus} onCancel={handleCancel} />
              </motion.div>
            )}

            {stage === 'done' && jobStatus && (
              <motion.div
                key="result"
                initial={{ opacity: 0, y: 22 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              >
                <ResultSection jobId={jobId} status={jobStatus} onRegenerate={handleReset} onSceneEdit={handleSceneEdit} />
              </motion.div>
            )}

            {stage === 'error' && (
              <motion.div
                key="error"
                initial={{ opacity: 0, y: 22 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                className="error-wrap"
              >
                <div className="mission-card error-card">
                  <div className="error-icon">
                    <AlertTriangle size={24} />
                  </div>
                  <h3>Illusion Fractured</h3>
                  <p>{error}</p>
                  <button className="btn-bankai compact" onClick={handleReset}>Return To Control</button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <footer>
          <div className="footer-line" />
          <div className="footer-brand">
            <HogyokuIcon size={22} />
            <span>AIZEN - AI Video Agent</span>
            <HogyokuIcon size={22} />
          </div>
          <div className="footer-powered">
            Powered by ChatGPT - Gemini - fal MiniMax Hailuo - ElevenLabs - Suno
          </div>
        </footer>
      </main>
    </div>
  )
}

export default App
