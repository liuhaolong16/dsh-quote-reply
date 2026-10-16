---
name: dsh-quote-reply
description: "DSH「引用」层：把一段话引用成输入框上方的可编辑引用行，随下一回合作为模型上下文送达（不进用户消息正文）。当需要让模型看到某段原文、某条消息或某个文件片段作为上下文，又不想把它混进自己的提问正文时用它。含「动过宿主半体必须先过预检」的硬门。"
version: 0.9.0
---

# dsh-quote-reply · 「引用」层（v0.9.0）

把「引用一段话」做成**独立一层**：输入框上方出现可编辑的引用行 → 引用经宿主的上下文通道随**下一个回合**送达模型，**不写进用户消息正文**。

- **本文件放两处、内容一致**（避免第二份说法）：
  - 插件仓根：`github.com/liuhaolong16/dsh-quote-reply`（**本仓根目录就是插件体**，代码在 `lib/`）
  - 本机技能树：`E:\DeepSeek\skills\quote-reply\SKILL.md`（插件体在其下的 `bundle\`）
- **交付形态**：DSH 插件（`dsh plugin add github:liuhaolong16/dsh-quote-reply`），MIT、npm-less

## 硬规矩：动过宿主半体 ⇒ 先过预检，再谈重启

```bat
:: 在插件仓根（= 本机技能树的 bundle\ 目录）里执行
node _preflight.cjs
:: 本机技能树等价写法： node E:\DeepSeek\skills\quote-reply\bundle\_preflight.cjs
:: 退出码 0 = 可以安全重启；非 0 = 先修，别重启
```

**为什么必须是硬门**（本机实测）：宿主半体**只在 DSH 启动时加载**——启用/禁用、卸载重装、改 inject 全部无效。若它引用了不存在的 API，或与别的插件撞路由、撞上下文名，**重启就是白重启一次**，严重时会打断宿主 boot。客户端半体则有官方热重载通路，改完刷新即可（一键入口见技能 `hot-refresh`）。

## 三个入口槽位（引用从哪来）

1. 输入框上方的「引用」行（与目标 / 队列同区）
2. 助手消息上的动作
3. 回合尾部引用行

**认领语义**：最新回合认领该引用后，待发区自动清空；引用走 `systemPrompt.context`，**不进用户消息正文**（这是它与「把原文粘进输入框」的本质区别）。

## 自检

```bat
node _check-client.cjs      :: 客户端夹具（含敌意 ctx / 版本握手 / 幂等）
node _preflight.cjs         :: 22 项 · 21 PASS / 0 FAIL（含客户端夹具）
```

负控（证明判据有区分力，两条）：写坏 `package.json`、客户端版本不一致 —— 都会让预检变红。
本仓已配 CI：`.github/workflows/preflight.yml`（推上去即跑）。

## 边界（**不**做什么）

- 不替用户改写引用内容；**不**把引用塞进用户消息正文；**不**绕过宿主的上下文通道。
- 本技能不联网、不碰凭证。

## 相关

- 设计细节、逆向来源与「改它之前先读」的技术要点：`README.md`（本机：`E:\DeepSeek\skills\quote-reply\bundle\README.md`）
- 变更记录：`CHANGELOG.md` · 许可：`LICENSE`（MIT）
- 对应的热刷新入口：技能 `hot-refresh`（`github.com/liuhaolong16/dsh-hot-refresh`）
