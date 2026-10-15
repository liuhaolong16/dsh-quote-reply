# Changelog

## 0.9.1 — 2026-10-15
- 升级前必过门新增「H 客户端入口契约」（exports 必须同时含 . 与 ./client），门达 23 项
- 包元数据补 repository / homepage / bugs
- 新增本 CHANGELOG

## 0.9.0 — 2026-10-15
- 宿主/客户端版本握手：/health 回显 version 与 minClient，客户端回传 host 版本与 compat（缺失即 null，不谎报兼容）
- 补三笔夹具欠账：合并上报 / 同宽长期回归 / 即时确认（含两条反例）

## 0.8.4
- 跨刷新状态改为落盘，修「刷新后回合尾部引用行消失」
