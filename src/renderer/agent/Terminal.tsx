import React, { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

interface TerminalProps {
  issueNumber: number
}

export default function TerminalComponent({ issueNumber }: TerminalProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const unsubscribeRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const term = new Terminal({
      theme: {
        background: '#1a1a1a',
        foreground: '#e8e8e8',
        cursor: '#4a9eff',
        selectionBackground: 'rgba(74, 158, 255, 0.3)'
      },
      fontFamily: '"Cascadia Code", "Fira Code", "Consolas", monospace',
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      allowTransparency: true
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(containerRef.current)
    fitAddon.fit()

    termRef.current = term
    fitAddonRef.current = fitAddon

    // Subscribe to output streamed from claude -p via docker exec
    const unsubscribe = window.clauboy.onTerminalData((data: string) => {
      const buf = Uint8Array.from(atob(data), (c) => c.charCodeAt(0))
      term.write(buf)
    })
    unsubscribeRef.current = unsubscribe

    // Resize observer
    const resizeObserver = new ResizeObserver(() => {
      if (fitAddonRef.current) {
        fitAddonRef.current.fit()
      }
    })

    resizeObserver.observe(containerRef.current)

    return () => {
      resizeObserver.disconnect()
      if (unsubscribeRef.current) {
        unsubscribeRef.current()
      }
      term.dispose()
    }
  }, [issueNumber])

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        overflow: 'hidden',
        background: '#1a1a1a',
        padding: '4px'
      }}
    />
  )
}
