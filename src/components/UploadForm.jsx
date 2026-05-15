import React, { useState, useCallback, useEffect, useRef } from 'react'
import { useDropzone } from 'react-dropzone'
import { motion, AnimatePresence } from 'framer-motion'
import { FileText, X, Loader2, Settings2, Monitor } from 'lucide-react'
import HogyokuIcon from './HogyokuIcon.jsx'

export default function UploadForm({ onSubmit, onActivate }) {
  const [scriptText, setScriptText] = useState('')
  const [scriptFile, setScriptFile] = useState(null)
  const [scriptFileText, setScriptFileText] = useState('')
  const [images, setImages] = useState([])
  const imagesRef = useRef([])
  const [submitting, setSubmitting] = useState(false)
  const [inputMode, setInputMode] = useState('text')
  const [showSettings, setShowSettings] = useState(true)
  const [aspectRatio, setAspectRatio] = useState('9:16')

  const onDropImages = useCallback((acceptedFiles) => {
    const newImages = acceptedFiles.map(file => ({
      file,
      preview: URL.createObjectURL(file),
      id: `${file.name}-${Date.now()}-${Math.random()}`,
    }))
    setImages(prev => [...prev, ...newImages])
  }, [])

  useEffect(() => {
    imagesRef.current = images
  }, [images])

  useEffect(() => {
    return () => {
      imagesRef.current.forEach(img => URL.revokeObjectURL(img.preview))
    }
  }, [])

  const removeImage = useCallback((id) => {
    setImages(prev => {
      const img = prev.find(i => i.id === id)
      if (img) URL.revokeObjectURL(img.preview)
      return prev.filter(i => i.id !== id)
    })
  }, [])

  const clearScriptFile = useCallback(() => {
    setScriptFile(null)
    setScriptFileText('')
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: onDropImages,
    accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp'] },
    multiple: true,
  })

  const handleScriptFileDrop = useCallback((acceptedFiles) => {
    if (acceptedFiles.length === 0) return
    const file = acceptedFiles[0]
    setScriptFile(file)
    setScriptFileText('')

    const reader = new FileReader()
    reader.onload = () => setScriptFileText(String(reader.result || ''))
    reader.onerror = () => setScriptFileText('Unable to preview this script file.')
    reader.readAsText(file)
  }, [])

  const {
    getRootProps: getScriptDropProps,
    getInputProps: getScriptDropInputProps,
    isDragActive: isScriptDragActive,
  } = useDropzone({
    onDrop: handleScriptFileDrop,
    accept: { 'text/plain': ['.txt'] },
    multiple: false,
  })

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (inputMode === 'text' && !scriptText.trim()) return
    if (inputMode === 'file' && !scriptFile) return

    onActivate?.()
    setSubmitting(true)
    const formData = new FormData()
    if (inputMode === 'text') {
      formData.append('scriptText', scriptText)
    } else {
      formData.append('scriptFile', scriptFile)
    }
    images.forEach(img => formData.append('images', img.file))
    formData.append('aspectRatio', aspectRatio)

    try {
      await onSubmit(formData)
    } finally {
      setSubmitting(false)
    }
  }

  const wordCount = scriptText.split(/\s+/).filter(Boolean).length
  const estimatedRenderWindow = '12m ETA'
  const canSubmit = (
    (inputMode === 'text' && scriptText.trim().length > 0) ||
    (inputMode === 'file' && scriptFile !== null)
  ) && !submitting

  const aspectOptions = [
    { value: '9:16', label: '9:16', desc: 'Vertical reel' },
    { value: '16:9', label: '16:9', desc: 'Landscape ad' },
    { value: '1:1', label: '1:1', desc: 'Square post' },
  ]

  const pipelineRows = [
    ['01', 'Script cognition', inputMode === 'text' ? `${wordCount} words` : scriptFile ? scriptFile.name : 'Awaiting text'],
    ['02', 'Reference offering', images.length ? `${images.length} image${images.length === 1 ? '' : 's'}` : 'Script-only mode'],
    ['03', 'Output form', `${aspectRatio} / agent-timed scenes`],
    ['04', 'Render window', estimatedRenderWindow],
  ]

  return (
    <form onSubmit={handleSubmit} id="upload-form" className="aizen-workbench">
      <div className="workbench-left">
        <div className="section-label">// SUPREME INTELLECT ANALYSIS</div>
        <div className="mission-card script-card stagger-card">
          <div className="card-corners" aria-hidden="true" />
          <div className="card-head">
            <label>
              <FileText size={18} />
              Product Script
              <span>any language</span>
            </label>
            <div className="toggle-group">
              <button type="button" onClick={() => setInputMode('text')} className={`toggle-item ${inputMode === 'text' ? 'active' : ''}`}>
                Type
              </button>
              <button type="button" onClick={() => setInputMode('file')} className={`toggle-item ${inputMode === 'file' ? 'active' : ''}`}>
                Upload .txt
              </button>
            </div>
          </div>

          <AnimatePresence mode="wait">
            {inputMode === 'text' ? (
              <motion.div key="textarea" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                <textarea
                  id="script-input"
                  value={scriptText}
                  onChange={(e) => setScriptText(e.target.value)}
                  placeholder="Enter your script in any language..."
                  className="input-textarea"
                />
                <div className="input-meta">
                  <span>{scriptText.length} characters / {wordCount} words</span>
                  <span>{estimatedRenderWindow}</span>
                </div>
              </motion.div>
            ) : (
              <motion.div key="file-upload" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                <div {...getScriptDropProps()} className={`dropzone script-drop ${isScriptDragActive ? 'active' : ''} ${scriptFile ? 'has-preview' : ''}`}>
                  <input {...getScriptDropInputProps()} />
                  {scriptFile ? (
                    <div className="script-file-preview">
                      <div className="preview-title">
                        <FileText size={17} />
                        <span>{scriptFile.name}</span>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            clearScriptFile()
                          }}
                          aria-label="Remove script file"
                        >
                          <X size={15} />
                        </button>
                      </div>
                      <pre>{scriptFileText || 'Reading script preview...'}</pre>
                    </div>
                  ) : (
                    <>
                      <FileText size={30} />
                      <p className="script-upload-copy">Drop your .txt script file here, or <span>browse</span></p>
                    </>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="section-label image-label">// OPTIONAL PRODUCT IMAGE REFERENCES</div>
        <div className="mission-card image-card stagger-card">
          <div className="card-corners" aria-hidden="true" />
          <div {...getRootProps()} id="image-dropzone" className={`dropzone image-drop ${isDragActive ? 'active' : ''} ${images.length ? 'has-preview' : ''}`}>
            <input {...getInputProps()} />
            {images.length > 0 ? (
              <div className="image-preview-grid">
                {images.map((img) => (
                  <motion.div key={img.id} className="image-preview-tile" initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.94 }}>
                    <img src={img.preview} alt="Product reference" />
                    <span>{img.file.name}</span>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        removeImage(img.id)
                      }}
                      aria-label="Remove image"
                    >
                      <X size={13} />
                    </button>
                  </motion.div>
                ))}
                <div className="image-add-more">
                  <HogyokuIcon className="drop-orb" size={30} />
                  <span>Drop or browse to add more</span>
                </div>
              </div>
            ) : (
              <>
                <HogyokuIcon className="drop-orb" size={52} />
                <p>DROP PRODUCT IMAGES HERE</p>
                <span>Optional. Script-only generation is supported.</span>
              </>
            )}
          </div>
        </div>
      </div>

      <aside className="workbench-right">
        <div className="section-label">// TRANSCENDENCE LOG</div>
        <div className="mission-card pipeline-prime stagger-card">
          <div className="card-corners" aria-hidden="true" />
          <button type="button" className="settings-toggle" onClick={() => setShowSettings(!showSettings)}>
            <Settings2 size={18} />
            <span>Output Pipeline</span>
            <strong>{aspectRatio}</strong>
          </button>

          <AnimatePresence initial={false}>
            {showSettings && (
              <motion.div className="settings-panel" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                <SettingGroup icon={<Monitor size={15} />} label="Aspect Ratio" options={aspectOptions} value={aspectRatio} onChange={setAspectRatio} />
              </motion.div>
            )}
          </AnimatePresence>

          <div className="pipeline-summary">
            {pipelineRows.map(row => (
              <div key={row[0]} className="summary-row">
                <span>{row[0]}</span>
                <strong>{row[1]}</strong>
                <em>{row[2]}</em>
              </div>
            ))}
          </div>

          <div className="log-panel compact-log">
            <p><span className="sys">[SYS]</span> Awaiting command authority.</p>
            <p><span className={canSubmit ? 'ok' : 'wait'}>{canSubmit ? '[OK]' : '[WAIT]'}</span> {canSubmit ? 'Script accepted. Images optional.' : 'Script required.'}</p>
          </div>

          <button type="submit" id="generate-button" className="btn-bankai sticky-generate" disabled={!canSubmit}>
            {submitting ? (
              <>
                <Loader2 size={18} className="spin" />
                ACTIVATING...
              </>
            ) : (
              <>GENERATE VIDEO</>
            )}
          </button>
        </div>
      </aside>
    </form>
  )
}

function SettingGroup({ icon, label, options, value, onChange }) {
  return (
    <div className="setting-group">
      <label>{icon}{label}</label>
      <div className="settings-grid">
        {options.map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`settings-option ${value === opt.value ? 'active' : ''}`}
          >
            <span>{opt.label}</span>
            <small>{opt.desc}</small>
          </button>
        ))}
      </div>
    </div>
  )
}
