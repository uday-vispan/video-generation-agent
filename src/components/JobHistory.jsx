import React from 'react'
import { motion } from 'framer-motion'
import { History, Download, Clock } from 'lucide-react'

export default function JobHistory({ jobs }) {
  if (!jobs || jobs.length === 0) return null

  const formatDate = (dateStr) => {
    try {
      return new Date(dateStr).toLocaleString(undefined, {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    } catch { return '' }
  }

  return (
    <div style={{ marginTop: '4rem' }}>
      <div className="section-label" style={{ marginBottom: '1.5rem' }}>// BATTLE HISTORY</div>
      
      <div style={{ display: 'flex', flexDirection: 'column', borderTop: '2px solid var(--border-color)' }}>
        {jobs.map((job, i) => {
          const isOdd = i % 2 !== 0
          
          let statusText, statusColor, isProcessing
          if (job.status === 'completed') {
            statusText = 'COMPLETE'
            statusColor = '#22c55e' // Green as requested
            isProcessing = false
          } else if (job.status === 'failed') {
            statusText = 'FAILED'
            statusColor = 'var(--text-secondary)'
            isProcessing = false
          } else {
            statusText = 'PROCESSING'
            statusColor = 'var(--accent-primary)'
            isProcessing = true
          }

          return (
            <motion.div
              key={job.jobId}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04, ease: [0.16, 1, 0.3, 1] }}
              style={{ 
                padding: '1rem 1.5rem', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between',
                background: isOdd ? 'var(--bg-secondary)' : 'var(--bg-card)',
                borderBottom: '1px solid var(--border-color)',
                fontFamily: 'var(--font-heading)'
              }}
            >
              {/* Info */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '2rem', flex: 1 }}>
                <span style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '0.05em' }}>
                  {job.jobId.slice(0, 8).toUpperCase()}
                </span>
                
                {/* Status Badge */}
                <span style={{
                  fontSize: '0.8rem', padding: '2px 8px', border: `1px solid ${statusColor}`,
                  color: statusColor, fontWeight: 700, letterSpacing: '0.1em',
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  boxShadow: isProcessing ? `0 0 10px ${statusColor}` : 'none',
                  animation: isProcessing ? 'pulse 2s infinite' : 'none'
                }}>
                  {statusText}
                </span>
                
                <style>{`
                  @keyframes pulse {
                    0% { box-shadow: 0 0 5px var(--accent-primary); }
                    50% { box-shadow: 0 0 15px var(--accent-primary), inset 0 0 10px var(--accent-primary); }
                    100% { box-shadow: 0 0 5px var(--accent-primary); }
                  }
                `}</style>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: '0.85rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>
                  {job.createdAt && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Clock style={{ width: 14, height: 14 }} /> {formatDate(job.createdAt)}
                    </span>
                  )}
                  {job.duration && <span>{job.duration}S DURATION</span>}
                </div>
              </div>

              {/* Download */}
              {job.status === 'completed' && job.videoUrl ? (
                <a
                  href={job.videoUrl}
                  download
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'var(--text-primary)', padding: '0.5rem',
                    transition: 'all 0.2s', border: '1px solid var(--border-color)',
                    background: 'var(--bg-primary)'
                  }}
                  onMouseOver={(e) => { e.currentTarget.style.borderColor = 'var(--text-primary)' }}
                  onMouseOut={(e) => { e.currentTarget.style.borderColor = 'var(--border-color)' }}
                >
                  <Download style={{ width: 18, height: 18 }} />
                </a>
              ) : (
                <div style={{ width: 36, height: 36 }} /> // Spacer to align
              )}
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
