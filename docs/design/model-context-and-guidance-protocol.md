# 模型上下文、资料加载与存档缓存协议

状态：2026-10-28已实现，DSH实机叙事与实际用量对照待验收。

## 1. 工具原值与模型正文

Runtime、HTTP接口和Journal继续提供完整公开状态。DSH原始工具value保留完整状态；其output.render给常规模型上下文提供较短JSON。这里约束的是工具资料长度，玩家看到的剧情仍遵守原来的叙事篇幅要求。

常规成功写操作返回：

- 原动作结果：check、damage、hp、publicSummary、warnings、实际消耗等保持原意；不由摘要重算骰点或伤害。
- delta：对上一次公开状态的精确变化。
- current：当前地区、地点、日期、补给、角色伤势/能量、队伍在场状态、场景和战斗行动信息。
- view=trpg-model-v1、stateComplete=false：明确这是部分当前视图。
- recovery：基线缺失、压缩后不确定或版本不连续时先完整load。

旧notes、battle.history、重复的roundEvents不再整批重复进入current；本次新增或更改的内容仍完整进入delta。角色属性、标签、能力批准、装备、库存、关系、世界事实、线程、场景检定与资源变化同样由delta保留；没有按字数截断重要事实。

new初始状态、load/status/export、state get和recap仍给完整状态。重试返回replayed时也发送最新完整状态，同时保留原动作的结算和originalRevision。取消、无效输入和失败操作不伪造增量。

顶层参数view=full可要求完整原值，例如：

```json
{"mode":"solo","slot":"my_game","view":"full","input":{"op":"load"}}
```

view不进入动作指纹，不会因切换展示形式而重复扣费或改骰。完整原值与render视图属于同一次工具结果。DSH骰子界面继续解析顶层check、damage、hp，不依赖旧历史数组来生成本次骰卡。

当前默认原生工具调用受益；若宿主使用PTC把原始value交给外层代码，代码仍能获取完整状态，最终进入模型的内容还取决于宿主如何选取外层结果。不能把两份表示的物理大小直接相加当作模型token。

## 2. 精确状态增量

engine/state-delta.js定义trpg-state-delta-v1：

```json
{
  "format":"trpg-state-delta-v1",
  "baseRevision":8,
  "revision":9,
  "operations":[
    {"op":"set","path":["revision"],"value":9},
    {"op":"set","path":["characters","pc","state","hp"],"value":110},
    {"op":"splice","path":["notes"],"index":0,"deleteCount":1,"items":[]},
    {"op":"splice","path":["notes"],"index":29,"deleteCount":0,"items":["新增的公开叙事。"]}
  ]
}
```

path是对象键数组；set赋值、remove删除字段、splice更改数组。只有before.revision等于baseRevision才能应用；应用后必须得到目标revision。JSON中不存在的undefined不是协议字段。最近30条notes的滑动窗口以删除旧项、追加新项表示，不重发余下29条。完整战斗历史仍能由连续增量重建。

增量从publicState生成，不包含内部settings、sources或事件输入。它不写回Journal；持久化格式、校验链和完整after快照保持原结构。恢复与幂等结算始终以Journal为事实源。

## 3. 主持资料分层

DSH插件的opening默认profile=staged，返回：

- prompt/gm-core.md：开场/建卡、玩家自主权、客观裁定、世界因果、剧情纵深、自然语言、公开骰点、资源与恢复契约。
- gmMainline：当前地区的章节行；蒙德附带完整关键进程和不依赖旅行者入队的路径，不携带后续国家表格。
- creation：现有建卡引导。
- guidancePlan：进入哪些环节前补读哪个主题、规则查询范围和恢复方法。已经读过且仍在上下文中的相同规则可沿用。

直接调用Runtime的opening默认仍为full，保留原接口兼容性；DSH用户可显式profile=full。两份完整原文依然在包内，主线规则与工作区权威正本继续逐字一致。

trpg_char guidance的主题：

| topic | 内容/时机 |
|---|---|
| core | 短核心契约，压缩后恢复基本主持方式 |
| mainline | 完整战役方向、节奏、调查纵深、任务自由度和成长要求 |
| chapter | 当前地区；有存档时默认按timeline，未建档须传station |
| mondstadt | 保留原来的蒙德关键进程短入口 |
| creation | 零基础与主动定稿细则 |
| writing | 保留原关键对话自检入口 |
| writing-full | 完整文本质量细则 |
| geography | 地图与空间连续性 |
| difficulty | 检定、难度和对抗边界 |
| companions | 同行关系与人物温度 |
| continuity | 时间、事实和交接一致性 |
| catalog | 固定章节ID和主题目录；用sectionId补读完整章节 |
| legacy | 仅adventure_01的既有特例，不自动传播到新档 |

data/guidance-manifest.json固定章节ID、源文件和标题。所有源字符均属于分区，测试逐字重组两份原文，防止删段。新增、改名或调整顶层标题时需同步manifest；不能静默错配章节。主题查询剔除其他槽位特例，不读取别的真实槽位。

trpg_rules已拆至engine/rule-reference.js，仅构造选中的建卡/检定/战斗/装备/恢复主题，省略scope仍兼容原完整内容。

## 4. Runtime缓存生命周期

每个Runtime持有LRU Journal池，默认最多8个实例，已校验原日志字节合计最多16MiB；执行结束时淘汰超限实例。这里的字节预算计原日志缓存，不等于精确JavaScript堆内存上限。实例大小为0可禁用，clearJournalCache可主动释放。

复用实例仍在每次操作检查目录不能是符号链接/联接；文件签名包括大小、mtime、ctime、inode和设备号。文件未变才复用解析结果；追加时逐字节核对既有前缀再校验新尾部；同长改写、截断、替换会触发重新检查。坏行、坏校验或被改写的旧前缀仍拒绝读写。

缓存没有替代跨进程事务锁、expectedRevision和请求幂等。子进程竞争提交测试保证只有一次成立。只读资料查询不会创建存档。缓存主要减少本地IO与反复解析，不计作模型token节省。

## 5. 实际模型用量与对照

插件按本地SDK公开的agent/assistant-stream事件读取usage数字。会话调用过跑团工具后，其后续usage可记录到save/telemetry/dsh-usage.jsonl；重载前、首次工具调用之前、未提供usage或未触发可用事件的请求不在统计内。

记录仅有时间、哈希会话标识、inputTokens/outputTokens/cacheReadTokens/cacheWriteTokens/totalTokens。inputTokens按本地SDK定义为未缓存输入，缓存读写单列；未报告的可选字段为null，不能解释成0。相同请求帧去重，日志2MiB轮转并保留上一份；写入失败不阻断游戏。TRPG_USAGE_LOG=0可关闭。

在插件目录运行npm run usage:report查看当前日志汇总。calls表示记录到usage的次数，不保证涵盖所有请求。npm run context:bench可在自动清理的临时夹具上比较工具字符量，它不请求模型、也不冒充实际token计费。当前没有真人会话的前后对照，仍须重载宿主后在同一情境验收叙事质量、默认骰子动画和实际token。
