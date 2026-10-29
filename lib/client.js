window.__ModuleLoader__.load({
  id: "dsh-exa",
  factory: function factory(require) {
  const react = require('react')
  const { useCallback, useEffect, useState } = react
  const DICTS = {"en":{"summary":"Manage Exa API keys, key routing, and a shortcut to Exa Billing. The built-in web_search is never replaced.","intro":"Exa keys are tried in the order shown. Priority mode starts at the first key every time; round-robin rotates the starting key. A 401, 402, or 429 response moves that call to the next key. Built-in web_search is unaffected.","strategy.title":"Key routing","strategy.label":"Routing strategy","strategy.priority":"Priority","strategy.roundRobin":"Round-robin","strategy.priorityHint":"Each call starts with the first key. Later keys are fallbacks.","strategy.roundRobinHint":"Each call starts with the next key in the list. Fallbacks continue from there.","strategy.saved":"Routing strategy saved.","strategy.failed":"Could not save the routing strategy.","keys.title":"API keys","keys.subtitle":"The top key is primary. Drag the handle or use the arrow buttons to change the draft order, then save it.","keys.empty":"No Exa API key is configured yet.","keys.addLabel":"Add keys","keys.addPlaceholder":"Paste one or more Exa API keys, separated by commas or new lines","keys.addButton":"Add keys","keys.addHint":"The server trims whitespace, removes empty entries, and ignores keys that are already configured.","keys.batchAdded":"Added {count} key(s).","keys.noNewKeys":"No new keys were added; every supplied key is already configured.","keys.addFailed":"Could not add keys.","keys.order":"Order","keys.key":"Key","keys.saved":"Saved","keys.actions":"Actions","keys.primary":"Primary","keys.primaryTitle":"Primary — the first key tried in priority mode","keys.readOnly":"Read-only","keys.readOnlyHint":"These keys come from the environment that launched dsh. Unset EXA_API_KEYS or EXA_API_KEY in that shell and restart dsh to manage them here.","keys.sourceList":"from EXA_API_KEYS","keys.sourcePrimary":"from EXA_API_KEY","keys.sourceNone":"not configured","keys.savedUnknown":"Unknown","keys.reveal":"Show key","keys.hide":"Hide key","keys.replace":"Replace key","keys.delete":"Delete key","keys.confirmDelete":"Confirm delete","keys.cancel":"Cancel","keys.save":"Save","keys.moveUp":"Move up","keys.moveDown":"Move down","keys.dragHandle":"Drag to reorder","keys.unsavedOrder":"Order changes are not saved yet.","keys.saveOrder":"Save order","keys.cancelOrder":"Cancel order changes","keys.orderSaved":"Key order saved.","keys.keySaved":"Key saved.","keys.keyRemoved":"Key removed.","keys.keyReplaced":"Key replaced.","keys.removeFailed":"Could not remove the key.","keys.replaceFailed":"Could not replace the key.","keys.revealFailed":"Could not reveal the key.","keys.orderFailed":"Could not save the key order.","keys.newKeyPlaceholder":"New key value","keys.replacePlaceholder":"Replacement key value","keys.loading":"Loading key settings…","keys.loadFailed":"Could not load Exa settings.","keys.refresh":"Reload","keys.saving":"Saving…","keys.maskedFallback":"masked key","keys.readOnlyReasonPrimary":"EXA_API_KEY is supplied read-only by the launching environment.","keys.readOnlyReasonList":"EXA_API_KEYS is supplied read-only by the launching environment.","billing.title":"Billing","billing.subtitle":"Your credit balance, invoices, and auto recharge are managed in the Exa dashboard. This card does not read or display your balance.","billing.open":"Open Exa Billing","footer":"Exa search, advanced search, and fetch are additional tools. Built-in web_search and web_fetch keep their existing providers and schemas.","common.saving":"Saving…","common.save":"Save","common.cancel":"Cancel","common.close":"Close","common.retry":"Retry","common.remove":"Remove","common.confirm":"Confirm","common.options":"Options","error.credentials_unavailable":"The credential service is unavailable.","error.readonly_keys":"EXA_API_KEYS is supplied read-only by the launching environment. Unset it there and restart dsh, or edit ~/.dsh/.credentials.yaml.","error.readonly_primary":"EXA_API_KEY is supplied read-only by the launching environment. Unset it there and restart dsh.","error.duplicate_key":"That key is already configured.","error.key_not_found":"That key is no longer configured. Reload the card.","error.invalid_order":"The order must list every current key exactly once.","error.invalid_value":"The supplied value is not valid.","error.invalid_action":"Unsupported management action.","error.unknown":"The operation failed.","error.load_failed":"Could not load settings.","error.save_failed":"Could not save the change."},"zh":{"summary":"管理 Exa API key、调用顺序，以及 Exa Billing 快捷入口。内置 web_search 不受影响。","intro":"Exa key 按表中顺序尝试。优先级模式每次从第一个 key 开始；轮询模式轮流选择起始 key。遇到 401、402 或 429 时，本次调用会改用下一个 key。内置 web_search 不受影响。","strategy.title":"Key 调用策略","strategy.label":"调用策略","strategy.priority":"优先级","strategy.roundRobin":"轮询","strategy.priorityHint":"每次调用从第一个 key 开始，后续 key 作为故障切换。","strategy.roundRobinHint":"每次调用从列表中的下一个 key 开始，故障切换从该位置继续。","strategy.saved":"调用策略已保存。","strategy.failed":"无法保存调用策略。","keys.title":"API key","keys.subtitle":"最上方的 key 是主 key。拖动把手或使用箭头按钮调整草稿顺序，然后保存。","keys.empty":"尚未配置 Exa API key。","keys.addLabel":"添加 key","keys.addPlaceholder":"粘贴一个或多个 Exa API key，用逗号或换行分隔","keys.addButton":"添加 key","keys.addHint":"服务端会去除空白、丢弃空项，并忽略已经配置过的 key。","keys.batchAdded":"已添加 {count} 个 key。","keys.noNewKeys":"没有新增 key；提供的 key 都已经配置。","keys.addFailed":"无法添加 key。","keys.order":"顺序","keys.key":"Key","keys.saved":"保存时间","keys.actions":"操作","keys.primary":"主 key","keys.primaryTitle":"主 key — 优先级模式下最先尝试的 key","keys.readOnly":"只读","keys.readOnlyHint":"这些 key 来自启动 dsh 的环境变量。请在该 shell 中取消 EXA_API_KEYS 或 EXA_API_KEY 并重启 dsh，才能在此管理。","keys.sourceList":"来自 EXA_API_KEYS","keys.sourcePrimary":"来自 EXA_API_KEY","keys.sourceNone":"未配置","keys.savedUnknown":"未知","keys.reveal":"显示 key","keys.hide":"隐藏 key","keys.replace":"替换 key","keys.delete":"删除 key","keys.confirmDelete":"确认删除","keys.cancel":"取消","keys.save":"保存","keys.moveUp":"上移","keys.moveDown":"下移","keys.dragHandle":"拖动排序","keys.unsavedOrder":"顺序修改尚未保存。","keys.saveOrder":"保存顺序","keys.cancelOrder":"取消顺序修改","keys.orderSaved":"key 顺序已保存。","keys.keySaved":"key 已保存。","keys.keyRemoved":"key 已删除。","keys.keyReplaced":"key 已替换。","keys.removeFailed":"无法删除该 key。","keys.replaceFailed":"无法替换该 key。","keys.revealFailed":"无法显示该 key。","keys.orderFailed":"无法保存 key 顺序。","keys.newKeyPlaceholder":"新 key 值","keys.replacePlaceholder":"替换后的 key 值","keys.loading":"正在加载 key 设置…","keys.loadFailed":"无法加载 Exa 设置。","keys.refresh":"重新加载","keys.saving":"保存中…","keys.maskedFallback":"已掩码的 key","keys.readOnlyReasonPrimary":"EXA_API_KEY 由启动环境提供，且为只读。","keys.readOnlyReasonList":"EXA_API_KEYS 由启动环境提供，且为只读。","billing.title":"账单与余额","billing.subtitle":"余额、发票和自动充值在 Exa 控制台管理。此卡片不读取也不显示余额。","billing.open":"打开 Billing","footer":"Exa 搜索、高级搜索和抓取是附加工具。内置 web_search 与 web_fetch 保留原有 provider 和 schema。","common.saving":"保存中…","common.save":"保存","common.cancel":"取消","common.close":"关闭","common.retry":"重试","common.remove":"删除","common.confirm":"确认","common.options":"选项","error.credentials_unavailable":"凭据服务不可用。","error.readonly_keys":"EXA_API_KEYS 由启动环境提供且为只读。请在该环境中取消设置并重启 dsh，或编辑 ~/.dsh/.credentials.yaml。","error.readonly_primary":"EXA_API_KEY 由启动环境提供且为只读。请在该环境中取消设置并重启 dsh。","error.duplicate_key":"该 key 已经配置。","error.key_not_found":"该 key 已不存在，请重新加载卡片。","error.invalid_order":"顺序必须且只能包含当前所有 key。","error.invalid_value":"提供的值无效。","error.invalid_action":"不支持的管理操作。","error.unknown":"操作失败。","error.load_failed":"无法加载设置。","error.save_failed":"无法保存修改。"}}
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
      const canDrag = !keysReadOnly && !managerBusy
      const rowClass = 'dex-row' + (draggingId === entry.id ? ' dex-row-dragging' : '') + (dragOverId === entry.id && draggingId !== entry.id ? ' dex-row-drop' : '')
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
            react.createElement('div', { className: 'dex-key' }, isRevealed ? revealed[entry.id] : entry.masked),
            react.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' } },
              entry.primary ? react.createElement('span', { className: 'dex-dot', title: t('keys.primaryTitle') }) : null,
              entry.primary ? react.createElement('span', { className: 'dex-small' }, t('keys.primary')) : null,
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
          react.createElement('span', { className: 'dex-small' }, sourceText)
        ),
        react.createElement('p', { style: pStyle }, t('keys.subtitle')),
        keysReadOnly
          ? react.createElement('p', { className: 'dex-small', role: 'status' },
            t('keys.readOnly') + ': ' + (server.source === 'primary' ? t('keys.readOnlyReasonPrimary') : t('keys.readOnlyReasonList')))
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
});
