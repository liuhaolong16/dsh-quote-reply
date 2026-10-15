// dsh-quote-reply —— 客户端半体 v0.3：引用独立成层 + **与官方卡片同一套视觉**（主题 token + 独立样式表）
//
// v0.2 的教训：手搓内联样式 ⇒ 又丑又和「目标」那行不一致。v0.3 两条改法：
//   ① **用官方主题 token**（`--dsw-radius-*` / `--dsw-alias-*`）：这些名字不是猜的 —— 是从出厂 CSS 里读到的
//      （例：目标指令气泡用 `var(--dsw-radius-xl)` / `var(--dsw-specific-bubble)` / `var(--dsw-alias-label-primary)`；
//        出厂列表行用 `var(--dsw-radius-md)` / `var(--dsw-alias-interactive-bg-hover)`）。用同一套 token ⇒
//      配色/圆角/描边跟着主题走，深浅色都不跑偏。
//   ② **注入一张样式表**而不是内联 style：这样才有 `:hover` / `:focus-visible` 这些"看起来是官方控件"的状态，
//      也才谈得上"和上面那个目标框一样大"（单行头 30px、12px 字号、radius-md、.5px 描边 —— 与官方 dock 同规格）。
//
// 形态（用户要求）：引用不占输入框；悬浮在输入框上方（`conversation.input.dock`，与 目标(10)/队列(20) 同区）；
//   逐条编号 引用一/二/…；按来源消息分组；可删可清；折叠展开。
window.__ModuleLoader__.load({
  id: 'dsh-quote-reply',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

    var React = require('react');
    var h = React.createElement;

    var ACTION_ID = 'quote-reply';
    var ACTION_ORDER = 30;
    var TRAY_ID = 'quote-tray';
    var TRAY_ORDER = 30;
    var TAIL_ID = 'quote-refs';       // 回合尾部那行「引用（N）」
    var TAIL_ORDER = 30;
    var CSS_ID = 'dsh-quote-reply/styles';
    var MAX_QUOTE = 1200;
    var VERSION = '0.9.0';            // v0.9.0：宿主版本握手（自报 host 版本 + 兼容判定）+ checkConsumedNow 提为模块级（可夹具）
    var lastReportKey = '';
    // ★ v0.7.2：托盘报告与尾部报告**合并保留** —— 否则后写的一份会把另一份覆盖（实测踩到：tail 位丢了）
    var lastTrayReport = null;
    var lastTailReport = null;
    var lastProbeReport = null;   // ★ v0.8.1：渲染器给的 input 契约（键名 + 类型/长度，不含草稿正文）
    var PHASE_HIST = [];          // ★ v0.8.2：input.phase 的**取值序列**（状态枚举，非用户内容；有界去重）

    var inject = ['slots'];

    var CSS = [
      // ★ 宽度：**不猜数值**。首选运行时**实测「目标」那一行的宽度**并照抄（见 QuoteTray 里的 matchGoalWidth）；
      //   这里只是"没有目标行时"的兜底 —— 用出厂 CSS 里同款公式（用户消息行与目标气泡都用它）并居中：
      '.qr-card{box-sizing:border-box;border:.5px solid var(--dsw-alias-border-l2,rgba(127,127,127,.35));',
      'border-radius:var(--dsw-radius-md,8px);background:var(--dsw-alias-bg-layer-2,transparent);',
      // ★ 宽度：**必须 width:100% 撑满**，否则在居中容器里会按内容收缩（上一版就栽在这：只给了 max-width ⇒
      //   显示出来比目标框窄）。再叠加运行时**实测目标行宽度**（matchGoalWidth + ResizeObserver 持续跟随）。
      'width:100%;max-width:min(calc(var(--dsh-chat-content-width,748px) * .702), 82%);margin:0 auto 6px;',
      'color:var(--dsw-alias-label-primary,inherit);font-size:12px;line-height:18px;overflow:hidden}',
      '.qr-head{display:flex;align-items:center;gap:6px;min-height:30px;padding:0 8px 0 10px;user-select:none}',
      '.qr-chev{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;flex:none;',
      'color:var(--dsw-alias-label-tertiary,inherit);cursor:pointer;border:0;background:transparent;padding:0;font-size:10px}',
      '.qr-title{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500}',
      '.qr-count{color:var(--dsw-alias-label-tertiary,inherit);flex:none}',
      '.qr-acts{display:flex;align-items:center;gap:4px;flex:none}',
      '.qr-btn{border:.5px solid transparent;border-radius:var(--dsw-radius-sm,6px);background:transparent;',
      'color:var(--dsw-alias-label-secondary,inherit);cursor:pointer;font-size:11px;line-height:16px;padding:2px 7px;white-space:nowrap}',
      '.qr-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12));color:var(--dsw-alias-label-primary,inherit)}',
      '.qr-btn:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-alias-state-business-primary,rgba(64,128,255,.6));outline-offset:-2px}',
      '.qr-icon{width:22px;height:22px;padding:0;display:inline-flex;align-items:center;justify-content:center}',
      '.qr-body{border-top:.5px solid var(--dsw-alias-border-l3,rgba(127,127,127,.25));padding:4px 8px 6px}',
      '.qr-src{color:var(--dsw-alias-label-tertiary,inherit);font-size:11px;line-height:16px;padding:2px 2px 0}',
      '.qr-item{display:flex;align-items:flex-start;gap:6px;padding:3px 2px;border-radius:var(--dsw-radius-sm,6px)}',
      '.qr-item:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.10))}',
      '.qr-no{flex:none;font-weight:500;color:var(--dsw-alias-label-primary,inherit)}',
      // 每条引用**只占一行**（超出省略号），右侧小箭头点开才看全文（用户要求：默认一行 + 可收放）
      '.qr-text{flex:1 1 auto;min-width:0;color:var(--dsw-alias-label-secondary,inherit);',
      'white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.qr-text.qr-open{white-space:normal;overflow-wrap:anywhere}',
      '.qr-more{flex:none;border:0;background:transparent;color:var(--dsw-alias-label-tertiary,inherit);cursor:pointer;',
      'font-size:11px;line-height:16px;padding:0 2px;border-radius:var(--dsw-radius-sm,6px)}',
      '.qr-more:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12));color:var(--dsw-alias-label-primary,inherit)}',
      '.qr-more:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-alias-state-business-primary,rgba(64,128,255,.6));outline-offset:-2px}',
      '.qr-toast{color:var(--dsw-alias-label-tertiary,inherit);font-size:11px;padding:0 2px 2px}',
      '.qr-warn{color:var(--dsw-alias-state-warning-primary,var(--dsw-alias-label-secondary,inherit));font-size:11px;padding:2px;line-height:16px}',
      // ── 第二部分：回合尾部那行「引用（N）」（就是「已完成 用时…」所在的位置）──
      '.qr-tail{display:flex;flex-direction:column;gap:2px;font-size:12px;color:var(--dsw-alias-label-tertiary,inherit);margin:2px 0}',
      '.qr-tail-head{display:inline-flex;align-items:center;gap:6px;cursor:pointer;user-select:none;background:transparent;border:0;padding:0;color:inherit;font:inherit}',
      '.qr-tail-head:hover{color:var(--dsw-alias-label-primary,inherit)}',
      '.qr-tail-head:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-alias-state-business-primary,rgba(64,128,255,.6));outline-offset:2px}',
      '.qr-tail-body{padding:2px 0 0 14px;display:flex;flex-direction:column;gap:2px}',
      '.qr-tail-item{display:flex;gap:6px;align-items:flex-start}',
      '.qr-tail-no{flex:none;font-weight:500;color:var(--dsw-alias-label-secondary,inherit)}',
      '.qr-tail-text{flex:1 1 auto;min-width:0;color:var(--dsw-alias-label-secondary,inherit);overflow-wrap:anywhere}',
    ].join('')

    function ensureCss() {
      try {
        if (typeof document === 'undefined') return
        if (document.querySelector('style[data-plugin-css="' + CSS_ID + '"]')) return
        var st = document.createElement('style')
        st.setAttribute('data-plugin-css', CSS_ID)
        st.textContent = CSS
        var host = document.head || document.body
        if (host) host.appendChild(st)
      } catch (e) { try { console.error('[quote-reply] 注入样式失败（不影响功能）：' + e.message) } catch (_) {} }
    }

    function safe(fn, label) {
      try { return fn() } catch (e) {
        try { console.error('[quote-reply] ' + label + ' 读取失败（已降级）：' + ((e && e.message) || e)) } catch (_) {}
        return null;
      }
    }
    function guard(label, fn) {
      try { return fn() } catch (e) {
        try { console.error('[quote-reply] ' + label + ' 失败（已隔离）：' + ((e && e.message) || e)) } catch (_) {}
        return null;
      }
    }

    // ─────────────── 引用层（按会话）───────────────
    var STORE = new Map();
    var listeners = new Set();
    function emit() { listeners.forEach(function (f) { try { f() } catch (e) {} }) }
    function subscribe(f) { listeners.add(f); return function () { listeners.delete(f) } }
    function bucket(sid) {
      var k = String(sid || 'unknown');
      if (!STORE.has(k)) STORE.set(k, { items: [], sent: [], sentAt: 0, seq: 0 });
      return STORE.get(k);
    }
    var CN = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
    function cn(n) {
      if (n <= 10) return CN[n];
      if (n < 20) return '十' + CN[n - 10];
      return CN[Math.floor(n / 10)] + '十' + (n % 10 ? CN[n % 10] : '');
    }
    function addQuote(sid, sourceId, text, sourceHint) {
      var st = bucket(sid); st.seq += 1;
      var item = { id: st.seq, no: st.seq, label: '引用' + cn(st.seq), sourceId: String(sourceId || ''), sourceHint: String(sourceHint || '').replace(/\s+/g, ' ').slice(0, 24), text: String(text || ''), at: Date.now() };
      st.items.push(item); emit(); pushToHost(sid, st.items); return item;
    }
    function removeQuote(sid, id) { var st = bucket(sid); st.items = st.items.filter(function (x) { return x.id !== id }); emit(); pushToHost(sid, st.items) }
    function clearQuotes(sid) { bucket(sid).items = []; emit(); pushToHost(sid, []) }
    function listQuotes(sid) { return bucket(sid).items.slice() }

    // ★ v0.8（用户 2026-10-15 要求：「发送后直接清空，不要悬浮框在发送后还在」）：
    //   原来的清空时机太晚 —— 要等"回合结束、尾部行渲染"时才认领，而我一个回合可能跑十几分钟，
    //   于是输入框上方那行一直挂着。现在把**可见副本**（items）在"已送出/已被宿主取走"时立刻清空，
    //   同时把同一批搬进**隐形待认领区**（sent）⇒ 悬浮框立刻消失，而回合尾部的「引用（N）」仍能显示。
    function markSent(sid, why) {
      var st = bucket(sid)
      if (!st.items.length) return false
      st.sent = (st.sent || []).concat(st.items)
      st.sentAt = Date.now()
      st.why = String(why || '')
      st.items = []
      lsSave()      // ★ v0.8.4：**搬进隐形区的那一刻就落盘** —— 否则此刻刷新页面，这批引用就彻底丢了
      emit()
      return true
    }
    function sentPending(sid) { var st = bucket(sid); return (st.sent && st.sent.length) ? st.sent.slice() : [] }

    // ★ v0.9.0：宿主版本握手。客户端**会自己热更、宿主不会** ⇒ "新客户端 + 旧宿主"是常态。
    //   host 信息随每次自证上报回宿主，于是从服务端 /quote-reply/health 就能看清是不是混装。
    var HOST_INFO = { version: '', minClient: '', compat: null, at: 0 };
    function noteHost(v) {
      try {
        if (!v || typeof v !== 'object') return
        HOST_INFO.version = String(v.version || '')
        HOST_INFO.minClient = String(v.minClient || '')
        // compat：宿主声明的最低客户端版本 ≤ 我 ⇒ 兼容；宿主没声明（旧版）⇒ 未知（null，不谎报为真）
        HOST_INFO.compat = HOST_INFO.minClient ? (String(VERSION) >= String(HOST_INFO.minClient)) : null
        HOST_INFO.at = Date.now()
      } catch (e) {}
    }

    // ★ v0.8.3 起：把"发送即清空"从 ≤1.5 秒压到 ≈0 秒 —— **草稿一变空就立刻问宿主一次**。
    //   判定权仍在宿主（只看 /health 的 consumed）；这里只把查询时机提前，打字中（草稿非空）不发请求。
    //   v0.9.0 提到模块级：这样夹具能直接断言"它真的会去问、且只在 consumed 命中时才搬"，不必起 React。
    function checkConsumedNow(sid, onDone) {
      try {
        var p = fetch('/quote-reply/health')
        if (!p || typeof p.then !== 'function') { if (onDone) onDone(false); return }
        p.then(function (r) { return r.json ? r.json() : null }).then(function (j) {
          if (j) noteHost(j)
          var hit = !!(j && j.consumed && j.consumed[String(sid || 'unknown')])
          if (hit) markSent(sid, 'host-injected-now')
          if (onDone) onDone(hit)
        }).catch(function () { if (onDone) onDone(false) })
      } catch (e) { if (onDone) onDone(false) }
    }

    // ─────────────── 第二部分：把"已发送的引用"记到**该回合**名下 ───────────────
    // 语义：引用是**随下一回合**送出的 ⇒ 下一个结束的回合把它"认领"走；此后它从待发区消失（等于自动清空），
    // 转而出现在**那个回合的尾部行**上（就是「已完成 用时…」那一行的位置，与它同款可展开）。
    var SENT = new Map();    // `${sid}::${turnKey}` -> items（该回合用过的引用）
    var MAXSEQ = new Map();  // sid -> 已见到的最大 seq（只允许"最新回合"认领，避免历史回合抢走待发引用）

    // ★ v0.7 修复（用户 2026-10-15 的原话：「你这个引用插件不是还有个第二部分吗，为啥还没做」）：
    //   SENT 是**内存 Map** ⇒ 一刷新页面，所有回合的「引用（N）」全部消失 ⇒ 看起来像"第二部分没做"。
    //   （而上一轮我恰好让用户去刷新页面验收 —— 正好把证据刷没了。）改成**有界落盘**：
    //   刷新后重新载入，历史回合的「引用（N）」照旧显示。只写在用户本机浏览器里，超量丢最旧。
    var LS_KEY = 'dsh-quote-reply:sent:v1';
    var LS_MAX = 40;      // 最多保留 40 个回合的认领记录
    var LS_TEXT = 400;    // 落盘时每条引用截断（界面显示仍用完整文本）
    var lsOK = true;
    function lsLoad() {
      if (!lsOK) return;
      try {
        var raw = window.localStorage.getItem(LS_KEY);
        if (!raw) return;
        var parsed = JSON.parse(raw);
        var arr = (parsed && !Array.isArray(parsed) && parsed.sent) ? parsed.sent : parsed;
        var readItems = function (v) {
          return (v || []).map(function (it, j) {
            return {
              id: String((it && it.id) || ('p' + j)),
              label: String((it && it.label) || ''),
              sourceHint: String((it && it.sourceHint) || ''),
              text: String((it && it.text) || ''),
            };
          });
        };
        if (arr && arr.length) {
          for (var i = 0; i < arr.length; i++) {
            var e = arr[i];
            if (!e || !e.k) continue;
            SENT.set(String(e.k), readItems(e.v));
          }
        }
        // ★ v0.8.4（修用户实测 bug）：把「隐形待认领区」也读回来。
        //   v0.8 的"发送后清空悬浮框"把这批引用从可见区搬进隐形区（当时只在内存里）；
        //   若此刻刷新页面（正是我让用户做的那一步），隐形区就丢了 ⇒ 回合结束时无人认领 ⇒
        //   **尾部那行不出现**，且宿主 pending 永远清不掉。落盘后，刷新也能正常认领。
        var pend = (parsed && !Array.isArray(parsed) && parsed.pend) ? parsed.pend : [];
        for (var m = 0; m < pend.length; m++) {
          var pe = pend[m];
          if (!pe || !pe.s) continue;
          var st2 = bucket(String(pe.s));
          st2.sent = readItems(pe.v);
          st2.sentAt = Number(pe.at) || 0;
        }
      } catch (e) { lsOK = false; }
    }
    function lsSave() {
      if (!lsOK) return;
      try {
        var cut = function (it) {
          return {
            id: it.id, label: String(it.label || '').slice(0, 40),
            sourceHint: String(it.sourceHint || '').slice(0, 80),
            text: String(it.text || '').slice(0, LS_TEXT),
          };
        };
        var arr = [];
        SENT.forEach(function (v, k) { arr.push({ k: k, v: (v || []).slice(0, 6).map(cut) }); });
        if (arr.length > LS_MAX) arr = arr.slice(arr.length - LS_MAX);
        // ★ v0.8.4：**同时落盘「隐形待认领区」** —— 否则"发送后清空悬浮框"之后一刷新，
        //   这批引用在内存里没了、宿主那边还挂着（pending 清不掉），回合尾部那行也永远不出现。
        var pend = [];
        STORE.forEach(function (st, sid2) {
          if (st && st.sent && st.sent.length) pend.push({ s: String(sid2), at: st.sentAt || 0, v: st.sent.slice(0, 6).map(cut) });
        });
        window.localStorage.setItem(LS_KEY, JSON.stringify({ sent: arr, pend: pend }));
      } catch (e) { lsOK = false; }
    }
    lsLoad()                 // ★ 模块初始化时就把上次落盘的认领记录读回来（否则刷新后仍然是空的）
    function turnKeyOf(props) {
      try {
        var t = props && props.turn
        if (t && typeof t === 'object') {
          if (t.turn != null) return String(t.turn)
          if (t.seq != null) return String(t.seq)
          if (t.id != null) return String(t.id)
        }
        if (props && props.seq != null) return String(props.seq)
      } catch (e) {}
      return 'unknown'
    }
    function claimTurnQuotes(sid, seq, turnKey) {
      var s = String(sid || 'unknown')
      var key = s + '::' + turnKey
      if (SENT.has(key)) return SENT.get(key)      // 该回合已经认领过 ⇒ 直接回放（跨渲染稳定）
      var n = Number(seq)
      if (!isNaN(n)) { var m = MAXSEQ.get(s) || 0; if (n > m) MAXSEQ.set(s, n) }
      var max = MAXSEQ.get(s) || 0
      if (!isNaN(n) && n !== max) return null      // 只有最新回合才能认领
      var st = bucket(s)
      // ★ v0.8：先看**隐形待认领区**（发送后立刻清空悬浮框时搬进来的那批），再退回待发区。
      //   带 10 分钟保鲜：万一某批因异常没被任何回合认领，不至于无限期挂着被后来的回合捡走。
      var fresh = (st.sent && st.sent.length && (Date.now() - (st.sentAt || 0)) < 10 * 60 * 1000) ? st.sent : null
      var src = fresh || st.items
      if (!src || !src.length) return null
      var items = src.slice()
      SENT.set(key, items)
      st.items = []                                // 已随本回合送出 ⇒ 从待发区移除（等于自动清空）
      st.sent = []                                 // 隐形区同时清空（这批已归到本回合 key 名下）
      st.sentAt = 0
      // ★ v0.8.4：落盘必须放在**清空之后** —— 放在之前会把隐形区原样写回盘，
      //   刷新后这批引用又被另一个回合认领一次（这个顺序错误是被 v0.8.4 夹具的反向断言抓出来的）。
      lsSave()                                     // ★ v0.7：落盘 ⇒ 刷新后这个回合的「引用（N）」还在
      emit()
      pushToHost(s, [])                            // 通知宿主：这批已送达，别再注入
      return items
    }
    function sentForTurn(sid, turnKey) { return SENT.get(String(sid || 'unknown') + '::' + turnKey) || null }

    // ─────────────── 取「要引用的那段话」───────────────
    function readSelection() {
      try {
        var sel = window.getSelection();
        if (sel && sel.rangeCount > 0 && !sel.isCollapsed) { var t = String(sel.toString() || '').trim(); if (t) return t }
      } catch (e) {}
      return '';
    }
    function readMessageText(messageId) {
      if (!messageId) return '';
      var attrs = ['data-message-id', 'data-messageid', 'data-msg-id', 'data-chat-node-id', 'data-node-id', 'data-id'];
      for (var i = 0; i < attrs.length; i++) {
        var el = null;
        try { el = document.querySelector('[' + attrs[i] + '="' + String(messageId).replace(/"/g, '\\"') + '"]') } catch (e) { el = null }
        if (el) { var t = String(el.textContent || '').replace(/\s+/g, ' ').trim(); if (t) return t }
      }
      return '';
    }
    function clip(text) {
      var t = String(text || '').trim();
      return t.length <= MAX_QUOTE ? t : t.slice(0, MAX_QUOTE) + ' …（已截断，原长 ' + t.length + ' 字）';
    }

    // ─────────────── 推给宿主：引用作为**上下文**随下一回合送达模型 ───────────────
    // 客户端**没有**发送前钩子（composer 是整块 takeover；InputActions 只有 captureInsertion/insertText），
    // 所以"随普通发送自动带上"只能在**宿主侧**用 systemPrompt.context 注入实现（见 lib/index.js）。
    // 这里只负责：引用一变就同步过去（删空即等于清空）。
    function pushToHost(sessionId, items) {
      try {
        var url = '/quote-reply/quotes';
        var payload = JSON.stringify({
          sessionId: String(sessionId || 'unknown'),
          items: (items || []).map(function (it) { return { label: it.label, sourceHint: it.sourceHint, text: it.text } }),
        });
        var p = fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: payload });
        if (p && typeof p.catch === 'function') p.catch(function () { /* 宿主没起来也不影响界面 */ });
      } catch (e) { /* 无 fetch 环境（自检）静默跳过 */ }
    }
    function quoteBlock(text) { return String(text).split('\n').map(function (l) { return '> ' + l }).join('\n') + '\n\n' }

    // ─────────────── 自证：把"我量到了什么 / 尾部行有没有渲染"报给宿主 ───────────────
    // 为什么需要它（v0.6 的真实起因）：宿主 stderr 在本机看不到，而**客户端渲染效果**（引用行宽度、
    //   回合尾部那行）原先只能靠人肉眼看控制台 ⇒ 出现"注入明明生效、用户却看不到任何反应"的沟通黑洞。
    // 做法：把被判定方的实测值变成**服务端可读**的事实 —— 宿主写 .client-status.json 并在 /health 回显，
    //   于是 agent 不必再要求用户开控制台，直接 GET /quote-reply/health 就能读到这两项的实测值。
    function reportSelfCheck(payload) {
      var out = null;
      try {
        if (payload && payload.tray) lastTrayReport = payload.tray;
        if (payload && payload.tail) lastTailReport = payload.tail;
        if (payload && payload.probe) lastProbeReport = payload.probe;
        out = {
          version: VERSION,
          at: new Date().toISOString(),
          sessionId: String((payload && payload.sessionId) || 'unknown').slice(0, 200),
          tray: lastTrayReport,          // ★ v0.7.2：两份报告合并，任何一份后到都带上另一份的最新值
          tail: lastTailReport,
          probe: lastProbeReport,        // ★ v0.8.1：input 的真实键名（供"发送信号"按契约实现，不再猜）
          host: { version: HOST_INFO.version, minClient: HOST_INFO.minClient, compat: HOST_INFO.compat },  // ★ v0.9.0 握手
        };
        // 同一份内容只报一次：宽度测量会跑很多次（rAF × 6 + ResizeObserver + resize）
        var key = JSON.stringify([out.sessionId, out.tray, out.tail]);
        if (key === lastReportKey) return out;
        lastReportKey = key;
        try { console.info('[quote-reply] selfcheck', out) } catch (e) {}
        var p = fetch('/quote-reply/report', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(out) });
        if (p && typeof p.catch === 'function') p.catch(function () { /* 宿主是旧版（没有 /report）也不影响界面 */ });
      } catch (e) { /* 无 fetch 环境（自检）静默跳过 */ }
      return out;
    }

    // ★ v0.7.1 急救修复：把自证上报从**高频测量热路径**里彻底摘出来（去抖上报器）。
    //   成因：matchGoalWidth 会被 ResizeObserver / rAF×6 / resize 高频调用；在其中做 fetch 与"写样式后立刻读 rect"
    //   会把渲染主线程拖住，并和 RO 形成"写样式→通知→再写"的回环 ⇒ 页面卡死。
    var pendingReport = null;
    var pendingEl = null;
    var reportTimer = 0;
    function scheduleReport(el) {
      try {
        if (el) pendingEl = el;
        if (reportTimer) return;
        reportTimer = window.setTimeout(function () {
          reportTimer = 0;
          var pr = pendingReport;
          pendingReport = null;
          if (pr) {
            // ★ v0.7.2：在**去抖回调里**（已脱离测量热路径）补读卡片实测宽度 ⇒
            //   自证报告同时含"目标框宽度 box"与"我的卡片宽度 w"，同宽与否一眼可判；热路径里绝不读 rect。
            try { if (pendingEl && pr.tray) pr.tray.w = Math.round(pendingEl.getBoundingClientRect().width) } catch (e) {}
            reportSelfCheck(pr);
          }
        }, 1200);
      } catch (e) { /* 没有 setTimeout 的环境（自检）静默跳过 */ }
    }

    // ─────────────── 宽度对齐「目标」那一行 ───────────────
    // 为什么不写死一个数字：出厂那条宽度规则在**独立样式表的 chunk** 里（49 个内联样式串都不含它），
    //   盲猜一个百分比只会来回返工。改成**运行时量**：在同一 dock 容器里找到「目标」那一行（按它的
    //   四种阶段文案识别），把它的**实际宽度**照抄到我的卡片上 —— 窗口缩放也跟着对。
    var GOAL_PHASES = ['进行中的目标', '未运行的目标', '已暂停的目标', '受阻的目标'];
    function isGoalRow(node) {
      try {
        var t = String(node.textContent || '').replace(/\s+/g, '');
        for (var i = 0; i < GOAL_PHASES.length; i++) if (t.indexOf(GOAL_PHASES[i].replace(/\s+/g, '')) >= 0) return true;
      } catch (e) {}
      return false;
    }
    function matchGoalWidth(el) {
      try {
        if (!el || !el.parentElement) return null
        // 先在兄弟里找到「目标」那一条目（可能是外层容器，宽度比可见胶囊大）
        var kids = el.parentElement.children || []
        var entry = null
        for (var i = 0; i < kids.length; i++) {
          var sib = kids[i]
          if (!sib || sib === el || (sib.contains && sib.contains(el))) continue
          if (isGoalRow(sib)) { entry = sib; break }
        }
        // ★ 关键修正（用户报"还是宽"的根因）：**可见胶囊是条目内部更窄的一层**（它有 max-width），
        //   抄外层容器就会比目标框宽。所以往下找**第一个真实盒子**（宽度 >0 且 max-width 不是 none）。
        var box = null, boxW = 0, boxMax = null
        if (entry) {
          var cands = [entry]
          try { cands = cands.concat(Array.prototype.slice.call(entry.querySelectorAll('*'), 0, 40)) } catch (e) {}
          for (var j = 0; j < cands.length; j++) {
            var n = cands[j]
            var w = 0
            try { w = n.getBoundingClientRect().width } catch (e) { w = 0 }
            if (!w || w < 120) continue
            var cs = null
            try { cs = window.getComputedStyle(n) } catch (e) { cs = null }
            if (!cs) continue
            if (cs.maxWidth && cs.maxWidth !== 'none') { box = n; boxW = w; boxMax = cs.maxWidth; break }
          }
          if (!box) {   // 没有 max-width 层 ⇒ 就用条目本身
            try { boxW = entry.getBoundingClientRect().width } catch (e) { boxW = 0 }
            box = entry
          }
        }
        if (!box || !boxW || boxW < 120) return null
        var finalMax = (boxMax && boxMax !== 'none') ? boxMax : (Math.round(boxW) + 'px')
        // ★ v0.7.1：**只在值真的变了才写样式**（原来无条件写 ⇒ 每次都触发 RO 通知 ⇒ 回环）
        if (el.style.width !== '100%') el.style.width = '100%'
        if (el.style.maxWidth !== finalMax) el.style.maxWidth = finalMax
        if (el.style.marginLeft !== 'auto') el.style.marginLeft = 'auto'
        if (el.style.marginRight !== 'auto') el.style.marginRight = 'auto'
        // 诊断信息挂到 data 属性上：悬停/看 DOM 即可知道我抄了谁、抄到多少（排障不必开控制台）
        try { el.setAttribute('data-qr-width', 'box=' + Math.round(boxW) + ' max=' + finalMax) } catch (e) {}
        // ★ v0.7.1：上报只**记账**，不在热路径里 fetch，也不在这里读 getBoundingClientRect
        //   （写样式后立刻读 rect 会强制同步重排，是 RO 回环的经典成因）
        pendingReport = { tray: { matched: true, box: Math.round(boxW), max: finalMax } }
        scheduleReport(el)
        return box
      } catch (e) { /* 量不到就继续用兜底公式 */ }
      return null
    }
    /** 持续跟随目标行宽度：ResizeObserver 优先；没有就多帧 rAF 重试 + resize */
    function followGoalWidth(el) {
      var sib = matchGoalWidth(el)
      var ro = null
      try {
        if (typeof ResizeObserver !== 'undefined' && el && el.parentElement) {
          var lastRo = 0
          ro = new ResizeObserver(function () {
            // ★ v0.7.1：RO 回调去抖（≥250ms）—— 防"写样式 → 通知 → 再写"的紧循环打死主线程
            var now2 = 0
            try { now2 = Date.now() } catch (e) {}
            if (now2 && lastRo && (now2 - lastRo) < 250) return
            lastRo = now2
            matchGoalWidth(el)
          })
          if (sib) { try { ro.observe(sib) } catch (e) {} }
          try { ro.observe(el.parentElement) } catch (e) {}
        }
      } catch (e) { ro = null }
      var rafs = []
      try {
        for (var i = 0; i < 6; i++) rafs.push(window.requestAnimationFrame(function () { matchGoalWidth(el) }))
      } catch (e) {}
      var onResize = function () { matchGoalWidth(el) }
      try { window.addEventListener('resize', onResize) } catch (e) {}
      return function () {
        try { if (ro) ro.disconnect() } catch (e) {}
        for (var j = 0; j < rafs.length; j++) { try { window.cancelAnimationFrame(rafs[j]) } catch (e) {} }
        try { window.removeEventListener('resize', onResize) } catch (e) {}
      }
    }

    // ─────────────── 输入框上方的「引用」行 ───────────────
    function QuoteTray(props) {
      var sessionId = props && props.sessionId;
      var inputActions = props && props.inputActions;
      var vs = React.useState(0), bump = vs[1];
      var os = React.useState(true), open = os[0], setOpen = os[1];
      var hs = React.useState(''), toast = hs[0], setToast = hs[1];
      var items = listQuotes(sessionId);   // 提到 effects 之前：effects 需要按它变化重跑
      var hk = React.useState(null), hostOk = hk[0], setHostOk = hk[1];
      var xs = React.useState({}), expanded = xs[0], setExpanded = xs[1];
      var ref = React.useRef(null);
      React.useEffect(function () { return subscribe(function () { bump(function (v) { return v + 1 }) }) }, []);
      // 宿主半体在不在？——**不是**可选的美化：不在 ⇒ 引用不会随消息发出，必须**显形**（否则用户以为引用了、
      // 实际模型没看到）。宿主半体只在 DSH 启动时加载（实测：禁用/启用、重装都不行），所以这里要能自证。
      React.useEffect(function () {
        var alive = true;
        try {
          var p = fetch('/quote-reply/health');
          if (p && typeof p.then === 'function') {
            p.then(function (r) { return r.text().then(function (t) { return { s: r.status, t: String(t || '') } }) })
              .then(function (x) {
                if (!alive) return
                try { noteHost(JSON.parse(x.t || '{}')) } catch (e) {}
                setHostOk(x.s === 200 && x.t.indexOf('"ok":true') >= 0)
              })
              .catch(function () { if (alive) setHostOk(false) });
          } else { setHostOk(false) }
        } catch (e) { setHostOk(false) }
        return function () { alive = false };
      }, []);
      // ★ v0.9.0：即时确认的实现已提到**模块级** `checkConsumedNow(sid)`（可被夹具直接断言）。

      // ★ v0.8：发送后立刻清空悬浮框 —— 两条信号取或：
      //   ① 渲染器在 input 里给出"正在发送"标志（对已知候选名做特性探测，命中即清；不猜字段用途）；
      //   ② 宿主确认"这批引用已被组进模型上下文"（/health 的 consumed，最确定，见下面的轮询）。
      React.useEffect(function () {
        try {
          var inp = props && props.input
          if (!inp) return
          // ★ v0.8.1：把渲染器**真正给的** input 字段上报一次（只报键名 + 类型/长度，**不含草稿正文**）。
          //   起因：v0.8 的"特性探测"其实是**猜字段名**，实测没命中（用户报"还在"）⇒ 改成按真实契约实现。
          var keys = []
          try { keys = Object.keys(inp) } catch (e) { keys = [] }
          var brief = {}
          for (var i = 0; i < keys.length; i++) {
            var k2 = keys[i], v2 = null
            try { v2 = inp[k2] } catch (e) { v2 = null }
            var t2 = typeof v2
            if (v2 === null) brief[k2] = 'null'
            else if (t2 === 'boolean' || t2 === 'number') brief[k2] = v2
            else if (t2 === 'string') brief[k2] = 'string(' + String(v2).length + ')'
            else brief[k2] = t2
          }
          // ★ v0.8.2：记录 input.phase 的**取值序列**（有界：最多 8 条、去重）—— phase 是状态枚举，不是用户正文。
          //   目的：拿到"发送中"时 phase 的确切取值，才能把"即时清空"按真实契约实现（而不是继续猜名字）。
          try {
            var ph = String(inp.phase || '')
            if (ph && ph.length <= 24) {
              var phLast = PHASE_HIST.length ? PHASE_HIST[PHASE_HIST.length - 1] : null
              if (phLast !== ph) { PHASE_HIST.push(ph); if (PHASE_HIST.length > 8) PHASE_HIST.shift() }
            }
          } catch (e) {}
          reportSelfCheck({ probe: { inputKeys: keys.join(','), brief: brief, phaseHist: PHASE_HIST.join('>') } })
          // ★ v0.8.3：草稿变空 = 极可能刚发送 ⇒ **立刻**确认一次（是否清空仍由宿主 consumed 决定）
          try { if (!String(inp.draft || '').length) checkConsumedNow(sessionId) } catch (e) {}
          // 已知候选名命中仍即时清空（保守：只认这几个名字，不按"看起来很忙"乱猜）
          var names = ['sending', 'busy', 'streaming', 'isSending', 'submitPending', 'pendingTurn']
          for (var j = 0; j < names.length; j++) {
            if (inp[names[j]]) { markSent(sessionId, 'input:' + names[j]); return }
          }        } catch (e) { /* 探测失败就只靠宿主信号，不抛 */ }
      }, [props && props.input]);
      React.useEffect(function () {
        if (!items.length) return
        var alive = true, tries = 0, t = null
        try {
          t = window.setInterval(function () {
            tries += 1
            if (!alive) return
            if (tries > 120) { try { window.clearInterval(t) } catch (e) {} ; return }   // 上限 ~3 分钟
            try {
              var p = fetch('/quote-reply/health')
              if (p && typeof p.then === 'function') {
                p.then(function (r) { return r.json ? r.json() : null }).then(function (j) {
                  if (!alive || !j || !j.consumed) return
                  var sid2 = String(sessionId || 'unknown')
                  if (j.consumed[sid2]) { markSent(sessionId, 'host-injected'); try { window.clearInterval(t) } catch (e) {} }
                }).catch(function () {})
              }
            } catch (e) {}
          }, 1500)
        } catch (e) { t = null }
        return function () { alive = false; if (t) { try { window.clearInterval(t) } catch (e) {} } }
      }, [items.length]);

      // 宽度持续跟随目标行。★ deps 含 items.length：首次渲染可能"0 条 ⇒ 不渲染卡片 ⇒ ref 为空"，
      //   若只在挂载时跑一次 effect，就永远量不到（这是"宽度对不上"的根因之一）。
      React.useEffect(function () { return followGoalWidth(ref.current) }, [open, items.length]);

      if (!items.length) return null;   // 无引用 ⇒ 不占位置（与官方 dock 一致：没内容就不占行）
      var groups = [], idx = {};
      items.forEach(function (it) {
        var k = it.sourceId || '(未知来源)';
        if (idx[k] === undefined) { idx[k] = groups.length; groups.push({ key: k, hint: it.sourceHint, items: [] }) }
        groups[idx[k]].items.push(it);
      });

      function notUsedInsert() { /* 保留占位；当前主路径是"宿主自动附带"，仅在降级态才用手工插入 */ }
      // 降级态用的手工插入（宿主半体没生效时，让引用至少还能发出去 —— 不静默失效）
      function insertOne(text) {
        if (!inputActions || typeof inputActions.insertText !== 'function') { setToast('当前宿主没有输入框 API'); return }
        var span = null;
        try { span = inputActions.captureInsertion() } catch (e) { span = null }
        var ok = false;
        try { ok = inputActions.insertText(quoteBlock(text), span) } catch (e) { ok = false }
        setToast(ok ? '已插入输入框' : '插入被拒（草稿已变更）');
        try { window.setTimeout(function () { setToast('') }, 2400) } catch (e) {}
      }
      var noDn = function (e) { try { e.preventDefault() } catch (_) {} };

      var head = h('div', { className: 'qr-head' },
        h('button', { className: 'qr-chev', type: 'button', onMouseDown: noDn, onClick: function () { setOpen(!open) },
          title: open ? '收起引用' : '展开引用', 'aria-expanded': open ? 'true' : 'false' }, open ? '▾' : '▸'),
        h('span', { className: 'qr-title' }, '引用'),
        h('span', { className: 'qr-count' }, '（' + items.length + '）' + (hostOk === false ? '· 宿主未生效' : '· 随下一条消息自动带上')),
        h('span', { className: 'qr-acts' },
          hostOk === false ? h('button', { className: 'qr-btn', type: 'button', title: '临时通道：把全部引用插入输入框', onMouseDown: noDn,
            onClick: function () { insertOne(items.map(function (x) { return x.text }).join('\n\n')) } }, '全部插入') : null,
          h('button', { className: 'qr-btn', type: 'button', title: '清空全部引用（模型下一回合就不再看到它们）', onMouseDown: noDn,
            onClick: function () { clearQuotes(sessionId); setToast('已清空引用'); try { window.setTimeout(function () { setToast('') }, 2400) } catch (e) {} } }, '清空'),
        ),
      );

      var body = [];
      if (toast) body.push(h('div', { key: 't', className: 'qr-toast' }, toast));
      if (hostOk === false) body.push(h('div', { key: 'w', className: 'qr-warn' },
        '宿主半体未生效：引用**暂时不会**随消息发出。重启一次 DSH（宿主进程）后自动生效；在此之前请用「插入」把引用放进输入框。'));
      if (open) {
        groups.forEach(function (g, gi) {
          body.push(h('div', { key: 'g' + gi, className: 'qr-group' },
            h('div', { className: 'qr-src' }, '来自：' + (g.hint ? '「' + g.hint + '…」' : '该条回答') + '（' + g.items.length + ' 条）'),
            g.items.map(function (it) {
              var isOpen = !!expanded[it.id];
              return h('div', { key: 'i' + it.id, className: 'qr-item' },
                h('span', { className: 'qr-no' }, it.label),
                h('span', { className: 'qr-text' + (isOpen ? ' qr-open' : ''), title: it.text }, it.text),
                h('span', { className: 'qr-acts' },
                  // 主路径是"宿主自动附带"；只有宿主半体没生效时，才把手工插入作为**降级通道**露出来
                  hostOk === false ? h('button', { className: 'qr-btn', type: 'button', title: '临时通道：把这条引用插入输入框', onMouseDown: noDn, onClick: function () { insertOne(it.text) } }, '插入') : null,
                  // 用户要求：默认只显示一行，右侧这个小箭头点开看全文（收放）
                  h('button', { className: 'qr-more', type: 'button', 'aria-expanded': isOpen ? 'true' : 'false',
                    title: isOpen ? '收起（只显示一行）' : '展开全文', onMouseDown: noDn,
                    onClick: function () { setExpanded(function (s) { var n = {}; for (var k in s) n[k] = s[k]; n[it.id] = !s[it.id]; return n }) } },
                    isOpen ? '▴' : '▾'),
                  h('button', { className: 'qr-btn qr-icon', type: 'button', title: '删除这条引用', onMouseDown: noDn, onClick: function () { removeQuote(sessionId, it.id) } }, '✕'),
                ),
              )
            }),
          ));
        });
      }
      return h('div', { className: 'qr-card', ref: ref }, [head].concat(open ? [h('div', { key: 'b', className: 'qr-body' }, body)] : []));
    }

    // ─────────────── 助手消息上的「引用回复」───────────────
    function QuoteAction(props) {
      var sessionId = props && props.sessionId;
      var messageId = props && props.messageId;
      var ms = React.useState(''), msg = ms[0], setMsg = ms[1];
      var noDn = function (e) { try { e.preventDefault() } catch (_) {} };
      var onClick = function () {
        var picked = readSelection(), bySelection = !!picked;
        if (!picked) picked = readMessageText(messageId);
        if (!picked) { setMsg('先在消息里选中要引用的那段文字'); return }
        var it = addQuote(sessionId, messageId, clip(picked), picked.replace(/\s+/g, ' ').slice(0, 24));
        setMsg('已加入 ' + it.label + (bySelection ? '' : '（未选中文字，整条引用）'));
        try { window.setTimeout(function () { setMsg('') }, 2600) } catch (e) {}
      };
      return h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '6px' } },
        h('button', { className: 'qr-btn', type: 'button', onMouseDown: noDn, onClick: onClick,
          title: '把选中那段加入上方的「引用」层（不写进输入框；可在上方逐条管理）',
          style: { border: '.5px solid currentColor', borderRadius: '6px', padding: '1px 8px', fontSize: '12px' } }, '引用回复'),
        msg ? h('span', { style: { fontSize: '12px', opacity: .7 } }, msg) : null,
      );
    }

    // ─────────────── 第二部分：回合尾部那行「引用（N）」（与「已完成 用时…」同位置、同款可展开）───────────────
    function QuoteTurnTail(props) {
      var sessionId = props && props.sessionId;
      var seq = props && props.seq;
      var turnKey = turnKeyOf(props);
      var st = React.useState(null), items = st[0], setItems = st[1];
      var os = React.useState(false), open = os[0], setOpen = os[1];
      React.useEffect(function () {
        // 认领放在 effect 里（不在渲染期改全局状态）：待发引用会被**最新回合**认领走，
        // 之后该回合永远显示这批引用（跨重渲染稳定），而待发区随之清空。
        var claimed = claimTurnQuotes(sessionId, seq, turnKey);
        // ★ v0.7：认领拿不到时**回落到已落盘/已缓存的记录** —— 刷新页面、切换会话、虚拟列表重挂载后，
        //   这一行仍然显示（此前只在"首次认领"那一瞬有值，重挂载后就永久为空 = 看起来"第二部分没做"）。
        if (!claimed || !claimed.length) claimed = sentForTurn(sessionId, turnKey);
        if (claimed && claimed.length) setItems(claimed);
        // 自证：尾部这行到底有没有东西（claimed=0 就是我"没反应"的真因，agent 可直接从 /health 读到）
        reportSelfCheck({
          sessionId: sessionId,
          tail: { rendered: !!(claimed && claimed.length), claimed: claimed ? claimed.length : 0, seq: seq, turnKey: String(turnKey).slice(0, 80) },
        });
      }, [sessionId, seq, turnKey]);
      if (!items || !items.length) return null;
      var noDn = function (e) { try { e.preventDefault() } catch (_) {} };
      var body = open ? h('div', { className: 'qr-tail-body' },
        items.map(function (it) {
          return h('div', { key: 'i' + it.id, className: 'qr-tail-item' },
            h('span', { className: 'qr-tail-no' }, it.label),
            h('span', { className: 'qr-tail-text' }, it.text),
          )
        })) : null;
      return h('div', { className: 'qr-tail' },
        h('button', { className: 'qr-tail-head', type: 'button', onMouseDown: noDn, onClick: function () { setOpen(!open) },
          'aria-expanded': open ? 'true' : 'false', title: open ? '收起引用' : '展开看这一条消息引用了什么' },
          h('span', null, (open ? '▾ ' : '▸ ') + '引用（' + items.length + '）')),
        body,
      );
    }

    function apply(ctx) {      ensureCss();
      var slots = safe(function () { return ctx && ctx.slots }, 'ctx.slots');
      if (!slots) {
        try { console.error('[quote-reply] ctx.slots 不可用 ⇒ 本插件不注册，宿主不受影响') } catch (e) {}
        return function () {};
      }
      var disposers = [];
      var d1 = guard('注册引用行（输入框上方）', function () {
        return slots.inject('conversation.input.dock', function () {
          return slots.register({ name: 'conversation.input.dock', id: TRAY_ID, order: TRAY_ORDER, label: function () { return '引用' } }, QuoteTray);
        });
      });
      if (d1) disposers.push(d1);
      var d2 = guard('注册「引用回复」动作', function () {
        return slots.inject('conversation.chat.assistant-actions', function () {
          return slots.register({ name: 'conversation.chat.assistant-actions', id: ACTION_ID, order: ACTION_ORDER, label: function () { return '引用回复' } }, QuoteAction);
        });
      });
      if (d2) disposers.push(d2);
      var d3 = guard('注册回合尾部「引用」行', function () {
        return slots.inject('conversation.chat.turnTail', function () {
          return slots.register({ name: 'conversation.chat.turnTail', id: TAIL_ID, order: TAIL_ORDER, label: function () { return '引用' } }, QuoteTurnTail);
        });
      });
      if (d3) disposers.push(d3);
      return function () { for (var i = 0; i < disposers.length; i++) { try { disposers[i]() } catch (e) {} } };
    }

    exports.apply = apply;
    exports.inject = inject;
    exports.__quote = { addQuote: addQuote, removeQuote: removeQuote, clearQuotes: clearQuotes, listQuotes: listQuotes, markSent: markSent, sentPending: sentPending, cn: cn, CSS: CSS, matchGoalWidth: matchGoalWidth, followGoalWidth: followGoalWidth, isGoalRow: isGoalRow, claimTurnQuotes: claimTurnQuotes, sentForTurn: sentForTurn, turnKeyOf: turnKeyOf, reportSelfCheck: reportSelfCheck, checkConsumedNow: checkConsumedNow, noteHost: noteHost, HOST_INFO: HOST_INFO, VERSION: VERSION };
    return module.exports;
  },
});
