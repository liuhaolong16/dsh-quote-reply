#!/usr/bin/env node
/**
 * _check-client —— 客户端半体的**真夹具**（不依赖宿主、不依赖浏览器）
 *
 * 做法：造一个假的 `window.__ModuleLoader__.load` 与极简 React 桩，把 `lib/client.js` 真跑一遍，
 * 然后：
 *   · 断言它导出了 `apply` / `inject`（宿主契约）；
 *   · 断言 `apply` 把 **两个** 槽位都注册了：`conversation.input.dock`（输入框上方的引用浮窗）
 *     与 `conversation.chat.assistant-actions`（每条助手消息的「引用回复」按钮），且 id 正确；
 *   · 断言"引用层"的行为：编号 引用一/引用二…、按来源分组的数据、删除、清空、中文数字；
 *   · **必失败面**：敌意 ctx（没有 slots / register 抛错）下 `apply` **不得抛错**（本插件曾把宿主带崩过）。
 *
 * 用法：node _check-client.cjs     （退出码 0 = 全过）
 */
const fs = require('node:fs')
const path = require('node:path')

const FILE = path.join(__dirname, 'lib', 'client.js')
const src = fs.readFileSync(FILE, 'utf8')

let loaded = null
const windowStub = { __ModuleLoader__: { load: (def) => { loaded = def } }, getSelection: () => null, setTimeout: () => 0 }
const ReactStub = {
  createElement: (type, props, ...kids) => ({ type, props, kids }),
  useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
  useEffect: () => {},
}
const requireStub = (name) => (name === 'react' ? ReactStub : {})

// 真跑模块体（语法/形状错会在这里暴露）
new Function('window', 'require', src)(windowStub, requireStub)
const bad = []
if (!loaded || typeof loaded.factory !== 'function') { console.error('✘ 没有调用 __ModuleLoader__.load（宿主加载器拿不到模块）'); process.exit(1) }
if (loaded.id !== 'dsh-quote-reply') bad.push('load 的 id 不是 dsh-quote-reply：' + loaded.id)
const mod = loaded.factory(requireStub)
if (typeof mod.apply !== 'function') bad.push('未导出 apply')
if (!Array.isArray(mod.inject) || !mod.inject.includes('slots')) bad.push('inject 未声明 slots：' + JSON.stringify(mod.inject))
if (mod.default !== undefined) bad.push('禁止 default 导出（宿主加载器纪律）')
const q = mod.__quote
if (!q || typeof q.addQuote !== 'function') bad.push('没有暴露 __quote（自检无法验证引用层）')

// ── 引用层行为 ──
if (q) {
  const sid = 's1'
  const a = q.addQuote(sid, 'm1', '第一段原文', '第一段原文')
  const b = q.addQuote(sid, 'm1', '第二段原文', '第二段原文')
  const c = q.addQuote(sid, 'm2', '另一条消息里的句子', '另一条消息')
  if (a.label !== '引用一') bad.push('第一条编号应为 引用一，实为 ' + a.label)
  if (b.label !== '引用二') bad.push('第二条编号应为 引用二，实为 ' + b.label)
  if (q.listQuotes(sid).length !== 3) bad.push('引用数应为 3')
  // 按来源分组（客户端渲染用它）：m1 应有两组里的第一组、m2 一组
  const groups = {}
  q.listQuotes(sid).forEach((it) => { groups[it.sourceId] = (groups[it.sourceId] || 0) + 1 })
  if (groups.m1 !== 2 || groups.m2 !== 1) bad.push('按来源分组计数不对：' + JSON.stringify(groups))
  // 会话隔离：另一个会话不应看到 m1/m2 的引用
  if (q.listQuotes('s2').length !== 0) bad.push('会话之间没有隔离（s2 不该看到 s1 的引用）')
  q.removeQuote(sid, b.id)
  if (q.listQuotes(sid).length !== 2) bad.push('删除后应为 2 条')
  q.clearQuotes(sid)
  if (q.listQuotes(sid).length !== 0) bad.push('清空后应为 0 条')
  if (q.cn(1) !== '一' || q.cn(10) !== '十' || q.cn(11) !== '十一' || q.cn(23) !== '二十三') bad.push('中文数字映射不对：' + [1, 10, 11, 23].map(q.cn).join('/'))
}

// ── ★ 宽度对齐「目标」那一行（新逻辑的核心，必须有正/反例）──
if (q && typeof q.matchGoalWidth === 'function') {
  const mkRow = (text, width) => ({ textContent: text, style: {}, getBoundingClientRect: () => ({ width }), contains: () => false })
  const myCard = mkRow('引用（2）', 500)
  // ① 正例：同容器里有「已暂停的目标」行、宽度可量 ⇒ 照抄它的宽度并居中
  const goalRow = mkRow('已暂停的目标 【论文插件…】', 1000)
  const parent = { children: [goalRow, myCard] }
  myCard.parentElement = parent
  q.matchGoalWidth(myCard)
  if (myCard.style.maxWidth !== '1000px') bad.push('宽度对齐失败：应照抄目标行的 1000px，实为 ' + myCard.style.maxWidth)
  if (myCard.style.marginLeft !== 'auto' || myCard.style.marginRight !== 'auto') bad.push('宽度对齐后应居中（margin auto）')
  // ② 反例：容器里没有「目标」行（只有队列）⇒ **不得**写死宽度（继续用兜底 CSS）
  const other = mkRow('队列', 500)
  const c2 = mkRow('引用（2）', 500)
  c2.parentElement = { children: [other, c2] }
  q.matchGoalWidth(c2)
  if (c2.style.maxWidth !== undefined) bad.push('没有目标行时不该写宽度，实为 ' + c2.style.maxWidth)
  // ③ 反例：目标行存在但**还没 layout**（宽度 0）⇒ 不得写 0（否则卡片会塌成一条线）
  const c3 = mkRow('引用（2）', 500)
  c3.parentElement = { children: [mkRow('受阻的目标', 0), c3] }
  q.matchGoalWidth(c3)
  if (c3.style.maxWidth !== undefined) bad.push('目标行宽度为 0（未 layout）时不该写宽度，实为 ' + c3.style.maxWidth)
  // ④ 四种阶段文案都要能认出来（认不出就等于永远量不到）
  for (const t of ['进行中的目标', '未运行的目标', '已暂停的目标', '受阻的目标']) {
    if (!q.isGoalRow(mkRow(t, 800))) bad.push('识别不了目标行文案：' + t)
  }
  if (q.isGoalRow(mkRow('队列 3 条', 800))) bad.push('把「队列」误认成目标行')
  // ⑤ ★ 回归：**不得锁死第一次量到的宽度**（这是用户报的 bug：首次量到布局中途的窄值，之后再不改）
  const my2 = mkRow('引用（1）', 500)
  let goalW = 500
  const goal2 = { textContent: '已暂停的目标', style: {}, getBoundingClientRect: () => ({ width: goalW }), contains: () => false }
  my2.parentElement = { children: [goal2, my2] }
  q.matchGoalWidth(my2)
  if (my2.style.maxWidth !== '500px') bad.push('第一轮应写 500px，实为 ' + my2.style.maxWidth)
  goalW = 1000
  q.matchGoalWidth(my2)
  if (my2.style.maxWidth !== '1000px') bad.push('★ 宽度被锁死了：第二轮应更新为 1000px，实为 ' + my2.style.maxWidth)
  if (my2.style.width !== '100%') bad.push('卡片必须写 width:100%（否则在居中容器里会按内容收缩、比目标框窄）')
  if (typeof q.followGoalWidth !== 'function') bad.push('缺少 followGoalWidth（持续跟随）')
  else { try { q.followGoalWidth(my2) } catch (e) { bad.push('followGoalWidth 抛错（没有 ResizeObserver/rAF 的环境下也要安全）：' + e.message) } }
}
// ── 样式：每条一行 + 右侧收放箭头 ──
if (q && q.CSS) {
  for (const [needle, why] of [['width:100%', '卡片撑满宽度'], ['white-space:nowrap', '每条引用只占一行'], ['qr-text.qr-open', '展开后恢复换行'], ['qr-more', '右侧收放箭头有独立样式'], ['qr-tail', '回合尾部的「引用（N）」行样式'], ['qr-tail-body', '尾部行可展开']]) {
    if (!q.CSS.includes(needle)) bad.push('样式缺「' + why + '」（' + needle + '）')
  }
}
// ── ★ 第二部分：引用被"回合"认领（只有最新回合能认领；认领后待发区自动清空）──
if (q && typeof q.claimTurnQuotes === 'function') {
  const s = 'claim-s1'
  q.addQuote(s, 'm1', '甲', '甲')
  q.addQuote(s, 'm1', '乙', '乙')
  if (q.listQuotes(s).length !== 2) bad.push('认领前待发应为 2 条')
  // ① 最新回合（seq=5）认领 ⇒ 拿到 2 条，且待发区清空
  const got = q.claimTurnQuotes(s, 5, '5')
  if (!got || got.length !== 2) bad.push('最新回合应认领到 2 条，实为 ' + (got ? got.length : got))
  if (q.listQuotes(s).length !== 0) bad.push('认领后待发区应清空（等于自动清空），实为 ' + q.listQuotes(s).length)
  // ② 同回合再次认领 ⇒ 回放同一批（跨重渲染稳定），不得返回 null
  const again = q.claimTurnQuotes(s, 5, '5')
  if (!again || again.length !== 2) bad.push('同一回合重复认领应回放 2 条，实为 ' + (again ? again.length : again))
  if (!q.sentForTurn(s, '5') || q.sentForTurn(s, '5').length !== 2) bad.push('sentForTurn 应按回合取到 2 条')
  // ③ 反例：更早的回合（seq=3 < max 5）**不得**抢走待发引用
  q.addQuote(s, 'm2', '丙', '丙')
  const stolen = q.claimTurnQuotes(s, 3, '3')
  if (stolen !== null) bad.push('较早回合不该认领到引用（会抢走待发引用），实为 ' + JSON.stringify(stolen))
  if (q.listQuotes(s).length !== 1) bad.push('较早回合认领失败后待发仍应为 1 条，实为 ' + q.listQuotes(s).length)
  // ④ 新回合（seq=6 > max）可以认领
  const n6 = q.claimTurnQuotes(s, 6, '6')
  if (!n6 || n6.length !== 1) bad.push('新回合应认领到 1 条，实为 ' + (n6 ? n6.length : n6))
  // ⑤ turnKeyOf 要能从 owner props 里取到键（TurnLocation 字段名不确定 ⇒ 三种都要认）
  if (q.turnKeyOf({ turn: { turn: 7 } }) !== '7') bad.push('turnKeyOf 认不出 turn.turn')
  if (q.turnKeyOf({ turn: { id: 'x' } }) !== 'x') bad.push('turnKeyOf 认不出 turn.id')
  if (q.turnKeyOf({ seq: 9 }) !== '9') bad.push('turnKeyOf 认不出 props.seq')
}
// ── 注册落点 ──
// ★ mock 的 register 必须**返回注册对象本身**（真实 API 返回的是可释放的 effect）——
//   否则断言要写 tray.reg.reg.id 这种"按错层读"，夹具会冤枉好代码（本夹具第一版就栽在这）。
const regs = []
const mockCtx = { slots: { inject: (key, cb) => { regs.push({ key, reg: cb() }); return () => {} }, register: (reg, comp) => Object.assign({}, reg, { __comp: comp }) } }
const dispose = mod.apply(mockCtx)
if (typeof dispose !== 'function') bad.push('apply 应返回 dispose 函数')
const keys = regs.map((r) => r.key).sort().join(',')
if (keys !== 'conversation.chat.assistant-actions,conversation.chat.turnTail,conversation.input.dock') bad.push('注册的槽位不对（应为 dock + assistant-actions + turnTail）：' + keys)
const tray = regs.find((r) => r.key === 'conversation.input.dock')
const act = regs.find((r) => r.key === 'conversation.chat.assistant-actions')
const tail = regs.find((r) => r.key === 'conversation.chat.turnTail')
if (!tail || !tail.reg || tail.reg.id !== 'quote-refs') bad.push('回合尾部「引用」行未注册到 conversation.chat.turnTail（id 应为 quote-refs）')
if (!tray || !tray.reg || tray.reg.id !== 'quote-tray') bad.push('引用浮窗未注册到 conversation.input.dock（id 应为 quote-tray）')
if (!tray || !tray.reg || tray.reg.order !== 30) bad.push('浮窗 order 应为 30（排在 goal(10)/queue(20) 之后）')
if (!act || !act.reg || act.reg.id !== 'quote-reply') bad.push('「引用回复」动作未注册（id 应为 quote-reply）')
if (typeof (tray && tray.reg && tray.reg.label) === 'function' && tray.reg.label() !== '引用') bad.push('浮窗 label 应为「引用」')

// ── 必失败面：敌意 ctx 不得抛 ──
for (const ctx of [undefined, {}, { slots: null }, { slots: { inject: () => { throw new Error('boom') }, register: () => {} } }, { slots: { inject: (k, cb) => { cb(); throw new Error('boom2') } } }]) {
  let threw = null
  try { mod.apply(ctx) } catch (e) { threw = String((e && e.message) || e) }
  if (threw) bad.push('敌意 ctx 下 apply 抛错了（会把宿主带崩）：' + threw)
}

// ── ★ v0.7 回归夹具：**刷新页面后「引用（N）」必须仍在**（用户 2026-10-15 报的真 bug）──
// 起因：认领记录 SENT 只存在内存 ⇒ 一刷新，所有回合的「引用（N）」全消失，用户据此判定"第二部分没做"。
// 做法：在同一份 localStorage 桩上**加载两次模块** —— 第二次等价于刷新页面（新模块实例 + 同一存储）。
function loadWithEnv(makeWin) {
  let def = null
  const win = makeWin((d) => { def = d })
  new Function('window', 'require', src)(win, requireStub)
  return def && def.factory(requireStub)
}
const sharedStore = {}
const winShared = (setDef) => ({
  __ModuleLoader__: { load: setDef }, getSelection: () => null, setTimeout: () => 0,
  localStorage: {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(sharedStore, k) ? sharedStore[k] : null),
    setItem: (k, v) => { sharedStore[k] = String(v) },
    removeItem: (k) => { delete sharedStore[k] },
  },
})
const winEmpty = (setDef) => ({
  __ModuleLoader__: { load: setDef }, getSelection: () => null, setTimeout: () => 0,
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
})
const A2 = loadWithEnv(winShared)
A2.__quote.addQuote('sR', 'm1', '刷新前引用过的那句话', '刷新前引用过的那句话')
const claimedA2 = A2.__quote.claimTurnQuotes('sR', 7, '7')
if (!claimedA2 || claimedA2.length !== 1) bad.push('v0.7：首次认领应拿到 1 条，实为 ' + (claimedA2 && claimedA2.length))
if (!Object.keys(sharedStore).length) bad.push('v0.7：认领后没有落盘（localStorage 为空 ⇒ 刷新必丢）')
const B2 = loadWithEnv(winShared)                         // 同一存储 ⇒ 等价于刷新页面
const restored = B2.__quote.sentForTurn('sR', '7')
if (!restored || !restored.length) bad.push('v0.7 回归失败：刷新后该回合的「引用（N）」丢了（第二部分会消失）')
else if (String(restored[0].text).indexOf('刷新前引用过') < 0) bad.push('v0.7：刷新后恢复的内容不对：' + String(restored[0].text).slice(0, 24))
// 反向断言：全新浏览器（空存储）不得凭空造出这一行
const C2 = loadWithEnv(winEmpty)
if (C2.__quote.sentForTurn('sR', '7')) bad.push('v0.7 反向断言失败：空存储下不该恢复出任何「引用（N）」')
// 无 localStorage 的环境（老宿主 / 桩环境）必须安全降级，不得抛
const noLs = loadWithEnv((setDef) => ({ __ModuleLoader__: { load: setDef }, getSelection: () => null, setTimeout: () => 0 }))
if (!noLs || typeof noLs.apply !== 'function') bad.push('v0.7：没有 localStorage 时模块不可用（应安全降级）')

// ── ★ v0.8 回归：**发送后立刻清空悬浮框**，但回合尾部的「引用（N）」仍必须能显示 ──
{
  const G = loadWithEnv(winEmpty)
  G.__quote.addQuote('s8', 'm1', '发送后应当从悬浮框消失的这句', '发送后应当从悬浮框消失的这句')
  const before = G.__quote.listQuotes('s8').length
  const moved = G.__quote.markSent('s8', 'test')
  const after = G.__quote.listQuotes('s8').length
  if (before !== 1) bad.push('v0.8：前置条件不成立（应有 1 条待发引用，实为 ' + before + '）')
  if (!moved) bad.push('v0.8：markSent 应报告确实搬走了一批，实为 ' + moved)
  if (after !== 0) bad.push('v0.8 回归失败：发送后悬浮框仍非空（listQuotes=' + after + '，用户要的正是它清空）')
  const claimed8 = G.__quote.claimTurnQuotes('s8', 11, '11')
  if (!claimed8 || claimed8.length !== 1) bad.push('v0.8 回归失败：清空悬浮框后，回合尾部认领不到引用（第二部分会消失）')
  else if (String(claimed8[0].text).indexOf('发送后应当从悬浮框消失') < 0) bad.push('v0.8：认领到的内容不对')
  // 反向断言：同一批只许被认领一次 —— 另一个回合不得再捡走（防重复计权）
  const again = G.__quote.claimTurnQuotes('s8', 12, '12')
  if (again) bad.push('v0.8 反向断言失败：已认领过的内容被另一个回合重复认领了')
}

// ── ★ v0.8.4 回归（用户实测 bug）：清空悬浮框后**刷新页面**，回合尾部那行也不能丢 ──
{
  const store84 = {}
  const winStore = (setDef) => ({
    __ModuleLoader__: { load: setDef }, getSelection: () => null, setTimeout: () => 0,
    localStorage: {
      getItem: (k) => (Object.prototype.hasOwnProperty.call(store84, k) ? store84[k] : null),
      setItem: (k, v) => { store84[k] = String(v) },
      removeItem: (k) => { delete store84[k] },
    },
  })
  const D = loadWithEnv(winStore)
  D.__quote.addQuote('s84', 'm1', '发送后被清空、但刷新后尾部仍应显示的这句', 'x')
  D.__quote.markSent('s84', 'test')                       // ＝发送后立刻清空悬浮框
  if (D.__quote.listQuotes('s84').length !== 0) bad.push('v0.8.4：markSent 后悬浮框应为空')
  const E = loadWithEnv(winStore)                         // 同一存储 ⇒ 等价于刷新页面
  const c84 = E.__quote.claimTurnQuotes('s84', 21, '21')
  if (!c84 || !c84.length) bad.push('v0.8.4 回归失败：清空悬浮框后刷新 ⇒ 回合尾部认领不到引用（那行会消失）')
  else if (String(c84[0].text).indexOf('发送后被清空') < 0) bad.push('v0.8.4：认领到的内容不对')
  // 反向断言：没"发送"过的引用不该被别的回合凭空认领走
  const F = loadWithEnv(winStore)
  if (F.__quote.claimTurnQuotes('s84', 22, '22')) bad.push('v0.8.4 反向断言失败：同一批被重复认领')
}

// ── ★ v0.7.2 回归（欠账补齐）：两类自证报告必须**合并**（尾部报告不得被托盘报告覆盖）──
{
  const sentBodies = []
  const origFetch = globalThis.fetch
  // ★ 注意：模块里调的是**裸 `fetch`**（浏览器里＝window.fetch），所以桩必须打在 globalThis 上；
  //   打在 window 桩上会被 Node 22 的全局 fetch 抢走（这正是第一次写这条夹具时踩的坑）。
  globalThis.fetch = (u, o) => {
    try { sentBodies.push(JSON.parse(o && o.body)) } catch (e) { sentBodies.push(null) }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
  }
  try {
    const winFetch = (setDef) => ({
      __ModuleLoader__: { load: setDef }, getSelection: () => null, setTimeout: () => 0,
      localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    })
    const M = loadWithEnv(winFetch)
    M.__quote.reportSelfCheck({ tray: { matched: true, box: 669, max: '669.333px', w: 669 } })
    M.__quote.reportSelfCheck({ tail: { rendered: true, claimed: 1, seq: 3 } })
    const last = sentBodies[sentBodies.length - 1]
    if (!last) bad.push('v0.7.2：没有发出任何自证上报')
    else {
      if (!last.tail || last.tail.rendered !== true) bad.push('v0.7.2：尾部报告没发出去')
      if (!last.tray || last.tray.box !== 669) bad.push('v0.7.2 回归失败：尾部报告把托盘报告覆盖了（后到的一份必须仍带另一份的最新值）')
      if (!last.host || !('version' in last.host) || !('compat' in last.host)) bad.push('v0.9.0：自证上报缺 host 握手字段（version/compat）')
    }
  } finally { globalThis.fetch = origFetch }
}

// ── ★ v0.9.0「同宽」长期回归：卡片抄的必须是**目标框可见盒子**的宽度（生产实测 669 == 669）──
if (q && typeof q.matchGoalWidth === 'function') {
  const mkR = (text, width) => ({ textContent: text, style: {}, getBoundingClientRect: () => ({ width }), contains: () => false })
  const goalW = 669.333
  const goal = mkR('进行中的目标 【论文插件…】', goalW)
  const card = mkR('引用（1）', 400)
  card.parentElement = { children: [goal, card] }
  q.matchGoalWidth(card)
  const wrote = parseFloat(String(card.style.maxWidth))
  if (!(Math.abs(wrote - goalW) <= 1)) bad.push('★ 同宽回归失败：卡片宽度应≈目标框 ' + goalW + '，实为 ' + card.style.maxWidth + '（变宽多半是抄了外层容器）')
  if (card.style.width !== '100%') bad.push('★ 同宽回归：必须同时写 width:100%（居中容器里靠它撑满）')
}

// ── 汇报（含异步夹具：宿主版本握手 / 即时确认）──
;(async () => {
  // ★ v0.9.0：即时确认**只在宿主说"已被取走"时才搬走**（不许凭本地状态猜）
  {
    const origFetch = globalThis.fetch
    const mkWin = () => (setDef) => ({
      __ModuleLoader__: { load: setDef }, getSelection: () => null, setTimeout: () => 0,
      localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    })
    const withHost = async (payload, fn) => {
      globalThis.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve(payload) })
      try { return await fn() } finally { globalThis.fetch = origFetch }
    }
    // 正例：宿主说该会话已被取走 ⇒ 立刻搬走（悬浮框空、尾部仍可认领）
    const A9 = loadWithEnv(mkWin())
    A9.__quote.addQuote('s9', 'm1', '被宿主取走后应立刻从悬浮框消失的这句', 'x')
    await withHost({ version: '0.9.0', minClient: '0.8.0', consumed: { s9: 1 } },
      () => new Promise((r) => A9.__quote.checkConsumedNow('s9', r)))
    if (A9.__quote.listQuotes('s9').length !== 0) bad.push('v0.9.0：宿主已取走却没立刻清空悬浮框')
    const back = A9.__quote.claimTurnQuotes('s9', 31, '31')
    if (!back || !back.length) bad.push('v0.9.0：即时清空后尾部认领不到（会丢第二部分）')
    if (A9.__quote.HOST_INFO.version !== '0.9.0' || A9.__quote.HOST_INFO.compat !== true) bad.push('v0.9.0 握手：HOST_INFO 未按 /health 更新（' + JSON.stringify(A9.__quote.HOST_INFO) + '）')
    // 反例 1：宿主**没说**取走 ⇒ 一条都不许动（防"凭本地状态猜着清空"）
    const B9 = loadWithEnv(mkWin())
    B9.__quote.addQuote('s9', 'm1', '宿主没说取走时不许动', 'x')
    await withHost({ version: '0.9.0', minClient: '0.8.0', consumed: {} },
      () => new Promise((r) => B9.__quote.checkConsumedNow('s9', r)))
    if (B9.__quote.listQuotes('s9').length !== 1) bad.push('v0.9.0 反向断言失败：宿主没说取走，悬浮框却被清空了')
    // 反例 2（兼容判定）：宿主声明「最低客户端 1.0.0」而我是 0.9.0 ⇒ compat 必须是 false（不谎报兼容）
    const C9 = loadWithEnv(mkWin())
    await withHost({ version: '1.0.0', minClient: '1.0.0', consumed: {} },
      () => new Promise((r) => C9.__quote.checkConsumedNow('s9', r)))
    if (C9.__quote.HOST_INFO.compat !== false) bad.push('v0.9.0 握手：宿主 minClient=1.0.0 > 本客户端时应 compat=false，实为 ' + C9.__quote.HOST_INFO.compat)
    // 反例 3（旧宿主）：没有 version/minClient ⇒ compat 必须是 null（未知，不谎报为真）
    const D9 = loadWithEnv(mkWin())
    await withHost({ ok: true, pending: 0, consumed: {} },
      () => new Promise((r) => D9.__quote.checkConsumedNow('s9', r)))
    if (D9.__quote.HOST_INFO.compat !== null) bad.push('v0.9.0 握手：旧宿主无 minClient 时应 compat=null（未知），实为 ' + D9.__quote.HOST_INFO.compat)
  }

  if (bad.length) { console.error('✘ 客户端半体自检失败：\n - ' + bad.join('\n - ')); process.exit(1) }
  console.log('✔ 客户端半体自检通过：' + [
    '导出形状（apply/inject/无 default）',
    '三个槽位注册（输入框上方浮窗 quote-tray@30 + 助手消息动作 quote-reply + 回合尾部引用行 quote-refs）',
    '第二部分：引用被回合认领（只许最新回合认领 · 同回合回放 · 认领后待发自动清空 · turnKey 三种字段都认）',
    '引用层行为（编号 引用一/二 · 按来源分组 · 会话隔离 · 删/清空 · 中文数字）',
    '宽度对齐目标行（撑满 width:100% · 照抄实测宽度并居中 · **不锁死旧值**（回归）· 无目标行不写死 · 未 layout 不写 0 · 四种阶段文案可识别）',
    '每条一行 + 右侧收放（nowrap/省略号 · 展开恢复换行 · 箭头有独立样式）',
    '敌意 ctx 不抛（5 种残缺上下文）',
    '★ v0.7 刷新后「引用（N）」仍在（正例 + 空存储反例 + 无 localStorage 安全降级）',
    '★ v0.7.2 两类自证报告合并（尾部报告不得覆盖托盘报告）· 含 host 握手字段',
    '★ v0.8 发送后悬浮框立刻清空，且尾部行仍能认领（含反向：同一批不得被重复认领）',
    '★ v0.8.4 清空悬浮框后**刷新页面**，尾部那行仍在（隐形待认领区已落盘）',
    '★ v0.9.0「同宽」长期回归（卡片宽度 ≈ 目标框宽度 + width:100%）',
    '★ v0.9.0 即时确认（宿主说取走才搬走 · 两条反例 · 旧宿主 compat=null 不谎报）',
  ].join(' · '))
})()
