# genshen_TRPG_v0.01

原神同人跑团首测版。显示版本 v0.01，包版本 0.0.1。固定试玩页面与 DSH AI GM 插件共用持久化运行时。

## 首轮试玩

在工作区根目录双击“启动首轮测试.cmd”；也可以在插件目录运行 npm start。只需 Node.js 22+，本地试玩无需 npm install 或模型密钥。默认地址 http://127.0.0.1:17891。

先读根目录《第一轮测试指南.md》。页面提供蒙德“遗失的货箱”固定短场景、建卡、剧情检定、真实战斗、物品、强化、恢复、读档与反馈导出。它没有连接模型，台词为预设文本。

## 验证

- npm test：使用 scripts/test.mjs 收集测试，兼容 Windows，不依赖 shell 通配符。
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

页面仅覆盖固定单人短场景。多人、关系、支援、共鸣和高级物品通过统一工具调用；无完整表单。NPC 支援只开放首测白名单。专长仅记录描述；敌方元素攻击只附着，不执行其完整反应链。lore 使用审核子集，不扫描隐藏原稿。完整自由叙事需要模型宿主，真实 DSH 集成待你所在环境验收。

环境变量：TRPG_ROOT 覆盖工作区根，TRPG_PORT 覆盖本地端口。版本说明和第一轮测试指南位于工作区根目录。

## 本地链接插件的 DSH 依赖检查

使用 link: 挂载前，在本插件目录执行 npm install --ignore-scripts，再执行 npm run dsh:check。ESM 从链接的真实源码目录解析依赖；仅把插件加入 profile 不会为源码目录安装 peerDependencies。当前实际宿主版本为 0.1.5-rc.2，排障时使用同版本的 @deepseek-ai/dsh-tools。该检查使用真实 defineTool 注册全部 19 个工具，并验证只读调用，不创建战役。

输出的 value schema 不能包含 required；required 仅用于参数声明。纯运行时测试通过不能替代此宿主接口检查。
