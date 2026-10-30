/**
 * Client half of dsh-exa. The build script serializes this factory with
 * Function.prototype.toString into lib/client.js, replacing __UI_DICTS__ with
 * the card dictionaries from locale/en.json and locale/zh.json. Keep the
 * factory self-contained: it must not close over module-scope values.
 */
export const id = 'dsh-exa'

export function factory(require) {
  const react = require('react')
  const { useCallback, useEffect, useState } = react
  const DICTS = __UI_DICTS__
  const NS = 'dshExa'
  const PKG = 'dsh-exa'
  const BILLING_URL = 'https://dashboard.exa.ai/billing'
  const inject = ['slots', 'locale']

  const ICONS = {
    drag: ['M5 4v8', 'M8 4v8', 'M11 4v8'],
    eye: ['M1.5 8C1.5 8 4 3.5 8 3.5S14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z', 'M8 5.8a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4Z'],
    eyeOff: ['M1.5 8C1.5 8 4 3.5 8 3.5c1.6 0 3 .5 4.1 1.2', 'M14.5 8C14.5 8 12 12.5 8 12.5c-1.6 0-3-.5-4.1-1.2', 'M2 2l12 12'],
    pencil: ['M11.2 2.3l2.5 2.5L6 12.5l-3.3.8.8-3.3 7.7-7.7Z', 'M9.5 4l2.5 2.5'],
    trash: ['M2.5 4h11', 'M6.2 4V2.8h3.6V4', 'M4.2 4l.7 9.2h6.2L11.8 4', 'M6.5 6.5v4.2', 'M9.5 6.5v4.2'],
    check: ['M3 8.5l3.5 3.5L13 5'],
    close: ['M4 4l8 8', 'M12 4l-8 8'],
    up: ['M8 13V3', 'M4 7l4-4 4 4'],
    down: ['M8 3v10', 'M4 9l4 4 4-4'],
    externalLink: ['M9 3h4v4', 'M13 3L7 9', 'M11 9v3H4V5h3'],
  }

  const CSS = [
    '.dex-btn{height:28px;border-radius:14px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);padding:0 11px;cursor:pointer;font-size:12px;font-family:inherit}',
    '.dex-btn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2)}',
    '.dex-btn:disabled{opacity:.45;cursor:default}',
    '.dex-btn-primary{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}',
    '.dex-btn-danger{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}',
    '.dex-icon{width:26px;height:26px;border-radius:6px;border:none;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0;flex:none}',
    '.dex-icon:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
    '.dex-icon:disabled{opacity:.35;cursor:default}',
    '.dex-icon-danger{color:var(--dsw-alias-state-error-primary)}',
    '.dex-table{width:100%;border-collapse:collapse;font-size:13px;table-layout:fixed}',
    '.dex-table th{text-align:left;padding:7px 8px;border-bottom:1px solid var(--dsw-alias-border-l2);font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary);white-space:nowrap}',
    '.dex-table td{padding:8px;border-bottom:1px solid var(--dsw-alias-border-l2);vertical-align:top;min-width:0}',
    '.dex-table tr:last-child td{border-bottom:none}',
    '.dex-table-wrap{overflow-x:auto;min-width:0}',
    '.dex-key{font-family:var(--ds-font-family-code,ui-monospace,monospace);font-size:12px;word-break:break-all;line-height:1.5}',
    '.dex-muted{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.55}',
    '.dex-small{font-size:11px;line-height:1.45;color:var(--dsw-alias-label-secondary)}',
    '.dex-row-dragging{opacity:.45}',
    '.dex-row-drop td{border-top:2px solid var(--dsw-alias-brand-primary)}',
    '.dex-row-inactive .dex-key{opacity:.58}',
    '.dex-keyline{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0}',
    '.dex-status{flex:none;border-radius:999px;border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:18px;padding:0 8px;cursor:pointer;font-family:inherit}',
    '.dex-status:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
    '.dex-status:disabled{opacity:.45;cursor:default}',
    '.dex-status-on{border-color:var(--dsw-alias-state-success-primary);color:var(--dsw-alias-state-success-primary)}',
    '.dex-status-off{border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary)}',
    '.dex-input,.dex-select,.dex-textarea{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border-radius:8px;padding:7px 9px;font-size:13px;font-family:inherit}',
    '.dex-input:focus,.dex-select:focus,.dex-textarea:focus{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-1px}',
    '.dex-input:disabled,.dex-select:disabled,.dex-textarea:disabled{opacity:.55;cursor:default}',
    '.dex-textarea{width:100%;min-height:58px;resize:vertical;font-family:var(--ds-font-family-code,ui-monospace,monospace);font-size:12px}',
    '.dex-dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--dsw-alias-state-success-primary);flex:none}',
    '.dex-spinner{display:inline-block;width:12px;height:12px;border:2px solid var(--dsw-alias-border-l2);border-top-color:var(--dsw-alias-brand-primary);border-radius:50%;animation:dex-spin .8s linear infinite;vertical-align:-2px}',
    '@keyframes dex-spin{to{transform:rotate(360deg)}}',
    '.dex-actions{display:flex;flex-wrap:wrap;gap:1px;align-items:center}',
    '.dex-notice{margin:0;font-size:12px;line-height:1.5}',
    '.dex-notice-ok{color:var(--dsw-alias-state-success-primary)}',
    '.dex-notice-error{color:var(--dsw-alias-state-error-primary)}',
    '@media (max-width:720px){.dex-col-saved{display:none}.dex-table th,.dex-table td{padding:7px 5px}.dex-hide-narrow{display:none}}',
  ].join('\n')

  const buttonStyle = { display: 'inline-flex', alignItems: 'center', gap: 6 }
  const sectionStyle = { display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }
  const sectionHeadStyle = { display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 8, justifyContent: 'space-between' }
  const h3Style = { margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--dsw-alias-label-primary)' }
  const pStyle = { margin: 0, fontSize: 13, lineHeight: 1.55, color: 'var(--dsw-alias-label-secondary)' }
  const errorStyle = { margin: 0, fontSize: 12, lineHeight: 1.5, color: 'var(--dsw-alias-state-error-primary)' }
  const codeStyle = { fontFamily: 'var(--ds-font-family-code,ui-monospace,monospace)', fontSize: 12, wordBreak: 'break-all' }

  function SvgIcon({ name, size }) {
    const paths = ICONS[name] || []
    return react.createElement('svg', {
      width: size || 14,
      height: size || 14,
      viewBox: '0 0 16 16',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.4,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      'aria-hidden': 'true',
      style: { flex: 'none' },
    }, paths.map((d, index) => react.createElement('path', { key: index, d })))
  }

  function IconButton({ icon, title, onClick, disabled, danger }) {
    return react.createElement('button', {
      type: 'button',
      className: danger ? 'dex-icon dex-icon-danger' : 'dex-icon',
      title,
      'aria-label': title,
      disabled,
      onClick,
    }, react.createElement(SvgIcon, { name: icon, size: 13 }))
  }

  function TextButton({ children, onClick, disabled, kind, title }) {
    const className = kind === 'primary'
      ? 'dex-btn dex-btn-primary'
      : kind === 'danger' ? 'dex-btn dex-btn-danger' : 'dex-btn'
    return react.createElement('button', { type: 'button', className, style: buttonStyle, onClick, disabled, title }, children)
  }

  function Spinner() {
    return react.createElement('span', { className: 'dex-spinner', 'aria-hidden': 'true' })
  }

  function Notice({ notice }) {
    if (notice === null || notice === undefined) return null
    const isOk = notice.ok === true
    return react.createElement('p', {
      className: 'dex-notice ' + (isOk ? 'dex-notice-ok' : 'dex-notice-error'),
      role: 'status',
    }, isOk ? notice.text : notice.error)
  }

  function apiGet(path) {
    return fetch(path, { cache: 'no-store' }).then(async (response) => {
      let data
      try {
        data = await response.json()
      } catch {
        throw new Error('Invalid server response')
      }
      return data
    })
  }

  function apiPost(body) {
    return fetch('/api/exa-manager', {
      method: 'POST',
      cache: 'no-store',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }).then(async (response) => {
      let data
      try {
        data = await response.json()
      } catch {
        throw new Error('Invalid server response')
      }
      return data
    })
  }

  function errorText(data, t) {
    if (data !== null && data !== undefined && typeof data.code === 'string') {
      const key = 'error.' + data.code
      const value = t(key)
      if (value !== key) return value
    }
    if (data !== null && data !== undefined && typeof data.error === 'string' && data.error.length > 0) return data.error
    return t('error.unknown')
  }

  function formatDate(value) {
    if (typeof value !== 'string' || value.length === 0) return '—'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '—'
    const pad = (number) => String(number).padStart(2, '0')
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate())
  }

  function inactiveReasonText(entry, t) {
    const reason = entry !== null && entry !== undefined && entry.inactiveReason === 'http_402'
      ? t('keys.inactiveAuto')
      : t('keys.inactiveManual')
    const date = formatDate(entry !== null && entry !== undefined ? entry.inactiveAt : null)
    return date === '—' ? reason : reason + ' · ' + date
  }

  function splitKeyInput(value) {
    if (typeof value !== 'string') return []
    return value.split(/[\s,]+/u).map((part) => part.trim()).filter((part) => part.length > 0)
  }

  function sameIds(left, right) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false
    for (let index = 0; index < left.length; index += 1) if (left[index] !== right[index]) return false
    return true
  }

  function moveId(order, from, to) {
    if (!Array.isArray(order) || from < 0 || to < 0 || from >= order.length || to >= order.length) return order
    const next = order.slice()
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    return next
  }

  function IconLabel({ icon, children }) {
    return react.createElement('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 5 } },
      react.createElement(SvgIcon, { name: icon, size: 12 }),
      children)
  }

  function ExaSettings({ t }) {
    const [server, setServer] = useState(null)
    const [loadError, setLoadError] = useState(null)
    const [managerBusy, setManagerBusy] = useState(false)
    const [notice, setNotice] = useState(null)
    const [draftOrder, setDraftOrder] = useState(null)
    const [draggingId, setDraggingId] = useState(null)
    const [dragOverId, setDragOverId] = useState(null)
    const [revealed, setRevealed] = useState({})
    const [replacing, setReplacing] = useState({})
    const [replaceDrafts, setReplaceDrafts] = useState({})
    const [confirmDelete, setConfirmDelete] = useState({})
    const [addText, setAddText] = useState('')

    const refreshManager = useCallback(async () => {
      setManagerBusy(true)
      try {
        const data = await apiGet('/api/exa-manager')
        if (data.ok === true) {
          setServer(data)
          setLoadError(null)
        } else {
          setLoadError(errorText(data, t))
        }
      } catch (error) {
        setLoadError(String(error && error.message ? error.message : error))
      } finally {
        setManagerBusy(false)
      }
    }, [t])

    useEffect(() => {
      refreshManager()
    }, [])

    const runManager = useCallback(async (body, successText, options) => {
      const resetDraft = options === undefined || options.resetDraft !== false
      setManagerBusy(true)
      setNotice(null)
      try {
        const data = await apiPost(body)
        if (data.ok !== true) {
          setNotice({ error: errorText(data, t) })
          return null
        }
        setServer(data)
        if (resetDraft) setDraftOrder(null)
        setNotice(successText ? { ok: successText } : null)
        return data
      } catch (error) {
        setNotice({ error: String(error && error.message ? error.message : error) })
        return null
      } finally {
        setManagerBusy(false)
      }
    }, [t])

    const serverIds = server === null ? [] : server.keys.map((entry) => entry.id)
    const activeCount = server === null ? 0 : server.keys.filter((entry) => entry.active !== false).length
    const order = draftOrder === null ? serverIds : draftOrder
    const orderDirty = draftOrder !== null && !sameIds(order, serverIds)
    const keysReadOnly = server === null ? true : server.writable.edit === false
    const addReadOnly = server === null ? true : server.writable.add === false
    const moveKey = (id, delta) => {
      const from = order.indexOf(id)
      const to = from + delta
      if (from < 0 || to < 0 || to >= order.length) return
      setDraftOrder(moveId(order, from, to))
      setNotice(null)
    }

    const dropOn = (targetId) => {
      if (draggingId === null || draggingId === targetId) {
        setDraggingId(null)
        setDragOverId(null)
        return
      }
      const from = order.indexOf(draggingId)
      const to = order.indexOf(targetId)
      if (from >= 0 && to >= 0) setDraftOrder(moveId(order, from, to))
      setDraggingId(null)
      setDragOverId(null)
      setNotice(null)
    }

    const saveOrder = async () => {
      if (!orderDirty) return
      await runManager({ action: 'reorder', ids: order }, t('keys.orderSaved'))
    }

    const saveStrategy = async (strategy) => {
      if (server === null || strategy === server.strategy) return
      await runManager({ action: 'setStrategy', strategy }, t('strategy.saved'), { resetDraft: false })
    }

    const toggleActive = async (id, active) => {
      await runManager(
        { action: 'setKeyActive', id, active },
        active ? t('keys.activated') : t('keys.deactivated'),
        { resetDraft: false },
      )
    }

    const addKeys = async () => {
      const keys = splitKeyInput(addText)
      if (keys.length === 0) {
        setNotice({ error: t('keys.addFailed') })
        return
      }
      setManagerBusy(true)
      setNotice(null)
      try {
        const data = await apiPost({ action: 'add', keys })
        if (data.ok !== true) {
          setNotice({ error: errorText(data, t) })
          return
        }
        setServer(data)
        setDraftOrder(null)
        setAddText('')
        setNotice({ ok: data.added > 0 ? t('keys.batchAdded').replace('{count}', String(data.added)) : t('keys.noNewKeys') })
      } catch (error) {
        setNotice({ error: String(error && error.message ? error.message : error) })
      } finally {
        setManagerBusy(false)
      }
    }

    const startReplace = (id) => {
      setReplacing((current) => Object.assign({}, current, { [id]: true }))
      setReplaceDrafts((current) => Object.assign({}, current, { [id]: '' }))
      setNotice(null)
    }

    const cancelReplace = (id) => {
      setReplacing((current) => Object.assign({}, current, { [id]: false }))
      setReplaceDrafts((current) => Object.assign({}, current, { [id]: '' }))
    }

    const saveReplace = async (id) => {
      const value = typeof replaceDrafts[id] === 'string' ? replaceDrafts[id].trim() : ''
      if (value.length === 0) return
      setManagerBusy(true)
      setNotice(null)
      try {
        const data = await apiPost({ action: 'replace', id, value })
        if (data.ok !== true) {
          setNotice({ error: errorText(data, t) })
          return
        }
        setServer(data)
        setDraftOrder(null)
        setReplacing((current) => Object.assign({}, current, { [id]: false }))
        setReplaceDrafts((current) => Object.assign({}, current, { [id]: '' }))
        setRevealed((current) => Object.assign({}, current, { [id]: false }))
        setNotice({ ok: t('keys.keyReplaced') })
      } catch (error) {
        setNotice({ error: String(error && error.message ? error.message : error) })
      } finally {
        setManagerBusy(false)
      }
    }

    const removeKey = async (id) => {
      setManagerBusy(true)
      setNotice(null)
      try {
        const data = await apiPost({ action: 'remove', ids: [id] })
        if (data.ok !== true) {
          setNotice({ error: errorText(data, t) })
          return
        }
        setServer(data)
        setDraftOrder(null)
        setConfirmDelete((current) => Object.assign({}, current, { [id]: false }))
        setReplacing((current) => Object.assign({}, current, { [id]: false }))
        setRevealed((current) => Object.assign({}, current, { [id]: false }))
        setExpanded((current) => Object.assign({}, current, { [id]: false }))
        setNotice({ ok: t('keys.keyRemoved') })
      } catch (error) {
        setNotice({ error: String(error && error.message ? error.message : error) })
      } finally {
        setManagerBusy(false)
      }
    }

    const markDelete = (id) => {
      if (confirmDelete[id] !== true) {
        setConfirmDelete((current) => Object.assign({}, current, { [id]: true }))
        return
      }
      setConfirmDelete((current) => Object.assign({}, current, { [id]: false }))
      removeKey(id)
    }

    const toggleReveal = async (id) => {
      if (typeof revealed[id] === 'string') {
        setRevealed((current) => Object.assign({}, current, { [id]: false }))
        return
      }
      setManagerBusy(true)
      setNotice(null)
      try {
        const data = await apiGet('/api/exa-manager?reveal=' + encodeURIComponent(id))
        if (data.ok !== true) {
          setNotice({ error: errorText(data, t) })
          return
        }
        setRevealed((current) => Object.assign({}, current, { [id]: data.value }))
      } catch (error) {
        setNotice({ error: String(error && error.message ? error.message : error) })
      } finally {
        setManagerBusy(false)
      }
    }

    const sourceText = server === null
      ? t('keys.sourceNone')
      : server.source === 'list' ? t('keys.sourceList') : server.source === 'primary' ? t('keys.sourcePrimary') : t('keys.sourceNone')

    const renderKeyRow = (id, index) => {
      if (server === null) return null
      const entry = server.keys.find((item) => item.id === id)
      if (entry === undefined) return null
      const isReplacing = replacing[entry.id] === true
      const isRevealed = typeof revealed[entry.id] === 'string'
      const isConfirm = confirmDelete[entry.id] === true
      const draft = typeof replaceDrafts[entry.id] === 'string' ? replaceDrafts[entry.id] : ''
      const isActive = entry.active !== false
      const canDrag = !keysReadOnly && !managerBusy
      const rowClass = 'dex-row'
        + (isActive ? '' : ' dex-row-inactive')
        + (draggingId === entry.id ? ' dex-row-dragging' : '')
        + (dragOverId === entry.id && draggingId !== entry.id ? ' dex-row-drop' : '')
      const row = react.createElement('tr', {
        key: entry.id,
        className: rowClass,
        onDragOver: (event) => {
          if (draggingId === null) return
          event.preventDefault()
          setDragOverId(entry.id)
        },
        onDrop: (event) => {
          event.preventDefault()
          dropOn(entry.id)
        },
      },
      react.createElement('td', { style: { width: 46 } },
        react.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 3 } },
          react.createElement('button', {
            type: 'button',
            className: 'dex-icon',
            title: t('keys.dragHandle'),
            'aria-label': t('keys.dragHandle'),
            draggable: canDrag,
            disabled: !canDrag,
            onDragStart: (event) => {
              event.dataTransfer.effectAllowed = 'move'
              event.dataTransfer.setData('text/plain', entry.id)
              setDraggingId(entry.id)
            },
            onDragEnd: () => {
              setDraggingId(null)
              setDragOverId(null)
            },
          }, react.createElement(SvgIcon, { name: 'drag', size: 13 })),
          react.createElement('span', { className: 'dex-small' }, String(index + 1))
        )
      ),
      react.createElement('td', null,
        isReplacing
          ? react.createElement('textarea', {
            className: 'dex-textarea',
            'aria-label': t('keys.replacePlaceholder'),
            placeholder: t('keys.replacePlaceholder'),
            value: draft,
            disabled: managerBusy,
            onChange: (event) => setReplaceDrafts((current) => Object.assign({}, current, { [entry.id]: event.target.value })),
          })
          : react.createElement('div', null,
            react.createElement('div', { className: 'dex-keyline' },
              react.createElement('div', { className: 'dex-key' }, isRevealed ? revealed[entry.id] : entry.masked),
              react.createElement('button', {
                type: 'button',
                className: 'dex-status ' + (isActive ? 'dex-status-on' : 'dex-status-off'),
                role: 'switch',
                'aria-checked': isActive,
                'aria-label': t('keys.activeToggle'),
                title: isActive ? t('keys.activeTitle') : t('keys.inactiveTitle'),
                disabled: managerBusy,
                onClick: () => toggleActive(entry.id, !isActive),
              }, isActive ? t('keys.active') : t('keys.inactive'))
            ),
            react.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' } },
              entry.primary ? react.createElement('span', { className: 'dex-dot', title: t('keys.primaryTitle') }) : null,
              entry.primary ? react.createElement('span', { className: 'dex-small' }, t('keys.primary')) : null,
              isActive ? null : react.createElement('span', { className: 'dex-small' }, inactiveReasonText(entry, t)),
              react.createElement('span', { className: 'dex-small' }, sourceText)
            )
          )
      ),
      react.createElement('td', { className: 'dex-col-saved', style: { whiteSpace: 'nowrap' } },
        react.createElement('span', { className: 'dex-small' }, entry.savedAt ? formatDate(entry.savedAt) : t('keys.savedUnknown'))
      ),
      react.createElement('td', null,
        react.createElement('div', { className: 'dex-actions' },
          isReplacing
            ? [
              react.createElement(IconButton, { key: 'save', icon: 'check', title: t('keys.save'), onClick: () => saveReplace(entry.id), disabled: managerBusy || draft.trim().length === 0 }),
              react.createElement(IconButton, { key: 'cancel', icon: 'close', title: t('keys.cancel'), onClick: () => cancelReplace(entry.id), disabled: managerBusy }),
            ]
            : [
              react.createElement(IconButton, { key: 'up', icon: 'up', title: t('keys.moveUp'), onClick: () => moveKey(entry.id, -1), disabled: managerBusy || keysReadOnly || index === 0 }),
              react.createElement(IconButton, { key: 'down', icon: 'down', title: t('keys.moveDown'), onClick: () => moveKey(entry.id, 1), disabled: managerBusy || keysReadOnly || index === order.length - 1 }),
              react.createElement(IconButton, { key: 'reveal', icon: isRevealed ? 'eyeOff' : 'eye', title: isRevealed ? t('keys.hide') : t('keys.reveal'), onClick: () => toggleReveal(entry.id), disabled: managerBusy }),
              react.createElement(IconButton, { key: 'replace', icon: 'pencil', title: t('keys.replace'), onClick: () => startReplace(entry.id), disabled: managerBusy || keysReadOnly || entry.editable === false }),
              react.createElement(IconButton, {
                key: 'delete',
                icon: isConfirm ? 'check' : 'trash',
                title: isConfirm ? t('keys.confirmDelete') : t('keys.delete'),
                onClick: () => markDelete(entry.id),
                disabled: managerBusy || keysReadOnly || entry.removable === false,
                danger: !isConfirm,
              }),
            ]
        )
      ))
      return row
    }

    if (server === null) {
      return react.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 } },
        react.createElement('style', null, CSS),
        loadError !== null
          ? react.createElement('p', { style: errorStyle, role: 'alert' }, loadError)
          : react.createElement('p', { style: pStyle }, react.createElement(Spinner), ' ', t('keys.loading')),
        react.createElement(TextButton, { onClick: refreshManager, disabled: managerBusy }, t('keys.refresh'))
      )
    }

    return react.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 } },
      react.createElement('style', null, CSS),
      react.createElement('p', { style: pStyle }, t('intro')),
      react.createElement(Notice, { notice }),
      managerBusy ? react.createElement('p', { className: 'dex-small', style: { margin: 0 }, role: 'status' }, react.createElement(Spinner), ' ', t('common.saving')) : null,
      loadError !== null ? react.createElement('p', { style: errorStyle, role: 'alert' }, loadError) : null,

      react.createElement('section', { style: sectionStyle },
        react.createElement('div', { style: sectionHeadStyle }, react.createElement('h3', { style: h3Style }, t('strategy.title'))),
        react.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
          react.createElement('label', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)' } }, t('strategy.label')),
          react.createElement('select', {
            className: 'dex-select',
            value: server.strategy,
            disabled: managerBusy,
            'aria-label': t('strategy.label'),
            onChange: (event) => saveStrategy(event.target.value),
          },
          react.createElement('option', { value: 'priority' }, t('strategy.priority')),
          react.createElement('option', { value: 'round-robin' }, t('strategy.roundRobin'))
          )
        ),
        react.createElement('p', { style: pStyle }, server.strategy === 'round-robin' ? t('strategy.roundRobinHint') : t('strategy.priorityHint'))
      ),

      react.createElement('section', { style: sectionStyle },
        react.createElement('div', { style: sectionHeadStyle },
          react.createElement('h3', { style: h3Style }, t('keys.title')),
          react.createElement('span', { className: 'dex-small' },
            t('keys.activeCount').replace('{active}', String(activeCount)).replace('{total}', String(server.keys.length))
              + ' · ' + sourceText)
        ),
        react.createElement('p', { style: pStyle }, t('keys.subtitle')),
        keysReadOnly
          ? react.createElement('p', { className: 'dex-small', role: 'status' },
            t('keys.readOnly') + ': ' + (server.source === 'primary' ? t('keys.readOnlyReasonPrimary') : t('keys.readOnlyReasonList')))
          : null,
        server.keys.length > 0 && activeCount === 0
          ? react.createElement('p', {
            style: { margin: 0, fontSize: 12, lineHeight: 1.5, color: 'var(--dsw-alias-state-warn-primary)' },
            role: 'alert',
          }, t('keys.allInactive'))
          : null,
        server.keys.length === 0
          ? react.createElement('p', { style: pStyle }, t('keys.empty'))
          : react.createElement('div', { className: 'dex-table-wrap' },
            react.createElement('table', { className: 'dex-table' },
              react.createElement('thead', null, react.createElement('tr', null,
                react.createElement('th', { style: { width: 46 } }, '#'),
                react.createElement('th', null, t('keys.key')),
                react.createElement('th', { className: 'dex-col-saved', style: { width: 100 } }, t('keys.saved')),
                react.createElement('th', { style: { width: 172 } }, t('keys.actions'))
              )),
              react.createElement('tbody', null, order.map((id, index) => renderKeyRow(id, index)))
            )
          ),
        orderDirty
          ? react.createElement('div', { style: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' } },
            react.createElement('span', { className: 'dex-small', style: { color: 'var(--dsw-alias-state-warn-primary)' } }, t('keys.unsavedOrder')),
            react.createElement(TextButton, { kind: 'primary', onClick: saveOrder, disabled: managerBusy }, t('keys.saveOrder')),
            react.createElement(TextButton, { onClick: () => setDraftOrder(null), disabled: managerBusy }, t('keys.cancelOrder'))
          )
          : null,
        addReadOnly
          ? null
          : react.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 7 } },
            react.createElement('label', { style: { fontSize: 12, fontWeight: 600, color: 'var(--dsw-alias-label-primary)' } }, t('keys.addLabel')),
            react.createElement('textarea', {
              className: 'dex-textarea',
              placeholder: t('keys.addPlaceholder'),
              'aria-label': t('keys.addPlaceholder'),
              value: addText,
              disabled: managerBusy,
              onChange: (event) => setAddText(event.target.value),
            }),
            react.createElement('div', { style: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' } },
              react.createElement(TextButton, { kind: 'primary', onClick: addKeys, disabled: managerBusy || addText.trim().length === 0 }, t('keys.addButton')),
              react.createElement('span', { className: 'dex-small' }, t('keys.addHint'))
            )
          )
      ),

      react.createElement('section', { style: sectionStyle },
        react.createElement('div', { style: sectionHeadStyle },
          react.createElement('h3', { style: h3Style }, t('billing.title'))
        ),
        react.createElement('p', { style: pStyle }, t('billing.subtitle')),
        react.createElement('div', { style: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' } },
          react.createElement(TextButton, { onClick: () => { window.open(BILLING_URL, '_blank', 'noopener,noreferrer') } },
            react.createElement(IconLabel, { icon: 'externalLink' }, t('billing.open')))
        )
      ),

      react.createElement('p', { className: 'dex-small', style: { margin: 0 } }, t('footer'))
    )
  }

  function ExaCard(props) {
    const t = props !== null && props !== undefined && typeof props.t === 'function' ? props.t : (key) => key
    if (props !== null && props !== undefined && props.view === 'summary') return t('summary')
    return react.createElement(ExaSettings, { t })
  }

  function apply(ctx) {
    ctx.effect(() => ctx.locale.register(NS, { zh: DICTS.zh, en: DICTS.en }), 'dsh-exa: client dictionaries')
    ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
      name: 'plugins.bundle.config',
      key: PKG,
      id: PKG,
      locale: NS,
    }, ExaCard))
  }

  return { apply, inject }

}