// Native DSH client module. React and the slot registry are supplied by the host.
window.__ModuleLoader__.load({
  id: 'dsh-trpg',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const css = `
.trpg-dice-card{margin:8px 0;padding:16px 18px;border:1px solid #b8aa8b66;border-radius:14px;background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-primary,#242833);max-width:600px;box-sizing:border-box}
.trpg-dice-head{display:flex;justify-content:space-between;gap:12px;font-size:12px;opacity:.78;margin-bottom:10px}.trpg-dice-purpose{font-size:15px;line-height:1.6;margin:0 0 14px;white-space:pre-wrap;overflow-wrap:anywhere}
.trpg-dice-tray{display:flex;align-items:center;gap:14px;min-height:76px;padding:10px 0 16px;perspective:500px}.trpg-die{display:grid;grid-template:repeat(3,1fr)/repeat(3,1fr);gap:4px;width:60px;height:60px;box-sizing:border-box;padding:10px;border-radius:12px;border:1px solid #a0844f;background:linear-gradient(145deg,#fffdf4,#eaddbe);box-shadow:0 5px 0 #b79a66,0 9px 18px #0002;transform:rotate(-5deg)}
.trpg-die:nth-child(2){transform:rotate(7deg)}.trpg-pip{width:8px;height:8px;border-radius:50%;background:#493820;align-self:center;justify-self:center}.trpg-die-unknown{font-size:26px;color:#493820;display:flex;justify-content:center;align-items:center}
.trpg-dice-card[data-rolling=true] .trpg-die{animation:trpg-tumble .85s cubic-bezier(.2,.7,.3,1)}.trpg-dice-card[data-rolling=true] .trpg-die:nth-child(2){animation-delay:70ms}.trpg-dice-total{font-size:27px;font-weight:650;margin-left:7px}.trpg-dice-formula{font-size:13px;line-height:1.7;white-space:pre-wrap;overflow-wrap:anywhere}.trpg-dice-tier{font-size:16px;font-weight:600;margin:8px 0 3px}.trpg-dice-card[data-tier=critical_success]{border-color:#b7933e;box-shadow:0 0 0 2px #dcc07133}.trpg-dice-card[data-tier=critical_failure]{border-color:#ab6e70}.trpg-dice-help{font-size:12px;line-height:1.6;opacity:.72;margin-top:8px}.trpg-dice-replay{font:inherit;font-size:12px;border:0;background:transparent;color:inherit;text-decoration:underline;cursor:pointer;padding:6px 0;margin-top:5px}.trpg-dice-card details{margin-top:8px;font-size:12px}.trpg-dice-card pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:220px;overflow:auto}
@keyframes trpg-tumble{0%{transform:translateY(-12px) rotateX(210deg) rotateZ(-55deg);opacity:.5}45%{transform:translateY(7px) rotateX(40deg) rotateZ(22deg)}75%{transform:translateY(-3px) rotateX(0deg) rotateZ(-10deg)}100%{transform:translateY(0) rotateX(0deg)}}
@media(prefers-reduced-motion:reduce){.trpg-dice-card[data-rolling=true] .trpg-die{animation:none}}
`
    const mapCss = `
.trpg-map-toggle{font:inherit;font-size:13px;line-height:24px;display:inline-flex;align-items:center;gap:5px;padding:2px 9px;border:1px solid var(--dsw-alias-border-l1,#8885);border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary,inherit);cursor:pointer;white-space:nowrap}
.trpg-map-toggle:hover,.trpg-map-toggle[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover,#8882)}.trpg-map-toggle:focus-visible,.trpg-map-panel button:focus-visible,.trpg-map-panel a:focus-visible{outline:2px solid #b69759;outline-offset:3px}
.trpg-map-panel{position:fixed;z-index:1000;right:16px;top:58px;width:min(340px,calc(100vw - 24px));height:min(270px,calc(100dvh - 180px));min-height:190px;display:flex;flex-direction:column;border:1px solid var(--dsw-alias-border-l1,#8885);border-radius:12px;background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-primary,#242833);box-shadow:0 8px 28px #0003;overflow:hidden}
.trpg-map-panel[data-expanded=true]{width:min(650px,calc(100vw - 32px));height:min(580px,calc(100dvh - 210px))}
.trpg-map-panel[data-expanded=false]{width:min(260px,calc(100vw - 24px));height:auto;min-height:0;overflow:visible;border:0;border-radius:0;background:transparent;box-shadow:none}
.trpg-map-panel[data-expanded=false] .trpg-map-top{background:var(--dsw-alias-bg-base,#fff);border:1px solid var(--dsw-alias-border-l1,#8885);border-radius:12px;margin-bottom:6px;box-shadow:0 3px 12px #0002}
.trpg-map-panel[data-expanded=false] .trpg-map-note{background:var(--dsw-alias-bg-base,#fff);border-radius:8px;margin-top:6px;order:3;text-align:center}
.trpg-map-viewport{position:relative;flex:1;min-height:0;overflow:hidden;background:#e7e3d8}
.trpg-map-panel[data-expanded=false] .trpg-map-viewport{flex:none;width:100%;aspect-ratio:1;border-radius:50%;corner-shape:round;clip-path:circle(50%);border:3px solid #b69759;box-sizing:border-box;box-shadow:0 5px 20px #0004}
.trpg-map-panel[data-expanded=false] .trpg-map-frame{position:absolute;width:1200px;height:700px;max-width:none;left:50%;top:50%;transform:translate(-50%,-50%)}
.trpg-map-top{display:flex;align-items:center;gap:9px;padding:5px 9px;border-bottom:1px solid var(--dsw-alias-border-l1,#8884)}.trpg-map-title{font-size:12px;font-weight:600;flex:1}.trpg-map-top a{font-size:11px;color:inherit}.trpg-map-resize{font:inherit;font-size:11px;color:inherit;border:0;background:transparent;cursor:pointer;padding:3px}.trpg-map-close{font:inherit;font-size:18px;line-height:24px;width:24px;border:0;border-radius:7px;background:transparent;color:inherit;cursor:pointer}.trpg-map-close:hover{background:#8882}.trpg-map-note{margin:0;padding:4px 9px;font-size:10px;line-height:1.5;opacity:.8}.trpg-map-frame{display:block;flex:1;width:100%;min-height:0;border:0;background:#e7e3d8}.trpg-map-loading{padding:4px 9px;font-size:11px;opacity:.7}
@media(max-width:600px){.trpg-map-panel{top:56px;right:8px}.trpg-map-panel[data-expanded=true]{width:calc(100vw - 16px);height:calc(100dvh - 190px)}}
`
    const saveCss = `
.trpg-save-actions{display:inline-flex;gap:5px;margin-left:6px}.trpg-save-toggle{font:inherit;font-size:12px;line-height:24px;padding:2px 8px;border:1px solid var(--dsw-alias-border-l1,#8885);border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary,inherit);cursor:pointer;white-space:nowrap}.trpg-save-toggle:hover,.trpg-save-toggle[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover,#8882)}.trpg-save-toggle:focus-visible,.trpg-save-panel button:focus-visible,.trpg-save-panel input:focus-visible,.trpg-save-panel select:focus-visible,.trpg-save-panel textarea:focus-visible{outline:2px solid #b69759;outline-offset:2px}
.trpg-save-panel{position:fixed;z-index:1002;right:16px;top:58px;width:min(440px,calc(100vw - 24px));max-height:calc(100dvh - 80px);overflow:auto;padding:16px;border:1px solid var(--dsw-alias-border-l1,#8885);border-radius:12px;background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-primary,#242833);box-shadow:0 8px 28px #0004;box-sizing:border-box;font-size:13px;line-height:1.55}.trpg-save-panel h3{font-size:16px;margin:0}.trpg-save-panel p{margin:6px 0 10px}.trpg-save-top{display:flex;align-items:center;gap:8px;margin-bottom:10px}.trpg-save-top h3{flex:1}.trpg-save-panel label{display:block;margin:9px 0 4px;font-size:12px}.trpg-save-panel input,.trpg-save-panel select,.trpg-save-panel textarea{display:block;width:100%;margin-top:4px;padding:8px;border:1px solid var(--dsw-alias-border-l1,#8885);border-radius:7px;background:var(--dsw-alias-bg-base,#fff);color:inherit;font:inherit;box-sizing:border-box}.trpg-save-panel textarea{resize:vertical;min-height:58px}.trpg-save-panel button{font:inherit;color:inherit;cursor:pointer}.trpg-save-primary{padding:7px 12px;border:0;border-radius:7px;background:#c9aa68;color:#17232a!important;font-weight:600}.trpg-save-close{border:0;background:transparent;padding:3px 8px;font-size:18px}.trpg-save-list{display:grid;gap:8px;margin:10px 0}.trpg-save-entry{padding:10px;border:1px solid var(--dsw-alias-border-l1,#8885);border-radius:8px;cursor:pointer}.trpg-save-entry[data-selected=true]{border-color:#b69759;box-shadow:0 0 0 1px #b69759}.trpg-save-entry strong{display:block;font-size:13px}.trpg-save-entry small,.trpg-save-muted{opacity:.72;font-size:11px}.trpg-save-status{margin-top:9px;padding:8px;border-radius:7px;background:var(--dsw-alias-interactive-bg-hover,#8882);white-space:pre-wrap}.trpg-save-row{display:flex;gap:8px;align-items:center}.trpg-save-row>*{flex:1;min-width:0}
@media(max-width:600px){.trpg-save-panel{right:8px;top:54px}}
.trpg-save-confirm{display:flex;align-items:flex-start;gap:7px;margin:10px 0;font-size:12px;line-height:1.5}.trpg-save-confirm input{margin-top:2px}
`
    const mapUrl = 'https://act.mihoyo.com/ys/app/interactive-map/index.html?lang=zh-cn'
    function MapControl() {
      const [open, setOpen] = React.useState(false)
      const [loading, setLoading] = React.useState(true)
      const [expanded, setExpanded] = React.useState(false)
      const button = React.useRef(null)
      const panelId = React.useId()
      const close = () => { setOpen(false); button.current?.focus() }
      React.useEffect(() => {
        if (!open) return
        const onKey = event => { if (event.key === 'Escape') close() }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
      }, [open])
      return h(React.Fragment, null,
        h('button', { ref: button, type: 'button', className: 'trpg-map-toggle', title: '查看提瓦特地图', 'aria-expanded': open, 'aria-controls': panelId, onClick: () => { setLoading(true); setOpen(value => !value) } }, h('span', { 'aria-hidden': true }, '🗺'), '地图'),
        open && h('section', { id: panelId, className: 'trpg-map-panel', role: 'dialog', 'aria-modal': false, 'aria-label': '提瓦特地图', 'data-trpg-map-panel': true, 'data-expanded': expanded },
          h('div', { className: 'trpg-map-top' }, h('span', { className: 'trpg-map-title' }, '提瓦特地图'),
            h('button', { type: 'button', className: 'trpg-map-resize', onClick: () => setExpanded(value => !value), 'aria-label': expanded ? '缩小地图' : '放大地图' }, expanded ? '缩小' : '放大'),
            h('a', { href: mapUrl, target: '_blank', rel: 'noopener noreferrer' }, '独立打开'),
            h('button', { type: 'button', className: 'trpg-map-close', 'aria-label': '关闭地图', onClick: close }, '×')),
          h('p', { className: 'trpg-map-note' }, '官方地图 · 战役位置以 GM 记录为准'),
          loading && h('div', { className: 'trpg-map-loading', role: 'status' }, '正在载入地图；若无法显示，可选择“独立打开”。'),
          h('div', { className: 'trpg-map-viewport' }, h('iframe', { src: mapUrl, title: '原神官方提瓦特地图', className: 'trpg-map-frame', style: expanded ? { height: '100%' } : undefined, referrerPolicy: 'no-referrer', sandbox: 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox', onLoad: () => setLoading(false) }))))
    }
    let dshSessions
    function latestConversationPosition(sessionId) {
      const entries = dshSessions?.binding(sessionId)?.eventSource.getSnapshot().entries ?? []
      const seqs = entries
        .filter(entry => entry.type === 'event')
        .map(entry => entry.event?.seq ?? entry.seq)
        .map(value => typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value)
        .filter(Number.isSafeInteger)
      return seqs.length ? { sessionId, atSeq: Math.max(...seqs) } : null
    }
    function SaveControl({ sessionId, open: openSession }) {
      const [panel, setPanel] = React.useState(null)
      const [mode, setMode] = React.useState('solo')
      const [slots, setSlots] = React.useState([])
      const [slot, setSlot] = React.useState('')
      const [checkpoints, setCheckpoints] = React.useState([])
      const [selected, setSelected] = React.useState('')
      const [name, setName] = React.useState('')
      const [description, setDescription] = React.useState('')
      const [targetSlot, setTargetSlot] = React.useState('')
      const [busy, setBusy] = React.useState(false)
      const [status, setStatus] = React.useState('')
      const [confirmed, setConfirmed] = React.useState(false)
      const slotKey = `dsh-trpg-slot-${sessionId}`
      const request = async (body) => {
        const response = await fetch('api/trpg-checkpoints', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
        const text = await response.text()
        let data
        try { data = JSON.parse(text) }
        catch {
          if (response.status === 404 || /^not found\s*$/i.test(text.trim())) {
            throw new Error('DSH 没有找到存档接口。请重载 dsh-trpg 插件并刷新本页后重试；现有存档没有被修改。')
          }
          throw new Error(`存档接口返回了非 JSON 内容（HTTP ${response.status}）：${text.slice(0, 160) || '空响应'}`)
        }
        if (!response.ok || !data.ok) throw new Error(data.error ?? `存档操作失败（${response.status}）`)
        return data.result
      }
      const refreshSlots = async (nextMode = mode) => {
        const found = await request({ op: 'slots', mode: nextMode, slot: 'dsh_ui' })
        setSlots(found.slots)
        const remembered = localStorage.getItem(slotKey)
        const nextSlot = found.slots.includes(remembered) ? remembered : found.slots.length === 1 ? found.slots[0] : ''
        setSlot(nextSlot)
        if (nextSlot) localStorage.setItem(slotKey, nextSlot)
        return nextSlot
      }
      const refreshCheckpoints = async (nextMode = mode, nextSlot = slot) => {
        if (!nextSlot) { setCheckpoints([]); setSelected(''); return [] }
        const found = await request({ op: 'list', mode: nextMode, slot: nextSlot })
        setCheckpoints(found.checkpoints)
        setSelected(found.checkpoints[0]?.id ?? '')
        return found.checkpoints
      }
      const open = async (kind) => {
        setPanel(kind); setStatus(''); setConfirmed(false); setBusy(true)
        try {
          const chosen = await refreshSlots(mode)
          if (kind === 'load' && chosen) await refreshCheckpoints(mode, chosen)
          if (kind === 'save') {
            setName(''); setDescription('')
          } else setTargetSlot(`test_${Date.now().toString(36)}`)
        } catch (error) { setStatus(error.message) }
        finally { setBusy(false) }
      }
      const changeMode = async (nextMode) => {
        setMode(nextMode); setBusy(true); setStatus('')
        try {
          const chosen = await refreshSlots(nextMode)
          if (panel === 'load' && chosen) await refreshCheckpoints(nextMode, chosen)
        } catch (error) { setStatus(error.message) }
        finally { setBusy(false) }
      }
      const changeSlot = async (nextSlot) => {
        setSlot(nextSlot); localStorage.setItem(slotKey, nextSlot); setBusy(true); setStatus('')
        try { if (panel === 'load') await refreshCheckpoints(mode, nextSlot) }
        catch (error) { setStatus(error.message) }
        finally { setBusy(false) }
      }
      const save = async () => {
        if (!slot) { setStatus('请先选择一个已有存档。'); return }
        setBusy(true); setStatus('正在保存当前进度…')
        try {
          const conversation = latestConversationPosition(sessionId)
          const result = await request({ op: 'save', mode, slot, name, description, conversation })
          const saved = result.checkpoint ?? result
          // Some host versions return only the checkpoint header from save;
          // reload the canonical entry so the UI gets progress and chat metadata.
          const listed = await request({ op: 'list', mode, slot })
          const checkpoint = listed.checkpoints?.find(item => item.id === saved.id) ?? saved
          const p = checkpoint.progress ?? {}
          const progress = [p.station, p.location, p.day == null ? '' : `第 ${p.day} 日`, `修订 ${checkpoint.revision}`].filter(Boolean).join(' · ')
          setStatus(`已保存「${checkpoint.name ?? name}」${progress ? `\n${progress}` : ''}${checkpoint.conversation ? `\n已关联当前聊天（消息序号 ${checkpoint.conversation.atSeq}），读取时会自动创建并打开对话分支。` : '\n当前 DSH 会话尚未提供可读取的消息位置；读取时只能恢复游戏状态。'}`)
        } catch (error) { setStatus(error.message) }
        finally { setBusy(false) }
      }
      const load = async () => {
        if (!selected) { setStatus('请选择一个回溯存档。'); return }
        if (!confirmed) { setStatus('请先确认会创建新的游戏存档与聊天分支。'); return }
        if (!/^[a-zA-Z0-9_-]{1,48}$/.test(targetSlot)) { setStatus('新存档名须为 1–48 位字母、数字、下划线或短横线。'); return }
        setBusy(true); setStatus('正在创建回溯分支…')
        try {
          const result = await request({ op: 'branch', mode, slot, checkpointId: selected, targetSlot, playerConfirmed: true })
          let chatBranched = false
          let status = `已创建游戏进度「${result.state.title}」的新存档 ${targetSlot}。\n${result.state.timeline.name} · ${result.state.world.location} · 第 ${result.state.world.day} 日 · 修订 ${result.source.revision}`
          if (result.conversation && dshSessions?.fork && typeof openSession === 'function') {
            try {
              const childId = await dshSessions.fork({ sessionId: result.conversation.sessionId, atSeq: result.conversation.atSeq, increaseTitle: true })
              localStorage.setItem(`dsh-trpg-slot-${childId}`, targetSlot)
              chatBranched = true
              openSession(childId)
              status += `\n已从保存时的聊天位置创建并打开 DSH 对话分支（消息序号 ${result.conversation.atSeq}）。`
            } catch (error) {
              status += `\nDSH 对话分支创建失败：${error.message}。当前聊天仍使用原存档选择，原聊天和源存档均保留。`
            }
          } else {
            status += '\n该进度点没有可用的 DSH 会话位置，因此只创建了游戏状态回溯；当前聊天和存档选择保持不变。请先在 DSH 中从对应消息手动分支，再选择新存档继续。'
          }
          setStatus(status)
          setSlots(previous => [targetSlot, ...previous.filter(value => value !== targetSlot)])
          if (chatBranched) {
            setMode(mode); setSlot(targetSlot); setCheckpoints([]); setSelected('')
          }
        } catch (error) { setStatus(error.message) }
        finally { setBusy(false) }
      }
      const close = () => setPanel(null)
      return h(React.Fragment, null,
        h('div', { className: 'trpg-save-actions' },
          h('button', { type: 'button', className: 'trpg-save-toggle', 'aria-expanded': panel === 'save', onClick: () => panel === 'save' ? close() : open('save') }, '主动保存'),
          h('button', { type: 'button', className: 'trpg-save-toggle', 'aria-expanded': panel === 'load', onClick: () => panel === 'load' ? close() : open('load') }, '读取存档')),
        panel && h('section', { className: 'trpg-save-panel', role: 'dialog', 'aria-modal': false, 'aria-label': panel === 'save' ? '主动保存进度' : '读取存档' },
          h('div', { className: 'trpg-save-top' }, h('h3', null, panel === 'save' ? '保存当前进度' : '读取回溯存档'), h('button', { type: 'button', className: 'trpg-save-close', onClick: close, 'aria-label': '关闭' }, '×')),
          h('p', { className: 'trpg-save-muted' }, panel === 'save' ? '建立此刻的回溯点，之后可在这里重新分支测试。' : '读取点会恢复游戏状态并创建新存档，原档保留。新建的进度点会关联 DSH 对话位置，读取时自动创建并打开聊天分支；旧进度点没有对话位置时只恢复游戏状态。'),
          h('div', { className: 'trpg-save-row' },
            h('label', null, '模式', h('select', { value: mode, disabled: busy, onChange: event => changeMode(event.target.value) }, h('option', { value: 'solo' }, '单人'), h('option', { value: 'multi' }, '多人'))),
            h('label', null, '现有存档', h('select', { value: slot, disabled: busy || !slots.length, onChange: event => changeSlot(event.target.value) }, h('option', { value: '' }, slots.length ? '请选择存档' : '未找到已有存档'), slots.map(value => h('option', { key: value, value }, value))))),
          panel === 'save'
            ? h(React.Fragment, null,
              h('label', null, '进度名称', h('input', { value: name, maxLength: 80, placeholder: '例如：前往风龙废墟之前', onChange: event => setName(event.target.value) })),
              h('label', null, '进度说明', h('textarea', { value: description, maxLength: 240, placeholder: '记录当前目标、关键决定或测试分支，方便之后辨认。', onChange: event => setDescription(event.target.value) })),
              h('button', { type: 'button', className: 'trpg-save-primary', disabled: busy || !slot, onClick: save }, busy ? '处理中…' : '保存当前进度'))
            : h(React.Fragment, null,
              h('div', { className: 'trpg-save-list' }, checkpoints.length ? checkpoints.map(cp => {
                const p = cp.progress ?? {}
                return h('div', { key: cp.id, className: 'trpg-save-entry', 'data-selected': selected === cp.id, role: 'button', tabIndex: 0, onClick: () => setSelected(cp.id), onKeyDown: event => { if (event.key === 'Enter' || event.key === ' ') setSelected(cp.id) } },
                  h('strong', null, cp.name),
                  cp.description && h('div', null, cp.description),
                  h('small', null, `${p.campaign ?? ''} · ${p.station ?? ''} · ${p.location ?? ''} · 第 ${p.day ?? '?'} 日 · 修订 ${cp.revision}${p.scene ? ` · 场景：${p.scene}` : ''}${p.battle ? ` · ${p.battle}` : ''} · ${cp.conversation ? '关联DSH聊天' : '仅游戏状态'}`),
                  h('div', { className: 'trpg-save-muted' }, new Date(cp.savedAt).toLocaleString()))
              }) : h('p', { className: 'trpg-save-muted' }, slot ? '这个存档还没有手动保存的进度点。先在“主动保存”中记录一个进度，之后便可在这里读取。' : '请先选择已有存档。')),
              h('label', null, '新测试存档名称', h('input', { value: targetSlot, maxLength: 48, onChange: event => setTargetSlot(event.target.value) })),
              h('label', { className: 'trpg-save-confirm' }, h('input', { type: 'checkbox', checked: confirmed, onChange: event => setConfirmed(event.target.checked) }), '确认保留原存档，并恢复到全新的存档与聊天分支。'),
              h('button', { type: 'button', className: 'trpg-save-primary', disabled: busy || !selected || !confirmed, onClick: load }, busy ? '处理中…' : '读取为新存档')),
          status && h('div', { className: 'trpg-save-status', role: 'status' }, status)))
    }
    const positions = { 1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] }
    const sign = n => n >= 0 ? `+${n}` : `${n}`
    function die(face, index) {
      return h('div', { className: positions[face] ? 'trpg-die' : 'trpg-die trpg-die-unknown', role: 'img', 'aria-label': `骰子${index + 1}：${face ?? '等待'}`, key: index },
        ...(positions[face] ? positions[face].map(position => h('span', { key: position, className: 'trpg-pip', style: { gridRow: Math.ceil(position / 3), gridColumn: (position - 1) % 3 + 1 } })) : ['?']))
    }
    function parse(block) {
      const settled = 'kind' in block
      let args = {}, value = null
      try { args = JSON.parse((settled ? block.call?.argsRaw : block.argsRaw) || '{}') } catch {}
      const text = settled ? (block.content ?? []).filter(c => c.type === 'text').map(c => c.text).join('\n') : ''
      try { value = JSON.parse(text) } catch {}
      const check = value?.check
      const valid = Array.isArray(check?.dice) && check.dice.length === 2 && check.dice.every(d => Number.isInteger(d) && d >= 1 && d <= 6) && Number.isFinite(check.total) && check.breakdown
      const combat = (settled ? block.call?.name : block.name)?.startsWith('trpg_combat') || Boolean(value?.damage || value?.battleOver !== undefined)
      return { settled, input: args.input ?? {}, value, combat, check: valid ? check : null, error: block.isError ? text.slice(0, 300) || '检定未执行' : null }
    }
    function DiceRow({ block, combat = false }) {
      const model = parse(block)
      model.combat ||= combat
      const seenRunning = React.useRef(!model.settled)
      const timer = React.useRef(null)
      const [rolling, setRolling] = React.useState(false)
      const animate = () => {
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
        clearTimeout(timer.current)
        setRolling(true)
        timer.current = setTimeout(() => setRolling(false), 1000)
      }
      React.useEffect(() => {
        if (!model.settled) seenRunning.current = true
        else if (seenRunning.current && model.check) { seenRunning.current = false; animate() }
      }, [model.settled, model.check?.total, model.check?.dice.join(',')])
      React.useEffect(() => () => clearTimeout(timer.current), [])
      const c = model.check, b = c?.breakdown
      const status = model.error ? '未执行' : model.value?.cancelled ? '已取消' : !model.settled ? (model.input.waitForPlayer ? '等待你提交' : '检定中') : c ? '已记录' : '未结算'
      const formula = c ? `${c.dice.join(' + ')}；${model.input.attribute ?? '灵巧'} ${sign(b.attribute)}${model.input.tag ? `，${model.input.tag} ${sign(b.tag)}` : ''}${b.circumstance ? `，协助/处境 ${sign(b.circumstance)}` : ''}${b.gear ? `，装备 ${sign(b.gear)}` : ''}，难度 ${sign(b.difficulty)}${b.capped ? '，总修正封顶+5' : ''} → ${c.total}` : ''
      return h('section', { className: 'trpg-dice-card', 'data-trpg-dice-card': true, 'data-rolling': rolling, 'data-tier': c?.tier },
        h('div', { className: 'trpg-dice-head' }, h('span', null, model.combat ? '战斗检定 · 2d6' : '冒险检定 · 2d6'), h('span', null, status)),
        h('p', { className: 'trpg-dice-purpose' }, model.input.purpose ?? (model.combat ? `${model.input.actor ?? '角色'} · ${model.input.action ?? 'attack'} → ${model.input.target ?? '脱离战斗'}` : '剧情行动检定')),
        h('div', { className: 'trpg-dice-tray', 'aria-hidden': rolling || undefined }, die(c?.dice[0], 0), die(c?.dice[1], 1), c && h('span', { className: 'trpg-dice-total' }, rolling ? '…' : c.total)),
        h('div', { role: 'status', 'aria-live': 'polite' }, c ? [
          h('div', { className: 'trpg-dice-tier', key: 'tier' }, rolling ? '骰子落定中…' : c.tierLabel),
          !rolling && h('div', { className: 'trpg-dice-formula', key: 'formula' }, formula),
          !rolling && model.value?.damage && h('div', { className: 'trpg-dice-formula', key: 'damage' }, `造成伤害 ${model.value.damage.final}；目标剩余 HP ${model.value.hp}${model.value.damage.reaction ? `；${model.value.damage.reaction}` : ''}`),
        ] : h('div', { className: 'trpg-dice-help' }, model.error ?? model.value?.note ?? '请在下方的玩家检定卡片中提交。等待期间不消耗检定次数。')),
        c && h('button', { type: 'button', className: 'trpg-dice-replay', onClick: animate, disabled: rolling }, '回放动画（不重新掷骰）'),
        c && h('details', null, h('summary', null, '检定详情'), h('pre', null, JSON.stringify(c, null, 2))))
    }
    function CombatRow({ block }) {
      const model = parse(block)
      const rollingAction = ['attack', 'skill', 'interact', 'retreat'].includes(model.input.action ?? 'attack')
      return model.check || (!model.settled && rollingAction && (model.input.op === 'act' || !model.input.op)) || model.value?.cancelled
        ? h(DiceRow, { block, combat: true })
        : h('details', null, h('summary', null, '战斗记录'), h('pre', { style: { whiteSpace: 'pre-wrap', maxHeight: 260, overflow: 'auto' } }, model.error ?? JSON.stringify(model.value ?? model.input, null, 2)))
    }
    return {
      inject: ['slots', 'sessions'],
      apply(ctx) {
        dshSessions = ctx.sessions
        ctx.effect(() => {
          const style = document.createElement('style')
          style.dataset.pluginCss = 'dsh-trpg/dice'
          style.textContent = css + mapCss + saveCss
          document.head.append(style)
          return () => style.remove()
        })
        ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({ name: 'tool.call.toolview', key: 'trpg_check' }, DiceRow))
        ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({ name: 'tool.call.toolview', key: 'trpg_combat_attack' }, CombatRow))
        ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({ name: 'tool.call.toolview', key: 'trpg_combat' }, CombatRow))
        ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({ name: 'conversation.session.header.utilities', id: 'trpg-map', order: 10 }, MapControl))
        ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({ name: 'conversation.session.header.utilities', id: 'trpg-saves', order: 20 }, SaveControl))
      },
    }
  },
})
