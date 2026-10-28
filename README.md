# genshin_trpg · v0.02 发布版

在 DeepSeek Harness（DSH）中进行原神同人跑团：玩家用自然语言描述行动，AI 扮演 GM，规则引擎负责检定、战斗、物品和存档。默认采用“原作主线进程＋章节内部沙盒”，支持单人及本地多人角色结算。

**本次发布更新：2026-10-28。** 插件名统一为 `genshin_trpg`，包版本为 `0.0.2`，产品标识为 `genshin_trpg_v0.02`。

- [下载完整 v0.02 发布包](https://github.com/neko461/genshin_trpg/raw/refs/heads/main/releases/genshin_trpg_v0.02.zip)
- [版本说明](docs/guides/release-notes-v0.02.md) · [改动记录](docs/changelog/change-log-v0.02.md) · [文档总索引](docs/README.md)

## v0.02 新增与完善

### 角色资料按需读取

- 8 个地区、192 条角色资料改为 JSON，正文统一放在 `text` 字段。
- `trpg_char search` 按名称或别名搜索，`profile` 读取单个角色；不再需要把整份地区人物资料加入对话。
- JSON 为维护正本，构建时生成运行资料和 MD 兼容镜像；后台人物资料与玩家可见知识检索分开，保留阶段和剧透边界。

### 主持、主线与人物互动

- 默认分层开场，提供核心主持契约、当前地区章节和按阶段补读计划；可切换完整资料模式。
- 主线要求玩家亲历调查、冲突和危机解决，减少无关琐事与重复交接，同时保留调查深度和自然对话。
- 完善 GM 主动定稿、两项优势与一项局限标签、可选跨界角色能力压制、公开裁定与玩家行动边界。
- 拆分地区势力、人物和钩子，增加人物自然出场机会；旅行者可以实际协作，未同行也不从主线世界中消失。
- 普通 NPC 支援可按实际关系提供；临时同伴及高阶角色介入仍明确区分目标设计与已实现数值能力。

### 检定、战斗与成长

- 2d6 公开检定，玩家在 DSH 中提交骰面或确认掷骰，展示骰子动画、实际修正与公开结算。
- 支持负面标签，装备品质与特效解锁明确；成长需有实际来源并落入角色卡。
- 独行普通遭遇收紧为 2 点预算/2 个单位，旅行者实际参战时为 3 点/3 个单位；可单独挑战一名首领，不附带其他独立敌人。
- 修正敌方元素反应、伤害与撤退代价等结算；统一降低生之花、生命冠及相关两件套生命加值，减少说明与实际计算不一致。

### 保存、回溯与一致性

- DSH 界面支持主动保存、进度说明和读取为新分支；保留来源存档与后续历史。
- 加强事实纠正、任务线程分类、跨日场景检查、换站前未决事项处理和幂等结算。
- 旅行者的结识、入队和在场状态分别记录，缺席者不参与战斗、受击或现场恢复。

### 上下文与运行性能

- 常规工具返回本次结算、当前信息和精确状态变化，避免反复发送旧叙事及整份战斗历史；完整读档保留恢复数据。
- 规则按建卡、检定、战斗、装备和恢复主题查询，主持资料按阶段加载。
- 有界 Journal 缓存复用已校验数据，保留外部改写检查、事务锁和版本检查。
- 提供本地字符量对照和 DSH 实际模型用量统计；统计不保存聊天正文、工具参数或密钥。

临时夹具中，分层开场从 58,155 降至约 9,400 字符，长团一次叙事结算从 19,149 降至 2,204 字符。后续细则查询也会占用上下文，**字符降幅不等同于 token 或费用降幅**。

## 安装与开始

需要 Node.js 22+ 和可用的 DSH 宿主。本次已上传源码及完整项目 ZIP；**尚未发布 `genshin_trpg` 的 npm 注册表包**，请使用本地源码链接安装。

1. 下载并解压发布包，或克隆仓库：

   ```text
   git clone https://github.com/neko461/genshin_trpg.git
   cd genshin_trpg
   cd code/dsh-trpg
   npm install
   cd ../..
   dsh plugin --profile web add link:./code/dsh-trpg
   ```

2. 运行根目录 `launch-trpg.cmd`，按启动器打开的有效地址进入 DSH。默认使用 3081 端口；同一套 DSH 会话目录只运行一个宿主，不要用换端口绕过会话写锁。
3. 在 DSH 中选择你实际解压或克隆的工作区，新建聊天，要求 GM 先调用 `trpg_char opening`，明确 `mode=solo` 和独立 `slot`，通过对话建卡。正式游戏不调用固定 `demo`。
4. 已有存档先 `trpg_save load`，不要重建或覆盖原槽位。读取回溯点应保留原档并建立新分支。

DSH Desktop 可按宿主的本地插件安装方式链接 `code/dsh-trpg`。从旧 `dsh-trpg` 名称迁移时，参见[改名与挂载说明](docs/guides/plugin-name-migration.md)。源码目录名暂保留，避免旧启动路径失效；公开插件名称已统一。

## 验证与当前边界

- 当前自动回归 **204 项通过**；19 项工具注册、`dsh:check`、`doctor` 和发布清单校验详见版本说明。
- 模型主持质量、压缩后恢复、分层资料调用及真实 token 节省仍需持续实机验收；自动测试通过不代表所有剧情与长期平衡均已验收。
- 已有多人角色结算，不等于已经实现互联网房间。服务器、MySQL 和公共联机平台目前是[可选联机方案](docs/design/multiplayer-room-platform-plan.md)，**本地单人无需云服务器或云数据库**。
- `launch-first-test.cmd` 与 17891 页面是固定开发验证台，不是实时 AI 主持入口。

## 开发与资料入口

在 `code/dsh-trpg` 中运行：

```text
npm test
npm run dsh:check
npm run doctor
npm run characters:build
npm run context:bench
npm run usage:report
```

- [主持手册](docs/gm/gm-handbook.md)、[主线规则](docs/rules/mainline-rules.md)、[数值定稿](docs/rules/finalized-stat-rules-v1.0.md)
- [角色 JSON 与查询](docs/design/character-json-lookup.md)、[模型上下文与恢复协议](docs/design/model-context-and-guidance-protocol.md)
- [玩家检定与动画](docs/guides/player-dice-and-animation-guide.md)、[同伴与高阶角色介入](docs/rules/companion-and-high-tier-combat-intervention.md)
- [第二轮验收清单](docs/tests/round-two-acceptance-checklist.md)、[历史修改记录](docs/changelog/change-log-v0.01.md)

实际存档位于 `save/slots`。用户资料、模型凭据、服务器连接清单、操作记忆与备份均保存在本机，排除在发布包与新的 Git 提交之外；开发者的本地记忆规则不会成为普通玩家的安装要求。
