# 角色JSON资料与按需读取

角色数据正本为character_setting/characters/<region>.json。8个地区共192条人物（包含普通NPC）；保留原资料，不在迁移时补写设定或声称原作考据已验证。世界顶层存在shijie.md不属于本次地区NPC迁移。

每份地区JSON包含region、station与entries。角色条目使用kind=character、稳定id、name、aliases、level和text；正文（身份、性格、说话方式、关系和隐藏提示）完整位于text。kind=context条目保留地区导语、分组和限制正文，避免迁移丢文。更新时编辑JSON，保持旧id稳定，新人物新增id。

示意结构：

```json
{
  "kind": "character",
  "id": "mengde-001",
  "name": "琴·古恩希尔德",
  "aliases": ["琴·古恩希尔德", "琴"],
  "level": "公开",
  "text": "角色名：琴·古恩希尔德\n【公开身份】……\n【说话风格】……"
}
```

在插件目录运行npm run characters:build：从JSON生成data/characters发布副本、无正文的index.json，以及原路径MD兼容镜像。原MD不再独立编辑；JSON是权威来源。首次迁移允许从MD无损初始化，已有JSON时构建绝不反向覆盖JSON。此构建命令用于完整开发工作区；安装后的插件直接使用包内data资料。

调用既有trpg_char工具：

```json
{"mode":"solo","slot":"my_game","input":{"op":"search","query":"迪奥娜"}}
```

search返回候选元数据，不返回人物正文。profile可按名称一步读取，也可用search返回的id消歧：

```json
{"mode":"solo","slot":"my_game","input":{"op":"profile","query":"迪奥娜"}}
```

返回audience=GM及character.text。profile按需读取匹配地区文件，只返回一个角色；无法消歧时只给候选，不拼接同名人物。支持region筛选、search limit=1–10。未找到不会编造正文。不接受任意file/path。

默认阶段来自当前存档timeline.index，未建档为蒙德阶段；GM备团可显式station=1–9，不会改存档或解锁世界旗标。禁止级条目不返回正文；隐藏级是GM后台资料，不自动成为玩家知识。原文包含后期状态时必须按本档实际事件判断，不能把阶段可查询误当作内部每句话已经发生。角色出现、入队、关系及战斗数值仍须按原工具和事实登记。

本接口与trpg_lore玩家知识索引分开；没有把未经审核的人物原稿注入公开lore。主持提示词与guidancePlan要求人物将要登场/交谈前按需检索；当前上下文已有同一资料可沿用，换角色或压缩遗失后重新读取。它属于GM执行约束，仍需DSH重载后实测模型是否遵守，不宣称每轮代码会自动识别所有人物。

验证：204项测试和19工具检查通过；逐字比较JSON重组正文与MD镜像，发布数据与源一致；覆盖别名、单角色text、禁止条目、阶段、任意路径拒绝、只读不写档及lore隔离。未改真实存档，未发布。
