import React from 'react'

export interface StepTabsProps {
  steps: string[]
  current: number       // 0-based index
  maxReachable: number  // highest 0-based index that can be navigated to
  onSelect: (index: number) => void
}

export function StepTabs({ steps, current, maxReachable, onSelect }: StepTabsProps): React.ReactElement {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
      {steps.map((title, i) => {
        const isActive = i === current
        const isClickable = i <= maxReachable
        return (
          <button
            key={i}
            onClick={() => { if (isClickable) onSelect(i) }}
            title={title}
            style={{
              flex: 1,
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              padding: '9px 4px',
              border: 'none',
              borderRadius: 0,
              background: 'transparent',
              color: isActive ? 'var(--text)' : isClickable ? 'var(--text-secondary)' : 'var(--text-muted)',
              fontSize: '11px',
              fontWeight: isActive ? 600 : 400,
              borderBottom: `2px solid ${isActive ? 'var(--accent)' : 'transparent'}`,
              cursor: isClickable ? 'pointer' : 'default',
              opacity: isClickable ? 1 : 0.35,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              transition: 'color 0.15s, border-color 0.15s',
            }}
          >
            {title}
          </button>
        )
      })}
    </div>
  )
}
