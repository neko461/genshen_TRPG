# 插件与仓库改名记录

2026-10-28最终名称统一为genshin_trpg。用户最初请求修正genshen拼写，后短暂考虑TRPG大写；最后已将GitHub仓库改为全小写，API核验实际名称为neko461/genshin_trpg。

| 项目 | 当前名称 |
|---|---|
| GitHub | https://github.com/neko461/genshin_trpg |
| origin | git@github.com:neko461/genshin_trpg.git |
| npm包名 | genshin_trpg |
| DSH后端、前端与挂载声明 | genshin_trpg |
| 产品标识 | genshin_trpg_v0.02 |
| 包版本 | 0.0.2，本轮没有发布 |
| 本机源码目录 | code/dsh-trpg，保留真实路径兼容现有链接 |
| 本机工作区 | E:/genshen_TRPG/v0.01，保留真实路径，不因显示名更改失效 |

活动源码、提示词、章节标题映射、页面导出标识、发布脚本、安装说明与版本测试均同步。旧存档和历史日志、旧版发布快照不改写。前端读取新槽位记忆时仍兼容旧dsh-trpg-slot-*键，保存点/聊天回溯接口路径保持原值。

本机已有DSH Web profile已通过正式CLI安装新genshin_trpg本地链接并移除旧dsh-trpg依赖，没有下载新软件或升级其他插件。源码路径未搬迁，存档仍在原save目录。正在运行的宿主需要退出后再打开才能验收新的挂载名；没有强制关闭DSH或修改任何对话。

其他机器迁移时，先在完整工作区根目录执行：

```text
dsh plugin --profile web add genshin_trpg@link:./code/dsh-trpg --offline
dsh plugin --profile web remove dsh-trpg
```

仅在已存在旧依赖时remove；Desktop profile应依照DSH要求先完全退出再修改，不在运行中强改。新机器仍需先安装代码依赖；npm名genshin_trpg待本项目正式发布后才使用仓库包安装命令。本次没有执行npm publish。

远端改名最初因电脑工具不能可靠识别浏览器地址而暂停，由用户在GitHub完成。GitHub API已核验最终仓库名；HTTPS Git访问曾因连接超时失败，随后用本机已有SSH认证执行ls-remote成功，远端HEAD为8d7b5da808eacf0a895f6892f9cd2bb4febb5b18。未新建仓库、删除仓库或推送本地其他改动。

验证：204项自动测试全部通过；19工具检查通过；版本测试覆盖npm名、DSH后端/前端/patch一致性与旧槽位读取兼容。更名前备份memory/backups/2026-10-28-plugin-rename-before。
