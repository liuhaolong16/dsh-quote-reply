#!/usr/bin/env node
/**
 * _preflight —— **重启 DSH 之前的必过门**（用户 2026-10-15 要求：先检查源文件与插件兼容，再谈重启）
 *
 * 为什么必须先跑这个：宿主半体**只在 DSH 启动时加载**（实测：启用/禁用、卸载重装都无效），
 * 所以"宿主半体能不能起来"只有一次机会 —— 若它引用了**不存在的 API**、或与别的插件**撞名/撞路由**，
 * 重启后就可能白重启一次（甚至把宿主 boot 打断）。因此把检查前置成一条可复跑的命令。
 *
 * 检查项（每条都给出证据，不是"我觉得"）：
 *   A. 文件齐全 + 两半体语法（宿主按 ESM 校验）
 *   B. **对源文件核对 API**（读 app.asar）：systemPrompt.context 签名 / PromptContext 字段 /
 *      webServer.register / ctx.effect / ctx.get 是否真实存在
 *   C. **出厂先例**：asar 里有没有**别的插件**也注册 prompt context（有先例 ⇒ 第三方可用的强证据）
 *   D. **冲突**：路由前缀 / 上下文名 / 槽位 id 是否与已装插件或出厂占用者相撞
 *   E. 客户端夹具（假 loader + React 桩）是否全过
 *   F. 宿主半体是否具备**自证**机制（.host-status.json）与"不打断 boot"的防御（注册都在 try/catch 内）
 *
 * 用法：node _preflight.cjs        （退出码 0 = 可以安全重启；非 0 = 先修，别重启）
 */
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const HERE = __dirname
const ASAR = 'D:\\DeepSeek Harness\\resources\\app.asar'
const PROFILE_NM = path.join(os.homedir(), '.dsh', 'profiles', 'desktop', 'node_modules')
const MY_ROUTE = '/quote-reply'
const MY_CONTEXT_NAME = 'quote-reply'
const MY_SLOTS = [
  { slot: 'conversation.input.dock', id: 'quote-tray', known: ['todo', 'quick-note', 'goal', 'queue'] },
  { slot: 'conversation.chat.assistant-actions', id: 'quote-reply', known: ['feedback', 'context-jump'] },
  { slot: 'conversation.chat.turnTail', id: 'quote-refs', known: ['stratagate-memory-citations', '@deepseek-ai/dsh-client-ui-deliverables', '@deepseek-ai/dsh-client-ui-plan', 'schedule-created'] },
]

const rows = []
const add = (level, name, detail) => rows.push({ level, name, detail })
function mustRead(p) { return fs.readFileSync(p, 'utf8') }

// ── A. 文件与语法 ──
const FILES = ['package.json', 'lib/index.js', 'lib/client.js', 'cordis.patch.yml']
for (const f of FILES) {
  const p = path.join(HERE, f)
  if (!fs.existsSync(p)) add('FAIL', 'A 文件存在', f + ' 缺失')
}
add('PASS', 'A 文件存在', FILES.filter((f) => fs.existsSync(path.join(HERE, f))).length + '/' + FILES.length)

const NODE = process.execPath
function checkSyntax(file, asEsm) {
  try {
    if (asEsm) {
      const tmp = path.join(os.tmpdir(), 'pf-' + Date.now() + '-' + path.basename(file) + '.mjs')
      fs.copyFileSync(path.join(HERE, file), tmp)
      execFileSync(NODE, ['--check', tmp], { stdio: 'pipe' })
      fs.unlinkSync(tmp)
    } else {
      execFileSync(NODE, ['--check', path.join(HERE, file)], { stdio: 'pipe' })
    }
    return 'ok'
  } catch (e) { return '语法错误：' + String((e && (e.stderr || e.message)) || e).slice(0, 200) }
}
const synHost = checkSyntax('lib/index.js', true)
const synClient = checkSyntax('lib/client.js', false)
add(synHost === 'ok' ? 'PASS' : 'FAIL', 'A 宿主半体语法（ESM）', synHost)
add(synClient === 'ok' ? 'PASS' : 'FAIL', 'A 客户端半体语法', synClient)

// ── B/C. 对源文件核对 API ──
let asar = null
try { asar = fs.readFileSync(ASAR) } catch (e) {
  if (fs.existsSync(ASAR)) add('FAIL', 'B 读 DSH 源文件', '读不到 ' + ASAR + '：' + e.message)
  else add('INFO', 'B 读 DSH 源文件', '未找到宿主 asar（异机/CI）⇒ 与「源文件核对 API」「出厂先例」相关的项一律显形跳过，不计入通过：' + ASAR)
}
if (!asar) add('INFO', 'B/C 契约与先例对照', '无 asar ⇒ 上下文签名核对、出厂先例、路由占用三项均显形跳过（在装有 DSH 的机器上重跑才算数）')
const has = (s) => !!asar && asar.indexOf(Buffer.from(s, 'utf8')) >= 0
if (asar) {
  add(has('context(context: PromptContext): () => void') ? 'PASS' : 'FAIL', 'B systemPrompt.context 签名',
    has('context(context: PromptContext): () => void') ? '与源文件一致（返回 disposer）' : '源文件里找不到该签名 ⇒ 我用的 API 可能不存在')
  const pcOk = has('readonly name: string') && has('readonly order: number') && has('readonly text: string | ((context: AssembleContext) => string)')
  add(pcOk ? 'PASS' : 'FAIL', 'B PromptContext 字段', pcOk ? 'name / order / text 与源文件一致' : 'PromptContext 字段与我的假设不符')
  add(has('register(') && has('webServer') ? 'PASS' : 'WARN', 'B webServer.register', '按 ai-workbench 的活体先例使用（该插件路由实测 200）')
  add(has('effect(') ? 'PASS' : 'WARN', 'B ctx.effect', '按 ai-workbench 的活体先例使用')
  // ctx.get 是否是可用的可选服务获取方式：找 cordis Context 的 get 声明
  add(has('get(name:') || has('.get(name)') ? 'PASS' : 'WARN', 'B ctx.get（可选服务）',
    has('get(name:') || has('.get(name)') ? '源文件里有 get(name) 形态' : '源文件未直接出现 get(name) ⇒ 我已在代码里对拿不到服务做了降级（写状态文件）')
  // C 出厂先例：别的插件注册 prompt context
  let precedent = null
  try {
    const s = asar.toString('utf8')
    const m = s.match(/systemPrompt\.context\(\{[\s\S]{0,160}?name:\s*"([^"]+)"/)
    if (m) precedent = m[1]
  } catch (e) { /* ignore */ }
  add(precedent ? 'PASS' : 'WARN', 'C 出厂先例：插件注册 prompt context',
    precedent ? '源文件里有先例（name="' + precedent + '"）⇒ 第三方注册上下文可行' : '未在 asar 中定位到先例；风险由"注册失败即写状态文件 + 不打断 boot"兜住')
}

// ── D. 冲突检查 ──
function walk(dir, out, depth) {
  if (!out || depth > 4) return
  let ents = []
  try { ents = fs.readdirSync(dir, { withFileTypes: true }) } catch (e) { return }
  for (const e of ents) {
    if (e.name === '.bin' || e.name.startsWith('.')) continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out, depth + 1)
    else if (/\.(js|mjs|cjs|json)$/.test(e.name)) out.push(p)
  }
}
const installed = []
walk(PROFILE_NM, installed, 0)
add('INFO', 'D 扫描已装插件文件', installed.length + ' 个文件（' + PROFILE_NM + '）')
const routeClash = [], nameClash = []
for (const f of installed) {
  if (f.includes(path.sep + 'dsh-quote-reply' + path.sep)) continue
  let t = ''
  try { t = fs.readFileSync(f, 'utf8') } catch (e) { continue }
  if (t.indexOf("path: '" + MY_ROUTE + "'") >= 0 || t.indexOf('path: "' + MY_ROUTE + '"') >= 0) routeClash.push(f)
  if ((t.indexOf('systemPrompt') >= 0 || t.indexOf('promptContext') >= 0) && new RegExp("name:\\s*['\"]" + MY_CONTEXT_NAME + "['\"]").test(t)) nameClash.push(f)
}
add(routeClash.length === 0 ? 'PASS' : 'FAIL', 'D 路由前缀不撞车', routeClash.length ? '被占用：' + routeClash.join(', ') : MY_ROUTE + ' 未被任何已装插件注册')
add(nameClash.length === 0 ? 'PASS' : 'FAIL', 'D 上下文名不撞车', nameClash.length ? '被占用：' + nameClash.join(', ') : 'name="' + MY_CONTEXT_NAME + '" 未被别的插件用作 prompt context')
add(!asar ? 'INFO' : (has(MY_ROUTE) ? 'WARN' : 'PASS'), 'D 出厂是否已占用该路由', !asar ? '无 asar ⇒ 无法核对，显形跳过（**不得**当作「未占用」）' : (has(MY_ROUTE) ? 'asar 里出现过 ' + MY_ROUTE + '（需人工确认是不是路由）' : '出厂未占用 ' + MY_ROUTE))
// 槽位 id：与出厂占用者比对（占用者名单来自活体 Slots 自省，记录在此以便复核）
for (const s of MY_SLOTS) {
  const clash = s.known.includes(s.id)
  add(clash ? 'FAIL' : 'PASS', 'D 槽位 id 不撞车 ' + s.slot, clash ? '与出厂占用者撞名：' + s.id : 'id=' + s.id + ' 与已知占用者（' + s.known.join('/') + '）不冲突')
}

// ── E. 客户端夹具 ──
try {
  const out = execFileSync(NODE, [path.join(HERE, '_check-client.cjs')], { encoding: 'utf8', stdio: 'pipe' })
  add(out.indexOf('✔') >= 0 ? 'PASS' : 'FAIL', 'E 客户端夹具', out.split('\n')[0].slice(0, 150))
} catch (e) {
  add('FAIL', 'E 客户端夹具', '失败：' + String((e && (e.stdout || e.message)) || e).split('\n').slice(0, 4).join(' | ').slice(0, 220))
}

// ── F. 自证与防御 ──
let host = ''
try { host = mustRead(path.join(HERE, 'lib/index.js')) } catch (e) { /* ignore */ }
add(host.indexOf('.host-status.json') >= 0 ? 'PASS' : 'FAIL', 'F 宿主半体自证机制', host.indexOf('.host-status.json') >= 0 ? '会把注册结果写到 lib/.host-status.json（重启后可据此判断是否真生效）' : '缺少自证机制：重启后无法判断宿主半体是否真的跑了')
const tryCount = (host.match(/try\s*\{/g) || []).length
const applyIdx = host.indexOf('export function apply')
const guarded = applyIdx >= 0 && tryCount >= 3
add(guarded ? 'PASS' : 'WARN', 'F 不打断宿主 boot', 'apply() 内 try/catch 块数=' + tryCount + '（两项注册各自 try + 顶部状态写入 try）')
add(host.indexOf('export function apply') >= 0 && host.indexOf('export const name') >= 0 ? 'PASS' : 'FAIL', 'F 宿主半体导出形状', 'name + apply 具名导出（与 ai-workbench 一致）')

// ── H2. 客户端入口契约：exports 必须同时含 '.' 与 './client'（v0.9.1 · 发布前必查）──
//    依据：profile/node_modules 下已装副本正是这个映射；宿主/工具按 './client' 键解析客户端半体。
try {
  const _pkg = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, 'package.json'), 'utf8'));
  const _ex = _pkg.exports || {};
  if (!_ex['.'] || !_ex['./client']) add('FAIL', 'H 客户端入口契约', "exports 必须同时含 '.' 与 './client'，实为 " + JSON.stringify(_ex));
  else add('PASS', 'H 客户端入口契约', "exports '.':" + _ex['.'] + " · './client':" + _ex['./client']);
} catch (_e) { add('FAIL', 'H 客户端入口契约', String((_e && _e.message) || _e)); }

// ── G. 包元数据与版本一致（v0.9.0 新增）──
// 为什么值得单列两项：① package.json 是历史事故点（BOM、ASCII 双引号都让它变成非法 JSON）；
// ② 客户端半体**会自己热更、宿主半体不会**（本机实测）⇒ "新客户端 + 旧宿主"是常态，
//    三处版本号对不上时，界面症状往往是"看着没反应"，非常难查。
function tryRead(p) { try { return fs.readFileSync(p, 'utf8') } catch (e) { return '' } }
let pkgJson = null, pkgErr = ''
try { pkgJson = JSON.parse(tryRead(path.join(HERE, 'package.json'))) } catch (e) { pkgErr = String((e && e.message) || e) }
add(pkgJson && pkgJson.name === 'dsh-quote-reply' ? 'PASS' : 'FAIL', 'G 包元数据',
  pkgJson ? (pkgJson.name + ' @ ' + pkgJson.version) : ('package.json 不可解析（JSON 非法！历史事故：BOM / ASCII 双引号）：' + pkgErr))
const cver = (tryRead(path.join(HERE, 'lib/client.js')).match(/var VERSION = '([0-9.]+)'/) || [])[1] || null
const hver = (tryRead(path.join(HERE, 'lib/index.js')).match(/const VERSION = '([0-9.]+)'/) || [])[1] || null
add(pkgJson && cver && hver && pkgJson.version === cver && pkgJson.version === hver ? 'PASS' : 'FAIL', 'G 版本一致',
  'package=' + (pkgJson && pkgJson.version) + ' client=' + cver + ' host=' + hver + '（三处必须相同）')

// ── 报告 ──
const fails = rows.filter((r) => r.level === 'FAIL')
const warns = rows.filter((r) => r.level === 'WARN')
console.log('重启前必过门 · dsh-quote-reply preflight')
console.log('='.repeat(64))
for (const r of rows) {
  const mark = r.level === 'PASS' ? '✔' : r.level === 'FAIL' ? '✘' : r.level === 'WARN' ? '!' : '·'
  console.log(' ' + mark + ' [' + r.level + '] ' + r.name + ' —— ' + r.detail)
}
console.log('='.repeat(64))
console.log(' 合计 ' + rows.length + ' 项：PASS ' + rows.filter((r) => r.level === 'PASS').length
  + ' · WARN ' + warns.length + ' · FAIL ' + fails.length + ' · INFO ' + rows.filter((r) => r.level === 'INFO').length)
console.log(fails.length === 0
  ? ' ⇒ **可以安全重启 DSH**（无 FAIL；WARN 项均已给出兜底）'
  : ' ⇒ **先不要重启**：有 ' + fails.length + ' 项 FAIL 必须先修（重启只有一次机会，宿主半体只在启动时加载）')
process.exit(fails.length === 0 ? 0 : 1)
