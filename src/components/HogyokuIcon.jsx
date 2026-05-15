import React from 'react'

export default function HogyokuIcon({ className = '', size = 34 }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="hogyoku-core" cx="50%" cy="45%" r="60%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="32%" stopColor="#E040FB" />
          <stop offset="68%" stopColor="#7B2FBE" />
          <stop offset="100%" stopColor="#23103E" />
        </radialGradient>
        <linearGradient id="hogyoku-facet" x1="14" y1="8" x2="52" y2="56">
          <stop stopColor="#FFFFFF" stopOpacity="0.9" />
          <stop offset="0.45" stopColor="#9D4EDD" stopOpacity="0.45" />
          <stop offset="1" stopColor="#080810" stopOpacity="0.2" />
        </linearGradient>
        <filter id="hogyoku-glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feColorMatrix
            in="blur"
            type="matrix"
            values="0 0 0 0 0.62 0 0 0 0 0.3 0 0 0 0 0.86 0 0 0 0.95 0"
          />
          <feBlend in="SourceGraphic" />
        </filter>
      </defs>
      <circle cx="32" cy="32" r="23" fill="url(#hogyoku-core)" filter="url(#hogyoku-glow)" />
      <path d="M32 8L50 24L44 52H20L14 24L32 8Z" stroke="#F0F0FF" strokeOpacity="0.75" strokeWidth="1.4" />
      <path d="M32 8L32 52M14 24L50 24M20 52L32 24L44 52M14 24L32 52L50 24" stroke="url(#hogyoku-facet)" strokeWidth="1" />
      <circle cx="24" cy="22" r="4" fill="#FFFFFF" fillOpacity="0.78" />
    </svg>
  )
}
