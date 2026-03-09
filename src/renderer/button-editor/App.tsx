import React, { useEffect, useState } from 'react'
import { Button, ButtonType } from '../../shared/types'

const DUMMY_ISSUE = {
  number: 42,
  title: 'Example Issue',
  html_url: 'https://github.com/owner/repo/issues/42',
  body: 'This is an example issue body.',
  worktreePath: '/home/user/.clauboy/repos/owner-repo/worktrees/issue-42'
}

function expandPreview(template: string): string {
  return template
    .replace(/\{\{ISSUE_NUMBER\}\}/g, String(DUMMY_ISSUE.number))
    .replace(/\{\{ISSUE_URL\}\}/g, DUMMY_ISSUE.html_url)
    .replace(/\{\{WORKTREE_PATH\}\}/g, DUMMY_ISSUE.worktreePath)
    .replace(/\{\{ISSUE_TITLE\}\}/g, '')
    .replace(/\{\{ISSUE_BODY\}\}/g, '')
}

export default function ButtonEditorApp(): React.ReactElement {
  const [buttons, setButtons] = useState<Button[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const dragSourceId = React.useRef<string | null>(null)
  useEffect(() => {
    window.clauboy.getConfig().then((cfg) => {
      setButtons(cfg.buttons)
      if (cfg.buttons.length > 0) {
        setSelectedId(cfg.buttons[0].id)
      }
    }).catch(console.error)
  }, [])

  const selectedButton = buttons.find((b) => b.id === selectedId) ?? null

  const updateSelected = (patch: Partial<Button>): void => {
    setButtons((bs) => bs.map((b) => b.id === selectedId ? { ...b, ...patch } : b))
  }

  const handleSave = async (): Promise<void> => {
    const cfg = await window.clauboy.getConfig()
    await window.clauboy.saveConfig({ ...cfg, buttons })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleAdd = (): void => {
    const newBtn: Button = {
      id: `btn-${Date.now()}`,
      icon: '✨',
      label: 'New Button',
      type: 'prompt',
      prompt: ''
    }
    setButtons((bs) => [...bs, newBtn])
    setSelectedId(newBtn.id)
  }

  const handleDelete = (): void => {
    if (!selectedId) return
    const newButtons = buttons.filter((b) => b.id !== selectedId)
    setButtons(newButtons)
    setSelectedId(newButtons[0]?.id ?? null)
  }

  const handleDragStart = (id: string): void => {
    dragSourceId.current = id
  }

  const handleDragOver = (e: React.DragEvent, id: string): void => {
    e.preventDefault()
    setDragOverId(id)
  }

  const handleDrop = (targetId: string): void => {
    const sourceId = dragSourceId.current
    if (!sourceId || sourceId === targetId) {
      setDragOverId(null)
      return
    }
    setButtons((bs) => {
      const result = [...bs]
      const sourceIdx = result.findIndex((b) => b.id === sourceId)
      const targetIdx = result.findIndex((b) => b.id === targetId)
      const [moved] = result.splice(sourceIdx, 1)
      result.splice(targetIdx, 0, moved)
      return result
    })
    setDragOverId(null)
    dragSourceId.current = null
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontWeight: 700, fontSize: '15px', flex: 1 }}>🎛 Button Editor</span>
        <button onClick={handleAdd} title="Add button" style={{ fontSize: '12px' }}>+ Add</button>
        <button onClick={handleDelete} disabled={!selectedId} style={{ fontSize: '12px', opacity: selectedId ? 1 : 0.4 }}>Delete</button>
        <button className="primary" onClick={() => void handleSave()}>{saved ? '✓ Saved' : 'Save'}</button>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Button list */}
        <div style={{ width: '180px', borderRight: '1px solid var(--border)', overflowY: 'auto', padding: '8px' }}>
          {buttons.map((btn) => (
            <div
              key={btn.id}
              draggable
              onDragStart={() => handleDragStart(btn.id)}
              onDragOver={(e) => handleDragOver(e, btn.id)}
              onDrop={() => handleDrop(btn.id)}
              onDragLeave={() => setDragOverId(null)}
              onClick={() => setSelectedId(btn.id)}
              style={{
                padding: '8px 10px',
                borderRadius: 'var(--radius-sm)',
                marginBottom: '2px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: selectedId === btn.id ? 'var(--bg-hover)' : dragOverId === btn.id ? 'var(--bg-tertiary)' : 'transparent',
                border: dragOverId === btn.id ? '1px dashed var(--accent)' : '1px solid transparent',
                fontSize: '13px',
                userSelect: 'none'
              }}
            >
              <span>⠿</span>
              <span>{btn.icon}</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{btn.label}</span>
            </div>
          ))}
        </div>

        {/* Edit form */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
          {selectedButton ? (
            <>
              <div className="form-group">
                <label>Icon</label>
                <input value={selectedButton.icon} onChange={(e) => updateSelected({ icon: e.target.value })} style={{ width: '80px' }} />
              </div>
              <div className="form-group">
                <label>Label</label>
                <input value={selectedButton.label} onChange={(e) => updateSelected({ label: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Type</label>
                <select value={selectedButton.type} onChange={(e) => updateSelected({ type: e.target.value as ButtonType })}>
                  <option value="prompt">Prompt (inject into terminal)</option>
                  <option value="ide">IDE (open editor)</option>
                  <option value="web">Web (open browser)</option>
                  <option value="teardown">Teardown (stop agent)</option>
                </select>
              </div>

              {selectedButton.type === 'prompt' && (
                <div className="form-group">
                  <label>Prompt Template</label>
                  <textarea
                    value={selectedButton.prompt ?? ''}
                    onChange={(e) => updateSelected({ prompt: e.target.value })}
                    style={{ minHeight: '120px', fontFamily: 'monospace', fontSize: '12px' }}
                    placeholder="Use {{ISSUE_NUMBER}}, {{ISSUE_URL}}, {{WORKTREE_PATH}}"
                  />
                  {selectedButton.prompt && (
                    <div style={{ marginTop: '8px' }}>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>Preview (with dummy values):</div>
                      <div style={{ background: 'var(--bg-secondary)', padding: '8px', borderRadius: 'var(--radius-sm)', fontSize: '11px', fontFamily: 'monospace', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', maxHeight: '100px', overflowY: 'auto' }}>
                        {expandPreview(selectedButton.prompt)}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {selectedButton.type === 'ide' && (
                <div className="form-group">
                  <label>Editor Command (overrides global)</label>
                  <input value={selectedButton.command ?? ''} onChange={(e) => updateSelected({ command: e.target.value })} placeholder="code" />
                </div>
              )}

              {selectedButton.type === 'web' && (
                <div className="form-group">
                  <label>URL Template</label>
                  <input value={selectedButton.url ?? ''} onChange={(e) => updateSelected({ url: e.target.value })} placeholder="{{ISSUE_URL}}" />
                </div>
              )}
            </>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: '13px' }}>
              Select a button to edit
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
