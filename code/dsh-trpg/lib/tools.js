import { Runtime, TOOL_NAMES, normalizeToolInput } from '../engine/runtime.js'
import { playerCheck } from './player-check.js'

const descriptions = {
  trpg_save: 'v0.01 战役：new 新建（拒绝覆盖）、demo 固定试玩初始包、load/status/export 读取、list 列槽位、verify 校验事件回放。每次明确 mode 和 slot。',
  trpg_char: '新团先opening读取正式开场与建卡引导，同时读取gmInstructions和gmMainline；旧团更新规范只读取不重开。create 用 id/name/scheme/background/motivation/weapon/tags；tags 最多3个，推荐 [{name:"家境贫寒",modifier:-1,note:"缺乏财力时不利"}]，modifier=-1/0/+1；旧字符串标签默认+1，不能把负面标签擅自变为优势。setTags(id,tags,reason,playerConfirmed:true) 在场景外修正已建玩家标签，完整记录前后值，不删角色、不重建pc，不获得成长位。grow 的 tag 同样支持{name,modifier,note}，须唯一source。powerType=vision须选element；mundane无元素；custom须ability:{source,effect,limits,cost}，待审核不得行动。approvePower(id,playerConfirmed:true,mechanic:narrative,reason)只批准叙事/既有检定。get/list查询。',
  trpg_scene: '持久化剧情场景：open(goal,location,safe)，check(actor,attribute,tag?,helpers[]?,purpose)，close(summary)。至多三次检定，关闭时实际短休回能，空场景无恢复。',
  trpg_combat: '持久化战斗：roster 查名录；start(enemies:[{name或template,id?}],phases?)；act(actor,action,target?)；enemy 执行当前敌人；advance 在全员行动后推进。禁止传入 HP、伤害、档位和轮次。',
  trpg_combat_attack: '当前角色的一次攻击或元素技；actor/target 为存档 id，action=attack/skill/interact/defend/assist/retreat/heal/switch/guard/transfer。玩家attack/skill/interact/retreat默认应传waitForPlayer:true及唯一requestId，等待玩家提交两个骰面；取消不耗行动。命中、装备、伤害与扣资源由引擎完成。',
  trpg_combat_advance: '完成本轮后推进持久化战斗；不接收 round/phases/enemiesAlive。不允许跳过尚未行动的单位。',
  trpg_item: '物品：list；use(actor,item,target?)；buy(type,id?)；grant(items[],sourceId,reason)；reward(sourceId,reason,kind?)；gather(id,name,sourceId)。奖励幂等、实际扣库存。',
  trpg_gear: '装备：catalog；equip(actor,item) 从真实库存穿戴；upgrade(actor,slot,material) 实际消耗材料与补给，刷新派生数值。',
  trpg_recover: '安全恢复：level=喘息/扎营/休整/神像；休整须 reason，神像须已激活 anchor。战斗中拒绝；短休仅由关场结算。',
  trpg_party: '队伍：support(actor,npc,name,reason)，assist(actor) 本战一次，unlock(element,reason) 按阶段共鸣；元素切换用战斗 switch 动作。',
  trpg_relation: '四阶关系：get(actor,npc)；raise/betray/repair(actor,npc,sourceId,reason)。每事件至多升一阶，背叛暂停协作。',
  trpg_state: '世界状态：input必须用op指定操作，例如 {"op":"addThread","id":"lost_sister","text":"待调查的失踪线索"}。get读取；set(location?,safe?,flagKey?,flagValue?,reason)；addThread(id,text)/closeThread(id)/addFact(text)；anchor(id,name,kind)；teleport(from,to)；nextStation(reason)。字段直接放input内，不把addThread写作操作对象。不能改库存或战斗。失败不写档，先读取确认后再重试。',
  trpg_narrate: '将 text 叙事记入同槽位的事务事件，供恢复上下文。不要粘贴 GM 隐藏资料。',
  trpg_recap: '读当前状态、最近事件编号与日志完整性，limit=1–100。重启后同 mode/slot 继续，没有全局活动槽位。',
  trpg_lore: '仅检索人工审核的玩家可见索引：query, spoilerMax=公开/剧情。受时间线和解锁旗标限制；拒绝隐藏/禁止和任意 file 路径。未审核内容不返回原稿。',
  trpg_rules: '读取当前数值常量、三种合法建卡方案、装备表与 24 敌人模板。',
  trpg_roll: '通用 d6 掷骰：expr（如 2d6+1）、purpose。结果写入事件；战斗攻击须用战斗工具，不能用通用骰替代并自填档位。',
  trpg_check: '剧情检定：actor/attribute/tag?/purpose/difficulty?/risk?。正式跑团默认 input.waitForPlayer=true，必须 requestId；宿主显示提交回答卡片，等待玩家选择掷骰或自填两个骰面，再按宣告时版本结算。取消/无效输入不耗检定次数，条件变化则拒绝，不由GM代填骰面。自动掷骰只用于明确约定或开发测试。战斗攻击仍用战斗工具，不用本工具绕过回合。',
  trpg_apply: '仅战斗外的明确 GM 裁定：actor,hp?/energy?/addStatus?/removeStatus?,reason；解除重伤另需 treatment。战斗后果不能用此绕过攻击流程。',
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
      if (name === 'trpg_check' && args.input?.waitForPlayer === true) return playerCheck(runtime, args, exec, options.askPlayer, options)
      if ((name === 'trpg_combat_attack' || (name === 'trpg_combat' && args.input?.op === 'act')) && args.input?.waitForPlayer === true) return playerCheck(runtime, args, exec, options.askPlayer, options, name)
      return runtime.execute({ ...args, tool: name })
    },
  }))
}
