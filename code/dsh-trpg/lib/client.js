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
      inject: ['slots'],
      apply(ctx) {
        ctx.effect(() => {
          const style = document.createElement('style')
          style.dataset.pluginCss = 'dsh-trpg/dice'
          style.textContent = css + mapCss
          document.head.append(style)
          return () => style.remove()
        })
        ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({ name: 'tool.call.toolview', key: 'trpg_check' }, DiceRow))
        ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({ name: 'tool.call.toolview', key: 'trpg_combat_attack' }, CombatRow))
        ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({ name: 'tool.call.toolview', key: 'trpg_combat' }, CombatRow))
        ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({ name: 'conversation.session.header.utilities', id: 'trpg-map', order: 10 }, MapControl))
      },
    }
  },
})
