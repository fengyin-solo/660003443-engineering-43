/**
 * 词根数据自动化检查
 *
 * 每次补充 src/mock/data.ts 中的词根数据后运行（npm run check:data），
 * 覆盖原先需要人工核对的三类事项：
 *   1. 格式检查 —— 字段完整性、词根书写规范、重复数据
 *   2. 联动检查 —— 词根与语系的引用一致性、图谱构建结果、页面渲染覆盖
 *   3. 统计概览 —— 各语系/语言的数据覆盖情况
 * 页面构建检查由 `npm run check` 中的 `npm run build` 完成。
 *
 * 退出码：存在 error 级问题时为 1，否则为 0（warning 不阻断）。
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { COGNATE_SETS, LANGUAGE_FAMILIES, buildGraph } from '../src/mock/data'

type Level = 'error' | 'warning' | 'info'
interface Problem { level: Level; section: string; msg: string }

const problems: Problem[] = []
let currentSection = ''
const error = (msg: string) => problems.push({ level: 'error', section: currentSection, msg })
const warn = (msg: string) => problems.push({ level: 'warning', section: currentSection, msg })
const info = (msg: string) => problems.push({ level: 'info', section: currentSection, msg })

function section(title: string) {
  currentSection = title
  console.log(`\n■ ${title}`)
}

// ---------- 1. 语系数据格式 ----------
section('语系数据格式 (LANGUAGE_FAMILIES)')
const familyIds = new Set<string>()
for (const f of LANGUAGE_FAMILIES) {
  if (!f.id || !f.id.trim()) error(`存在 id 为空的语系: ${JSON.stringify(f)}`)
  else if (familyIds.has(f.id)) error(`语系 id 重复: '${f.id}'`)
  else familyIds.add(f.id)

  if (!f.name || !f.name.trim()) error(`语系 '${f.id}' 缺少名称`)
  if (!f.era || !f.era.trim()) warn(`语系 '${f.id}'(${f.name}) 缺少年代 era`)
  if (!/^#[0-9a-fA-F]{6}$/.test(f.color)) warn(`语系 '${f.id}'(${f.name}) 颜色值不是 6 位十六进制: '${f.color}'`)

  if (!Array.isArray(f.languages) || f.languages.length === 0) {
    error(`语系 '${f.id}'(${f.name}) 未声明任何语言`)
  } else {
    const dup = f.languages.filter((l, i) => f.languages.indexOf(l) !== i)
    if (dup.length > 0) error(`语系 '${f.id}'(${f.name}) 语言列表有重复项: ${[...new Set(dup)].join(', ')}`)
    for (const l of f.languages) {
      if (!l || !l.trim()) error(`语系 '${f.id}'(${f.name}) 语言列表含空项`)
    }
  }
}
console.log(`  已检查 ${LANGUAGE_FAMILIES.length} 个语系`)

// ---------- 2. 词根数据格式 ----------
section('词根数据格式 (COGNATE_SETS)')
const seenRoots = new Map<string, number>()
COGNATE_SETS.forEach((cs, i) => {
  const tag = `词根[${i}] ${cs.root || '(空 root)'}`

  if (!cs.root || !cs.root.trim()) {
    error(`${tag}: root 为空`)
  } else {
    if (!cs.root.startsWith('*')) warn(`${tag}: 重构词根建议以 '*' 开头`)
    if (cs.root !== cs.root.trim()) warn(`${tag}: root 含首尾空格`)
    const first = seenRoots.get(cs.root)
    if (first !== undefined) error(`${tag}: 与词根[${first}] 的 root 重复`)
    else seenRoots.set(cs.root, i)
  }

  if (!cs.meaning || !cs.meaning.trim()) error(`${tag}: meaning 为空`)
  if (!cs.period || !cs.period.trim()) error(`${tag}: period 为空`)
  if (!cs.family || !cs.family.trim()) error(`${tag}: family 为空`)

  const entries = Object.entries(cs.languages ?? {})
  if (entries.length === 0) error(`${tag}: languages 没有任何词条`)
  for (const [lang, word] of entries) {
    if (!lang || !lang.trim()) error(`${tag}: 存在空的语言名`)
    if (word === undefined || word === null || !String(word).trim()) {
      error(`${tag}: '${lang}' 的词形为空`)
    } else {
      if (word === '-') warn(`${tag}: '${lang}' 词形为 '-'，buildGraph 会跳过，建议直接删除该键`)
      if (word !== word.trim()) warn(`${tag}: '${lang}' 的词形含首尾空格`)
    }
  }
})
console.log(`  已检查 ${COGNATE_SETS.length} 个词根`)

// ---------- 3. 词根 ↔ 语系 引用一致性 ----------
section('词根与语系引用一致性')
const familyById = new Map(LANGUAGE_FAMILIES.map(f => [f.id, f]))
for (const cs of COGNATE_SETS) {
  const fam = familyById.get(cs.family)
  if (!fam) {
    error(`词根 ${cs.root}: family '${cs.family}' 在 LANGUAGE_FAMILIES 中不存在`)
    continue
  }
  for (const lang of Object.keys(cs.languages)) {
    if (!fam.languages.includes(lang)) {
      error(`词根 ${cs.root}: 语言 '${lang}' 未在语系 '${fam.name}' 的 languages 中声明（检查拼写或补充声明）`)
    }
  }
}
console.log('  词根 family 引用与语言归属核对完成')

// ---------- 4. 图谱构建结果 (buildGraph 联动) ----------
section('图谱构建结果 (buildGraph)')
const { nodes, links } = buildGraph()

const nodeIds = new Set<string>()
for (const n of nodes) {
  if (nodeIds.has(n.id)) error(`图谱节点 id 重复: '${n.id}'`)
  else nodeIds.add(n.id)
}
for (const l of links) {
  if (!nodeIds.has(l.source)) error(`边 ${l.source} -> ${l.target}: 起点节点不存在`)
  if (!nodeIds.has(l.target)) error(`边 ${l.source} -> ${l.target}: 终点节点不存在`)
}

const outDegree = new Map<string, number>()
const inDegree = new Set<string>()
for (const l of links) {
  outDegree.set(l.source, (outDegree.get(l.source) ?? 0) + 1)
  inDegree.add(l.target)
}
for (const n of nodes) {
  const isRoot = n.id.startsWith('root_')
  if (isRoot && !outDegree.get(n.id)) error(`词根节点 ${n.word}(${n.id}) 没有任何派生词，图中将是孤点`)
  if (!isRoot && !inDegree.has(n.id)) error(`词节点 ${n.word}(${n.id}) 是孤立节点`)
}

// 节点数应与数据条目数一致（词根节点 + 有效词条节点）
const wordCount = COGNATE_SETS.reduce(
  (sum, cs) => sum + Object.values(cs.languages).filter(w => w && w !== '-').length, 0)
const expectedNodes = COGNATE_SETS.length + wordCount
if (nodes.length !== expectedNodes) {
  error(`图谱节点数 ${nodes.length} 与预期（${COGNATE_SETS.length} 词根 + ${wordCount} 词条 = ${expectedNodes}）不一致`)
}

// 图谱节点的 family 应与来源词根集一致（buildGraph 目前硬编码 'ie'，新增其他语系词根时会在此暴露）
nodes.forEach(n => {
  const m = n.id.match(/^(\d+)_/) ?? n.id.match(/^root_(\d+)$/)
  if (!m) return
  const cs = COGNATE_SETS[Number(m[1])]
  if (cs && n.family !== cs.family) {
    error(`节点 ${n.word}(${n.id}) 的 family '${n.family}' 与词根 ${cs.root} 的 family '${cs.family}' 不一致`)
  }
})
console.log(`  图谱共 ${nodes.length} 个节点 / ${links.length} 条边`)

// ---------- 5. 页面渲染覆盖 (数据 ↔ App.vue 联动) ----------
section('页面渲染覆盖 (App.vue)')
let appVue = ''
try {
  appVue = readFileSync(join(process.cwd(), 'src', 'App.vue'), 'utf8')
} catch {
  info('未找到 src/App.vue（请在 frontend 目录下通过 npm run check:data 运行），跳过页面覆盖检查')
}
if (appVue) {
  // 对照表列是硬编码的 cs.languages['xx']，数据中新语言若无对应列则不会显示
  const columns = new Set([...appVue.matchAll(/cs\.languages\['([^']+)'\]/g)].map(m => m[1]))
  const usedLangs = new Set(COGNATE_SETS.flatMap(cs => Object.keys(cs.languages)))
  if (columns.size === 0) {
    info('未在 App.vue 中识别到对照表列（模板可能已重构），跳过列覆盖检查')
  } else {
    for (const lang of usedLangs) {
      if (!columns.has(lang)) warn(`语言 '${lang}' 在数据中使用，但对照表没有对应列，页面上不会显示`)
    }
    console.log(`  对照表列: ${[...columns].join(' / ')}`)
  }

  // 图谱节点颜色按 family 硬编码，新语系若无配色会显示为灰色
  const colorsMatch = appVue.match(/COLORS[^=]*=\s*\{([^}]*)\}/s)
  if (!colorsMatch) {
    info('未在 App.vue 中识别到 COLORS 配色表，跳过配色覆盖检查')
  } else {
    const colorKeys = new Set([...colorsMatch[1].matchAll(/(\w+)\s*:/g)].map(m => m[1]))
    const usedFamilies = new Set(COGNATE_SETS.map(cs => cs.family))
    for (const fid of usedFamilies) {
      if (!colorKeys.has(fid)) warn(`语系 '${fid}' 在数据中使用，但 App.vue 的 COLORS 中没有配色，图谱节点将显示为灰色`)
    }
  }
}

// ---------- 6. 数据概览 ----------
section('数据概览')
for (const f of LANGUAGE_FAMILIES) {
  const sets = COGNATE_SETS.filter(cs => cs.family === f.id)
  const usedLangs = new Set(sets.flatMap(cs => Object.keys(cs.languages)))
  const unused = f.languages.filter(l => !usedLangs.has(l))
  console.log(`  ${f.name}: ${sets.length} 个词根，覆盖 ${usedLangs.size}/${f.languages.length} 种语言` +
    (sets.length > 0 && unused.length > 0 ? `（未覆盖: ${unused.join('、')}）` : ''))
  if (sets.length === 0) info(`语系 '${f.name}' 下还没有词根数据，筛选器选择该语系时结果为空`)
}
console.log(`  合计: ${COGNATE_SETS.length} 个词根，${wordCount} 个词条`)

// ---------- 汇总 ----------
const errors = problems.filter(p => p.level === 'error')
const warnings = problems.filter(p => p.level === 'warning')
const infos = problems.filter(p => p.level === 'info')

console.log('\n' + '='.repeat(50))
if (problems.length > 0) {
  console.log('问题清单:')
  for (const p of problems) {
    const icon = p.level === 'error' ? '✗' : p.level === 'warning' ? '⚠' : 'ℹ'
    console.log(`  ${icon} [${p.level}] (${p.section}) ${p.msg}`)
  }
  console.log('='.repeat(50))
}
console.log(`检查完成: ${errors.length} 个错误, ${warnings.length} 个警告, ${infos.length} 条提示`)
if (errors.length > 0) {
  console.error('✗ 数据检查未通过，请修复上述错误后再提交')
  process.exit(1)
}
console.log('✓ 数据检查通过' + (warnings.length > 0 ? '（有警告，建议处理）' : ''))
