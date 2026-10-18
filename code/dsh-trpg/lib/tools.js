import { Runtime, TOOL_NAMES, normalizeToolInput } from '../engine/runtime.js'
import { playerCheck } from './player-check.js'

const descriptions = {
  trpg_save: 'v0.02 战役：new 新建（拒绝覆盖，可选startStation为初始站点、startLocation为当地起点；省略则默认蒙德）、demo 固定试玩初始包、load/status/export 读取、list 列槽位、verify 校验事件回放。主动存档：checkpoint(name?,description?)在当前槽位建立完整回溯点及进度说明；checkpoints列出并校验回溯点；branch(checkpointId,targetSlot,playerConfirmed:true)读取到一个全新槽位并继续，原槽位与后续历史保留，目标已存在或玩家未明确确认时拒绝。只有玩家提出保存/读取时才执行，不把剧情叙事当作回档授权。玩家明确指定起点时必须在new时传入同一站点。每次明确 mode 和 slot。',
  trpg_char: 'guidance 必须使用 input:{op:"guidance",topic:"mainline"|"mondstadt"|"continuity"|"writing"}，例如 input:{op:"guidance",topic:"writing"}；这是只读调用，返回主线沙盒、蒙德关键进程、事实交接或关键场景对话自检，不建档、不修改存档。长对话出现文风漂移或上下文压缩后可调用 writing 快速重读。新团先 opening 读取正式开场与建卡引导；玩家明确指定初始地区时传 startStation 并按该地区开场，同时在 trpg_save new 传同一站点，不得沿用蒙德开场。若新档已默认创建且尚无场景/剧情进展，可用 trpg_state startAtStation(station,location?,reason,playerConfirmed:true)一次性按玩家选择修正；保留角色，不把先前章节记为完成。旧团更新规范只读取不重开。create 用 id/name/scheme/background/motivation/weapon/tags；自分属性用attributes六属性对象，scheme仅均衡/专精/通才，不传custom；tags 最多3个，推荐 [{name:"家境贫寒",modifier:-1,note:"缺乏财力时不利"}]，modifier=-1/0/+1；旧字符串标签默认+1，不能把负面标签擅自变为优势。setTags(id,tags,reason,playerConfirmed:true) 在场景外修正已建玩家标签，完整记录前后值，不删角色、不重建pc，不获得成长位。grow 的 tag 同样支持{name,modifier,note}，须唯一source。powerType=vision须选element；mundane无元素；custom须ability:{source,effect,limits,cost}，待审核不得行动。approvePower(id,playerConfirmed:true,mechanic:narrative,reason)只批准叙事/既有检定。get/list查询。',
  trpg_scene: '持久化剧情场景：open(goal,location,safe)，check(actor,attribute,tag?,helpers[]?,purpose)，close(summary)。至多三次检定，关闭时实际短休回能，空场景无恢复。',
  trpg_combat: '持久化战斗：roster 查名录；start(enemies:[{id?,name?,template?,element?}],phases?)，敌人只接收这四字段，不传note；act(actor,action,target?)；enemy 执行当前敌人；advance 在全员行动后推进。禁止传入 HP、伤害、档位和轮次。',
  trpg_combat_attack: '仅我方角色动作；不能在此传op:enemy/advance，敌方请用trpg_combat {op:"enemy"}；actor/target 为存档 id，action=attack/skill/interact/defend/assist/retreat/heal/switch/guard/transfer。玩家attack/skill/interact/retreat默认应传waitForPlayer:true及唯一requestId，等待玩家提交两个骰面；取消不耗行动。撤退须retreatCost:{type:supplies,item或position,quantity?,item?,reason}并事前公开，完整成功免额外代价、代价成功才支付；命中、装备、伤害与扣资源由引擎完成。返回publicSummary须简短展示在正文。',
  trpg_combat_advance: '完成本轮后推进持久化战斗；不接收 round/phases/enemiesAlive。不允许跳过尚未行动的单位。',
  trpg_item: '物品：list；use(actor,item,target?)；buy(type:料理/药剂/绷带/机关材料,id?)，1补给购买2份；transfer(item,quantity,recipient,reason,sourceId)将物品交给队外NPC并实际扣库存，支持场景外补记，不治疗、不造NPC角色卡，重试同requestId；grant(items[],sourceId,reason)；reward(sourceId,reason,kind?)；gather(id,name,sourceId)。奖励幂等、实际扣库存。',
  trpg_gear: '装备：catalog；equip(actor,item) 从真实库存穿戴；upgrade(actor,slot,material) 实际消耗材料与补给，刷新派生数值。',
  trpg_recover: '安全恢复：level=喘息/扎营/休整/神像；休整须 reason，神像须已激活 anchor。战斗中拒绝；短休仅由关场结算。',
  trpg_party: '队伍：status只读查询旅行者met/joined/present与在场成员；战斗名单只含玩家角色及已结识、玩家明确同意同行且当前在场的旅行者。traveler(action:meet/join/leave/return/dismiss,reason)记录实际结识、同意同行、暂离、归队、结束同行。join须playerConfirmed:true，已明确不见面时meet也须playerConfirmed:true；不得替玩家同意。新团默认未结识，不因单人模式自动入队。战斗中拒绝变更同行状态。support(actor,npc,name,reason)可用于任何已通过实际剧情互动建立信任/羁绊的NPC，不再限于初始四人；GM须确认NPC在当前场景且有明确协作依据。接口只检查发起者在当前场景，不自动校验NPC身份、在场或意愿；每场景仅登记一名一次性支援，不代表正式入队。assist(actor)只在当前行动者回合使用一次，提供+1处境修正；不产生独立攻击、治疗、护盾或控制。unlock(element,reason)按阶段且实际在场共鸣；元素切换用战斗switch动作。',
  trpg_relation: '四阶关系：get(actor,npc)；raise/betray/repair(actor,npc,sourceId,reason)。每事件至多升一阶，背叛暂停协作。',
  trpg_state: '世界状态：input必须用op指定操作，例如 {"op":"addThread","id":"lost_sister","text":"待调查的失踪线索","kind":"支线"}。get读取；facts只读返回当前有效known_facts及1-based factIndex，不写档。set(location?,safe?,day?,flagKey?,flagValue?,reason)，day是1–100000且不倒退的战役日期，仅登记已发生的时间流逝，不治疗/回能/发补给；休整用trpg_recover后核对日期，不重复加日。startAtStation(station,location?,reason,playerConfirmed:true)仅允许新档首场景/剧情进展前一次使用，按玩家明确选择改开局地区，旧章节保持未经历且不算完成。set拒绝未知字段。线程：addThread(id,text,kind,deadlineDay?,deadlineConsequence?) 的 kind 只能是主线或支线（省略默认支线）；threads 只读列出换站前待处理清单、各条后果与可选处置，不写档；classifyThread(id,kind,reason) 为旧档线程确认分类；closeThread(id,outcome,resolution?) 的 outcome=resolved实际完成或abandoned明确放弃，主线只能resolved；deferThread(id,reason) 仅支线可延期并随行保留。换站：nextStation(reason) 在主线未收束时拒绝、支线未处置时也拒绝，须先 threads 展示清单让玩家完成/放弃/延期。事实：addFact(text)新增当前有效事实；correctFact(factIndex,expectedText,replacement,reason)更正一条；retractFact(factIndex,expectedText,reason)撤回一条；retractFacts(items:[{factIndex,expectedText,reason},...])原子撤回多条。操作前先facts读取编号；每次写入都须把facts返回的revision传为顶层expectedRevision，并原样提交expectedText，避免过期编号误改；任一项过期则整批拒绝。纠错只改变最新有效事实，历史Journal事件保留供审计。anchor(id,name,kind)；teleport(from,to)。硬过夜时限须登记deadlineDay及后果，过期关闭须resolution说明实际后果或验货结果。字段直接放input内，不把addThread写作操作对象。不能改库存或战斗。失败不写档，先读取确认后再重试。',
  trpg_narrate: '将 text 叙事记入同槽位的事务事件，供恢复上下文。不要粘贴 GM 隐藏资料。返回值可能带 warnings：traveler_met_unrecorded（正文已让旅行者/派蒙出场但未登记，按实际剧情决定是否 trpg_party meet）、chapter_completion_claim（正文宣告篇/章结束，须核对主线核心危机是否真的发生并落档）。',
  trpg_recap: '读当前状态、最近事件编号与日志完整性，limit=1–100。重启后同 mode/slot 继续，没有全局活动槽位。',
  trpg_lore: '仅检索人工审核的玩家可见索引：query, spoilerMax=公开/剧情。受时间线和解锁旗标限制；拒绝隐藏/禁止和任意 file 路径。未审核内容不返回原稿。',
  trpg_rules: '读取当前数值常量、三种合法建卡方案、装备表与 24 敌人模板。',
  trpg_roll: '通用 d6 掷骰：expr（如 2d6+1）、purpose。结果写入事件；战斗攻击须用战斗工具，不能用通用骰替代并自填档位。',
  trpg_check: '剧情检定：actor/attribute/tag?/purpose/difficulty?/risk?。正式跑团默认 input.waitForPlayer=true，必须 requestId；宿主显示提交回答卡片，等待玩家选择掷骰或自填两个骰面，再按宣告时版本结算。取消/无效输入不耗检定次数，条件变化则拒绝，不由GM代填骰面。自动掷骰只用于明确约定或开发测试。返回publicSummary须用一两句展示实际骰面、修正与结果；战斗攻击仍用战斗工具，不用本工具绕过回合。',
  trpg_apply: '仅战斗外的明确 GM 裁定：actor，HP 用 damage(正数伤害)/heal(正数治疗) 或带符号的 hp（负=伤害，正=治疗），三者只能用一个，不要传绝对目标值；另有 energy?/addStatus?/removeStatus? 与 reason；解除重伤另需 treatment。返回 hpChange 与 publicSummary，正文须照 publicSummary 写出真实 HP 前后值，不得只写叙事伤势。战斗后果不能用此绕过攻击流程。',
}

export function createTools(options) {
  const runtime = new Runtime(options)
  return TOOL_NAMES.map((name) => ({
    name, description: descriptions[name],
    parameters: {
      mode: { type: 'string', enum: ['solo', 'multi'], required: true, description: '战役模式，每次明确传入。' },
      slot: { type: 'string', required: true, description: '槽位，例如 first_test，仅字母数字下划线短横线。' },
      input: { type: 'json', required: true, description: '直接传JSON对象，如 {"text":"内容"}；不要把对象再编码为带转义引号的字符串。字段见工具描述。' },
      requestId: { type: 'string', description: '每个动作唯一编号；重试必须复用，防止重复扣血/扣资源。' },
      expectedRevision: { type: 'integer', description: '可选预期版本；过期时拒绝写入，先刷新。' },
    },
    output: { schema: { type: 'json' }, render: (_a, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }] },
    execute(args, exec) {
      args = { ...args, input: normalizeToolInput(args.input) }
      if (name === 'trpg_combat_attack' && ((args.input.op !== undefined && args.input.op !== 'act') || ['enemy', 'advance', 'start'].includes(args.input.action))) return runtime.execute({ ...args, tool: name })
      const hasPlayerUI = typeof options.askPlayer === 'function'
      const sceneCheck = name === 'trpg_check' || (name === 'trpg_scene' && args.input.op === 'check')
      if (sceneCheck && (hasPlayerUI || args.input.waitForPlayer === true)) return playerCheck(runtime, args, exec, options.askPlayer, options)
      const combatAction = name === 'trpg_combat_attack' || (name === 'trpg_combat' && args.input.op === 'act')
      if (combatAction) {
        if (args.input.waitForPlayer === true) return playerCheck(runtime, args, exec, options.askPlayer, options, name)
        if (hasPlayerUI && ['attack', 'skill', 'interact', 'retreat'].includes(args.input.action ?? 'attack')) {
          const state = runtime.execute({ ...args, tool: 'trpg_state', input: { op: 'get' } }).state
          if (state.characters[args.input.actor]?.type === 'player') return playerCheck(runtime, args, exec, options.askPlayer, options, name)
        }
      }
      return runtime.execute({ ...args, tool: name })
    },
  }))
}
