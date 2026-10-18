# genshen_TRPG_v0.02

原神同人跑团版本 v0.02，包版本 0.0.2。固定试玩页面与 DSH AI GM 插件共用持久化运行时。

## 首轮试玩

在工作区根目录双击“启动首轮测试.cmd”；也可以在插件目录运行 npm start。只需 Node.js 22+，本地试玩无需 npm install 或模型密钥。默认地址 http://127.0.0.1:17891。

先读工作区 docs/测试/第一轮测试指南.md。页面提供蒙德“遗失的货箱”固定短场景、建卡、剧情检定、真实战斗、物品、强化、恢复、读档与反馈导出。页面的“主动保存”会记录完整回溯点；“读取回溯点”将其复制为新的测试档分支，保留来源档及其后续记录。它没有连接模型，台词为预设文本。

## 验证

独立主线路径：正式new档默认未结识旅行者，可直接经骑士团、居民和现场证据参与风龙调查。trpg_party status读取met/joined/present；traveler操作依次按实际事件meet、join（玩家同意后playerConfirmed:true）、leave、return、dismiss。未入队或不在场的旅行者不参与协助、战斗、受击、物品或现场恢复。demo预设同行；旧档有旅行者且无明确不见面标记时兼容同行，不自动重写历史。独行遭遇仅HP采用0.6修正，杂兵HP至少20、劲敌至少30，单体至少12且不折扣，首领65/18/20，详见工作区 docs/规则/数值定稿v1.0.md；长期实机平衡仍待验收。

- npm test：使用 scripts/test.mjs 收集测试，兼容 Windows，不依赖 shell 通配符。
- 当前逐文件运行共 168 项通过：dice 14 + enemies 7 + engine 31 + items 4 + mainline 3 + participation 6 + player-check 12 + runtime 35 + server 3 + tags-runtime 5 + consistency 14 + known-fixes 12 + apply-hp 7 + thread-gate 15。
- test/consistency.test.js 覆盖：长日志复用已校验前缀与前缀被改写时的强制重验、场景跨日漂移提示（含旧档只读推导）、敌方元素攻击的反应与附着消耗、叙事已写旅行者出场但未登记时的提示、有未收束事项时禁止换站、篇章结束宣告时核对主线核心危机。
- test/apply-hp.test.js 覆盖：`trpg_apply` 的 damage/heal/带符号 hp 语义、混用与绝对目标值误用的拒绝、超出缺口治疗被拒、伤害跨实例保留与等价写法重放。
- npm run doctor：检查环境、三种建卡方案、事务建档、判定、关场与回放。
- 所有测试使用独立临时目录，启动服务本身不会创建战役。

## DSH 适配

lib/index.js 从宿主导入 @deepseek-ai/dsh-tools，注册 lib/tools.js 的 19 个工具。保留 cordis 挂载声明；需要在实际 DSH 环境验收，当前已安装 DSH 0.1.5-rc.2。使用系统提示词 prompt/gm-system.md。

每次工具调用必须传 mode、slot、input，建议带唯一 requestId；写操作可带 expectedRevision 防止旧页面覆盖新状态。不同会话不共享全局活动槽位。

例：trpg_save 的参数对象为 {"mode":"solo","slot":"first_test","input":{"op":"demo"},"requestId":"first-create"}。

战斗动作传 actor/target id 与 action，不能再传目标 HP、武器数值、档位或轮次。trpg_combat 的 start/act/enemy/advance 均更新同一个持久化状态；trpg_combat_attack 和 trpg_combat_advance 为相同流程的便捷入口。trpg_damage 的旧手工伤害旁路已移除。

高级调用可以使用 bin/trpg.mjs --request request.json（UTF-8 JSON 请求文件），与页面和插件相同接口。工具操作字段见 lib/tools.js 描述和根目录指南。

## 存储

save/slots/<solo或multi>/<slot>/journal.jsonl 为事实源，state.json 为可重建投影。每笔事件保存骰面、参数、结果、完整 after 状态与校验链；采用排他事务锁、来源去重、请求幂等与版本校验。日志损坏停止读写，不静默跳行。已有槽位拒绝覆盖，旧原型档不自动迁移。

手动回溯点保存在 save/checkpoints/<mode>/<slot>/，包含该时刻的状态与已校验事件前缀。读取回溯点会新建指定槽位，复制事件前缀并写入分支标记事件；不会截断原槽位日志。若目标槽位已存在或回溯点校验失败，操作会拒绝。

DSH 会话顶部提供“主动保存”和“读取存档”按钮。它们使用既有的单人/多人存档槽，不另建“战役存档”体系。保存面板记录进度名称、说明、当前 DSH 会话 ID 与最后一条已落盘消息序号；读取面板展示存档进度后，要求玩家勾选确认，再复制为新游戏槽位并保留来源档，同时通过 DSH 会话 API 从保存位置创建并自动打开聊天分支。新建的保存点可同时恢复游戏与聊天上下文；此前没有聊天位置元数据的旧保存点仍只恢复游戏状态。若 DSH 创建聊天分支失败，界面会明确显示游戏分支已成功、聊天分支失败，不会回滚或覆盖原档。若接口提示找不到存档路由，请重载插件并刷新页面。对话中的 `trpg_save` checkpoint/checkpoints/branch 仍可用于游戏状态回溯，但这些工具调用本身不附加 DSH 消息位置。

## 目录

- engine/runtime.js：统一操作路由；campaign.js：基础状态与判定。
- engine/battle.js：动作、敌人回合、元素反应、机制与状态周期。
- engine/inventory.js、stats.js：真实库存、装备强化、派生值与旅行者。
- engine/journal.js：事务日志；store.js 仅重导出新入口。
- engine/lore.js、data/lore.json：人工审核的玩家资料子集，未知内容默认不返回。
- lib/tools.js：无宿主依赖的工具描述与调用；lib/index.js：DSH 薄适配。
- server/、web/：仅本机的首测入口，无第三方运行依赖。
- test/：纯函数、运行时和真实 HTTP 回归；scripts/：自检与测试。

## 当前限制

页面仅覆盖固定单人短场景。多人、关系、支援、共鸣和高级物品通过统一工具调用；无完整表单。NPC 一次性支援面向所有已在剧情中出现、并与玩家达到信任/羁绊的角色，每场景一名、战斗中一次 +1；当前不支持 NPC 独立回合、HP/重伤或高阶角色剧情技能，规则设计见 docs/规则/同伴与高阶角色战斗介入机制.md。专长仅记录描述。敌方元素攻击与玩家侧使用同一条元素反应链（反应、消耗附着、冻结/减伤/持续伤害/结晶护盾），未命中不触发也不消耗附着。lore 使用审核子集，不扫描隐藏原稿。完整自由叙事需要模型宿主，真实 DSH 集成待你所在环境验收。

`trpg_recap` 与 `trpg_save load` 会返回 `warnings`：场景开局日与当前战役日不一致时给出 `scene_day_drift`，提示按事实关场并重述当前日目标。旧档缺 `scene.openDay` 时从日志中该场景的 open 事件只读推导，不写回存档。`sceneOpenDay` 同步返回推导结果（无法确证时为 null）。

`trpg_narrate` 在本段叙事提到旅行者或派蒙、而 `party.traveler.met` 仍为 false 时返回 `traveler_met_unrecorded`，提示按实际剧情决定是否调用 `trpg_party` 登记；只是听说、远处看到或转述则保持未结识。两种提示都只报告状态矛盾，不擅自改档。

世界事实更正使用 `trpg_state {op:"facts"}` 只读查询当前有效事实及编号，再调用 `correctFact` 替换、`retractFact` 撤回单条，或 `retractFacts` 原子撤回多条。每次写入都须附带查询结果的顶层 `expectedRevision` 与原样 `expectedText`；状态过期或任何批次条目不匹配时整笔拒绝。操作只更新最新存档的有效事实列表，历史 Journal 仍保留原始事件和更正事件供审计，旧快照不会被静默改写。

## 线索分类与换站

线索分 `kind=主线/支线`（`addThread` 省略默认支线，并记 `originStation`）。换站前先调 `trpg_state {op:"threads"}`（只读，不写档）取得 `threadList` / `blocking` / `undecided` / `deferred` 与可直接转述的 `summary`，把清单和后果交给玩家决定：

- 主线只能实际完成（`closeThread outcome:"resolved"`）；未收束即阻止换站，不可放弃或延期绕过。
- 支线三选一：完成 `resolved`、放弃 `abandoned`（须写清说明与后续影响）、延期 `deferThread`（随行保留并继续出现在后续清单）。
- 旧档无线程 `kind` 时只读推断并标注"旧档推断"，用 `classifyThread` 确认；不回写存档、不自动关闭既有线索。

`nextStation` 在主线未收束或支线未处置时拒绝，并提示先展示清单。

新团默认采用“原作主线进程＋章节内部沙盒”，从蒙德按章推进。玩家可自由输入章节内行动，不受按钮菜单限制。若玩家明确要求从其他地区开局或跨越多章，GM须先说明会跳过的地区章节与危机仍未解决，确认玩家要保持主线向体验还是改为自由游历；不得忽视其要求直接写成蒙德开场。确认具体起点后，`trpg_save {op:"new",startStation:"挪德卡莱"}` 可用于新档，`startLocation` 可补充地点；已创建但尚未开始场景或写入剧情进展的新档，可由玩家确认后调用 `trpg_state {op:"startAtStation",station:"挪德卡莱",reason:"玩家明确选择挪德卡莱开局",playerConfirmed:true}` 一次性调整。更早章节只记为未经历，不得标为完成；进入场景后不可用此操作改写战役进程。此功能负责记录明确选择的起点，不代表默认支持大世界随机漫游。

环境变量：TRPG_ROOT 覆盖工作区根，TRPG_PORT 覆盖本地端口。版本说明在docs/使用，测试指南在docs/测试；完整索引见工作区docs/README.md。

## 本地链接插件的 DSH 依赖检查

使用 link: 挂载前，在本插件目录执行 npm install --ignore-scripts，再执行 npm run dsh:check。ESM 从链接的真实源码目录解析依赖；仅把插件加入 profile 不会为源码目录安装 peerDependencies。当前实际宿主版本为 0.1.5-rc.2，排障时使用同版本的 @deepseek-ai/dsh-tools。该检查使用真实 defineTool 注册全部 19 个工具，并验证只读调用，不创建战役。

输出的 value schema 不能包含 required；required 仅用于参数声明。纯运行时测试通过不能替代此宿主接口检查。

## 实测缺口修复（2026-10-17）

trpg_item transfer将物品转交给队外叙事NPC，按quantity扣共享库存，记录recipient/reason/sourceId；同requestId幂等，同sourceId不能再次扣除，不治疗。publicSummary由真实结算字段生成，GM须简短写入正文。新战斗需预先声明retreatCost，低档成功才实际支付补给/物品或记录具体位置损失。addThread可登记deadlineDay/deadlineConsequence；逾期提示，closeThread须resolution。时限并不自动识别自然语言，位置后果仍须GM落实。
