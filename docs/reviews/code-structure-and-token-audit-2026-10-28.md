# Code structure and token audit — 2026-10-28

## 当前结论

报告中的四项后续优先项已完成代码层面的优化：模型结算视图、分层主持资料、Runtime存档缓存与分主题规则模块，以及实际模型usage采集。完整201项自动测试、19工具注册检查通过。尚未进行真人DSH会话的叙事与实际token前后对照，因此字符减少不能作为账单降幅。

实现协议与维护说明见[模型上下文、资料加载与缓存协议](../design/model-context-and-guidance-protocol.md)。本轮没有改真实存档、事件格式、发布快照或游戏数值，也未发布新版。

## 第一轮已完成的基础优化

- 工具render由缩进JSON改为紧凑JSON；保留完整字段与骰卡结构。
- trpg_rules支持creation/checks/combat/equipment/recovery，默认all兼容旧调用。
- 修复生命两件套仍加30的漏改，统一ARTIFACT_HP_BONUS=10；恢复被误禁的独行单首领，并共享ENCOUNTER_LIMITS。相关说明和测试同步。

第一轮临时夹具：全量规则6,729→4,082字符，新档load 5,513→2,946字符；35条较长叙事后的narrate 21,851→19,145字符。长团重复内容仍多，是本轮继续优化的原因。

## 后续优先项的实施结果

### 1. 模型结算视图与完整状态：已实现

Runtime继续返回完整公开状态，DSH的原始value和持久化Journal仍提供原数据。常规模型正文通过output.render接收本次结算、current与精确delta。保留check、damage、hp、公开后果、警告和实际消耗，不重新解释骰点。

current不再携带旧notes、整份battle.history与重复roundEvents。属性、标签、能力批准、装备、库存、关系、世界事实、线程及历史变化以可重建的增量保留，没有截断重要事实。叙事窗口滚动按删除旧项、追加新项表示，不重发其余29条。每条增量具有baseRevision和revision；缺基线或压缩后不确定先完整load。

new、load/status/export、state get、recap仍返回完整状态；幂等重放发送最新完整状态并保留原结算。顶层view=full可读取完整原值。失败和取消不写伪造增量。协议只从publicState生成，不带内部settings、sources和事件输入。增量为返回阶段生成，不写进Journal，不改变旧档格式。

实现：engine/state-delta.js、lib/model-output.js、engine/runtime.js与lib/tools.js。若宿主采用PTC，代码仍可取得完整原值，模型看到的外层结果取决于宿主处理方式；本轮测量默认工具render正文。

### 2. 主持资料按阶段加载：已实现

DSH opening默认profile=staged：短核心契约、当前地区章节、原建卡引导及guidancePlan。直接调用Runtime的默认完整开场保持兼容，显式profile=full可取得两份完整原文。

新核心保留玩家自主权、客观裁定与内容暂停、GM主动定稿、优势/局限标签、跨界力量压制、世界因果、旅行者净化、调查纵深、自然语言与原有叙事篇幅、公开骰点、资源和读档契约。地区章节只返回当前站点，蒙德附完整关键进程和独立参与路径。没有为省工具字符缩短玩家正文。

guidance增加core、creation、chapter、writing-full、geography、difficulty、companions、catalog与固定sectionId；原writing、mondstadt、continuity入口兼容。mainline已补全战役方向、节奏、调查纵深、任务自由度和成长，不再只截首个三级标题段。旧槽位特例只对adventure_01读取。

data/guidance-manifest.json固定ID、来源与标题，测试可逐字重组两份原文，未删段；源标题变化须同步映射。完整主线提示词与工作区正本继续逐字一致。资料按触发环节读取，已在上下文且未变化可沿用，不每回合重复读取。

### 3. Runtime分层与缓存生命周期：已实现本轮范围

资料加载拆至engine/guidance.js；数值查询拆至engine/rule-reference.js，后者只构造选中主题。命令结算保持一个Runtime/Journal入口，不分裂权威状态。

每个Runtime复用LRU Journal池：默认8实例、已校验原日志总字节16MiB，超限淘汰，支持禁用/清理。此字节预算不等于精确JS堆上限。反复load不再每次新建Journal导致全读全文。

复用时仍检查目录联接/符号链接，文件签名包含size、mtime、ctime、inode及设备；未变才复用，追加时核对前缀字节再校验尾部。同长改写且恢复mtime仍会重新校验；外部追加能被原Runtime立即看到；合法截断可重读，校验损坏仍拒绝。跨进程事务锁、expectedRevision和请求去重继续有效。

针对性测试中，同一Runtime三次load的全文readFileSync由旧路径3次变为1次。此收益属于本地IO/解析，不能当作token节省。写操作的前缀字节核对仍会读取旧日志，以保留完整性防线。

### 4. 实际模型用量测量：采集能力已实现，真实对照待验收

依据本地DSH SDK的agent/assistant-stream与TokenUsage类型，记录调用过跑团工具的会话后续usage数字。只记时间、哈希会话标识和输入/输出/缓存计数，不记消息、工具参数或完整流。重复帧去重，2MiB轮转，写失败不阻断游戏，可用TRPG_USAGE_LOG=0关闭。

日志位于save/telemetry/dsh-usage.jsonl，npm run usage:report可读汇总。inputTokens为未缓存输入，cacheReadTokens/cacheWriteTokens单列；未提供的字段为null。calls只计收到usage的请求，不涵盖启用前、首次工具调用前和未报告usage的请求。宿主未提供事件时不估算，也不声称用量为0。

当前真实统计文件尚无记录。采集和宿主事件注册已由合成usage夹具验证；真实token、缓存命中与叙事质量仍须在DSH重载后的同一场景对照。

## 第二轮可复现实测

执行插件目录的npm run context:bench。仅使用自动清理的临时demo夹具，不读写真实槽位，不请求模型。前后均为紧凑JSON字符数，第二轮基线不含新增delta字段。站点、槽位名称与输出元数据可能使字符量略变。

| 场景 | 原完整紧凑输出 | 新模型正文 | 减少 |
|---|---:|---:|---:|
| 蒙德开场 | 58,155 | 9,436 | 83.8% |
| 新档完整load | 2,950 | 2,950 | 0%（恢复信息完整） |
| 35条较长叙事后的narrate | 19,149 | 2,204 | 88.5% |
| 同夹具战斗3次调用合计 | 63,330 | 11,784 | 81.4% |
| 最后一次战斗调用 | 21,626 | 4,191 | 80.6% |

开场数字只表示首次加载，并非整段战役总用量；后续查询细则也会占上下文。战斗样例含较长既有叙事，短档的下降比例可能较小。所有百分比均非实际token或费用降幅。

## 验证与剩余工作

- 完整自动测试201/201通过，包含HTTP、玩家等待/取消、恢复、幂等、线程、既有战斗与装备回归。
- 19工具注册与writing只读指引检查通过。
- 新增15项：精确变化重建/叙事窗口/战斗骰卡/完整恢复/私密边界、资料覆盖与地区隔离、Runtime缓存与外部改写、跨进程竞争、usage数字及插件事件接入。
- npm打包预检用于确认新增模块/资料进入发布清单，本机存档与统计不能进入包；未执行发布。
- 实机待验收：新开场是否遵守guidancePlan、长对话压缩后能否正确load、骰子动画默认显示、自然叙事和调查深度、真实usage前后对照。
- Journal仍记录完整after和公开结果快照，磁盘历史体积未做迁移；本轮针对模型上下文和运行实例缓存，后续可单独评估持久化压缩。
- 第一轮备份：memory/backups/2026-10-28-token-optimization-before；第二轮备份：memory/backups/2026-10-28-priority-optimization-before。
