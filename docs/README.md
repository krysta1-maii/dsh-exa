# dsh-exa 文档

当前版本：0.4.1。目标运行时：DeepSeek Harness 0.2.1-x 与 0.2.2-x（已执行验收基线 0.2.1-rc.5；0.2.2-alpha.3 仅完成声明与静态核对），Web profile。

0.4.1 把 DSH 兼容范围扩展到整个 0.2.2 线，只改清单、测试与文档，未改运行时源码，也未同步本地安装目录；0.2.2 运行时验收尚未执行。

0.4.0 的重启后验收已完成。Host 行、Plugins 卡片、三个目标 preset 的工具呈现、非目标 preset 的排除、子代理继承、Host 开关与卸载顺序均符合设计预期；未出现 broken preset、重复路由或模块解析错误。真实 Exa Search/Contents 调用未执行，以避免消耗额度。详细记录见 [verification.md](./verification.md)。

## 文档地图

| 文档 | 内容 | 状态 |
| --- | --- | --- |
| [README.md](../README.md) | 安装、preset 配置、工具可见性、卸载、回滚和开发说明 | 面向使用者的当前说明 |
| [verification.md](./verification.md) | 0.4.1 兼容声明与 0.4.0 验收记录，附 0.3.1 历史 | 当前版本的权威记录 |
| [preset-separation-upgrade-plan.md](./preset-separation-upgrade-plan.md) | 0.3.1 → 0.4.0 的 Host/Preset 分离目标、决策、施工与回滚 | 已实施并完成验收 |
| [implementation-plan.md](./implementation-plan.md) | 初版施工计划 | 历史文档，保留原始目标与依据 |

## 阅读顺序

先读 README 了解安装步骤和当前行为。需要在多个 preset 之间控制工具可见性时，直接看 README 的 “Preset visibility” 一节和三个目标 preset 的配置示例。需要核对 0.4.1 的兼容声明时，读 verification.md 的 0.4.1 节；需要核对 0.4.0 的验收范围、限制和回滚条件时，读同一文件的 0.4.0 节。需要理解单包双入口、bundle 为什么不自动写 preset、round-robin 为什么按 preset revision 计数时，读 preset-separation-upgrade-plan.md。implementation-plan.md 只用于追溯初版目标，不作为现状说明。

## 维护约定

行为或安装方式变化时，先更新 README。验收范围或结果变化时，更新 verification.md。架构决策变化时，更新 preset-separation-upgrade-plan.md，或者新开文档并在本页登记。历史计划不回写成现状文档，只在顶部补充状态说明和指向当前记录的链接。真实 Exa 调用是否执行、是否消耗额度，始终在 verification.md 中单独标注。

整理日期：2026-11-03。
