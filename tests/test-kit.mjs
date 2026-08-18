// DSH Dev Workflow Kit — тест-кит.
// Запуск: node tests/test-kit.mjs [путь_к_репо]   (по умолчанию — родитель tests/)
// Что проверяет:
//   A. Статика: YAML композиций, ряды с name, существование './lib/index.js',
//      структура скила (шапка + все 6 фаз), консистентность копий скила.
//   B. Живой mount (апстрим-паттерн): Context из установленных пакетов DSH +
//      agentPresets.mount + ассерты ctx.tools.schemas(agent).
//   C. Поведение: tool_collision_check реально отвечает ЗАНЯТО/свободно в
//      агентском скоупе (через ctx.tools.execute с явным agent) — тот случай,
//      который agentless-зонды в живой сессии проверить не могут.
//   D. Скилы: глобальный корень <dshHome>/skills отдаёт dsh-plugin-gotchas
//      в каталог агента (skill-filesystem с фикстурным dshHome).
import { createRequire } from 'node:module'
import { cp, access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoRoot = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..'))
const NM = process.env.DSH_NM ?? 'C:/Users/stigm/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/node_modules'
const dshHome = process.env.DSH_HOME ?? join(homedir(), '.dsh')

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
}

const requireDsh = createRequire(resolve(NM, '@deepseek-ai/dsh/package.json'))
const yaml = requireDsh('js-yaml')
// Тот же YAML-диалект, что у загрузчика (cordis-plugin-include): `!!js`-скаляры
// превращаются в узлы выражений, чтобы `disabled: !!js ...` парсился без ошибок.
const JsExpr = new yaml.Type('tag:yaml.org,2002:js', {
  kind: 'scalar',
  resolve: (data) => typeof data === 'string',
  construct: (data) => ({ __jsExpr: data }),
})
const KitSchema = yaml.JSON_SCHEMA.extend(JsExpr)

// ── A. Статика ─────────────────────────────────────────────────────────────
const skillLocations = [
  ['repo/skills', join(repoRoot, 'skills', 'dsh-plugin-gotchas', 'SKILL.md')],
  ['repo/preset-dsh-dev', join(repoRoot, 'preset-dsh-dev', 'skills', 'dsh-plugin-gotchas', 'SKILL.md')],
  ['global', join(dshHome, 'skills', 'dsh-plugin-gotchas', 'SKILL.md')],
  ['installed dsh-dev', join(dshHome, '.agent-presets', 'dsh-dev', 'skills', 'dsh-plugin-gotchas', 'SKILL.md')],
  ['installed reels-dsh', join(dshHome, '.agent-presets', 'reels-dsh', 'skills', 'dsh-plugin-gotchas', 'SKILL.md')],
]
const PHASES = ['Фаза 0', 'Фаза 1', 'Фаза 2', 'Фаза 3', 'Фаза 4', 'Фаза 5']

async function fileExists(path) {
  try { await access(path); return true } catch { return false }
}

const skillBodies = new Map()
for (const [label, path] of skillLocations) {
  if (!(await fileExists(path))) {
    check(`скил: ${label} существует`, false, path)
    continue
  }
  const body = await readFile(path, 'utf8')
  skillBodies.set(label, body)
  check(`скил: ${label} существует`, true, path)
  const fm = body.match(/^---\n([\s\S]*?)\n---/)
  check(`скил: ${label} имеет шапку name/description/whenToUse`, Boolean(
    fm && fm[1].includes('name: dsh-plugin-gotchas') && fm[1].includes('description:') && fm[1].includes('whenToUse:')
  ))
  check(`скил: ${label} содержит все 6 фаз`, PHASES.every((p) => body.includes('## ' + p)))
  check(`скил: ${label} содержит справочник готч`, body.includes('## Приложение: справочник готч'))
}

const canon = skillBodies.get('repo/skills')
for (const [label, body] of skillBodies) {
  if (label === 'repo/skills') continue
  check(`скил: ${label} байт-в-байт равен канону`, body === canon)
}

const compositions = [
  ['template', join(repoRoot, 'template', 'agent.cordis.yml'), './lib/index.js'],
  ['preset-dsh-dev', join(repoRoot, 'preset-dsh-dev', 'agent.cordis.yml'), './lib/index.js'],
  ['installed dsh-dev', join(dshHome, '.agent-presets', 'dsh-dev', 'agent.cordis.yml'), './lib/index.js'],
]
for (const [label, path, relPlugin] of compositions) {
  const body = await readFile(path, 'utf8').catch(() => null)
  if (body === null) { check(`композиция: ${label} читается`, false, path); continue }
  check(`композиция: ${label} читается`, true)
  let rows
  try { rows = yaml.load(body, { schema: KitSchema }) } catch (error) {
    check(`композиция: ${label} валидный YAML`, false, String(error.message)); continue
  }
  check(`композиция: ${label} — список рядов`, Array.isArray(rows))
  const flat = []
  const walk = (list, at) => {
    for (const row of list ?? []) {
      if (!row || typeof row !== 'object') { check(`композиция: ${label}${at} — ряд-объект`, false); continue }
      flat.push(row)
      if (row.group === true) walk(row.config, at + '/group')
    }
  }
  walk(rows, '')
  check(`композиция: ${label} — все ряды имеют name`, flat.every((r) => typeof r.name === 'string' && r.name !== ''))
  const pluginRow = flat.find((r) => r.name === relPlugin)
  if (!pluginRow) check(`композиция: ${label} содержит ряд ${relPlugin}`, false)
  else {
    const target = resolve(dirname(path), relPlugin)
    check(`композиция: ${label} — файл плагина существует`, await fileExists(target), target)
  }
}

// ── B/C/D. Живой mount + поведение + скилы ──────────────────────────────────
function extractText(result) {
  const parts = []
  const walk = (v) => {
    if (!v || typeof v !== 'object') return
    if (Array.isArray(v)) { for (const item of v) walk(item); return }
    if (v.type === 'text' && typeof v.text === 'string') parts.push(v.text)
    if (v.content) walk(v.content)
    if (v.value && typeof v.value === 'string') parts.push(v.value)
  }
  walk(result)
  return parts.join(' ')
}

async function bootHarness() {
  const imp = (pkg) => import(pathToFileURL(join(NM, pkg, 'lib', 'index.js')).href)
  const { Context } = await imp('@deepseek-ai/cordis')
  const { default: Loader } = await imp('@deepseek-ai/cordis-plugin-loader')
  const { default: Include } = await imp('@deepseek-ai/cordis-plugin-include')
  const { default: LlmRuntime } = await imp('@deepseek-ai/dsh-llm')
  const { default: SessionStore, SessionId } = await imp('@deepseek-ai/dsh-session')
  const { default: SystemPrompt } = await imp('@deepseek-ai/dsh-system-prompt')
  const { default: ToolRuntime } = await imp('@deepseek-ai/dsh-tools')
  const { default: AgentRegistry } = await imp('@deepseek-ai/dsh-agent')
  const { default: AgentLoop } = await imp('@deepseek-ai/dsh-agent-loop')
  const { default: AgentPresets } = await imp('@deepseek-ai/dsh-agent-presets')
  const { default: SkillService } = await imp('@deepseek-ai/dsh-skill')
  // dsh-skill-filesystem экспортирует плагин ИМЕНОВАННЫМИ полями (apply/inject/name), не default.
  const fsSkill = await imp('@deepseek-ai/dsh-skill-filesystem')
  const SkillFilesystem = { name: fsSkill.name, inject: fsSkill.inject, apply: fsSkill.apply }

  const fixtures = await mkdtemp(join(tmpdir(), 'dsh-kit-'))
  await cp(join(repoRoot, 'preset-dsh-dev'), join(fixtures, 'dsh-dev'), { recursive: true })
  await cp(join(repoRoot, 'template'), join(fixtures, 'template-test'), { recursive: true })
  // Глобальный корень скилов — сам репо (skills/ в корне), стабильно и без temp-копий:
  // в temp+baseUrl комбинации discovery молча пустел (гонка ватчера), репо-корень
  // проверяет тот же механизм: <dshHome>/skills отдаёт канон в каталог.
  // Как в фикстурах апстрима: mount-тест гоняем на ЛОКАЛЬНЫХ файлах-плагинах.
  await writeFile(join(fixtures, 'dsh-dev', 'agent.cordis.yml'),
    "- id: dsh-dev\n  name: './lib/index.js'\n- id: test-occupied\n  name: './plugins/test-occupied.js'\n")
  await mkdir(join(fixtures, 'dsh-dev', 'plugins'), { recursive: true })
  await writeFile(join(fixtures, 'dsh-dev', 'plugins', 'test-occupied.js'),
    "export default {\n  name: 'test-occupied',\n  inject: ['tools'],\n  apply(ctx) {\n    ctx.tools.register({\n      name: 'test_occupied',\n      description: 'Тестовый тул: занимает имя в агентском скоупе.',\n      parameters: { type: 'object', properties: {} },\n      output: { schema: { type: 'string' }, render(args, value) { return [{ type: 'text', text: value }] } },\n      async execute() { return 'occupied' },\n    })\n  },\n}\n")
  await writeFile(join(fixtures, 'template-test', 'agent.cordis.yml'), "- id: template-test\n  name: './lib/index.js'\n")

  const ctx = new Context()
  ctx.baseUrl = pathToFileURL(fixtures).href + '/'
  // Логгер обязателен: ошибки провайдеров скилов регистр глушит в "skipped" (warn).
  await ctx.plugin({
    name: 'kit-logger',
    apply(c) {
      c.provide('logger', {
        info: () => {}, warn: () => {}, error: () => {}, debug: () => {}, success: () => {},
      })
    },
  })
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SystemPrompt, { persona: '' })
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(SkillService)
  // dshHome — закоммиченная фикстура tests/fixture-home (смесь валидных скилов и
  // кейсов с несовпадением name≠папка): это стабильная конфигурация discovery,
  // проверенная многократно. watch: false — в тестах ватчер не нужен и мешает.
  await ctx.plugin(SkillFilesystem, { dshHome: join(repoRoot, 'tests', 'fixture-home'), agentsHome: join(repoRoot, 'tests', 'fixture-home', 'agents'), watch: false })
  await ctx.plugin(AgentPresets, { default: 'dsh-dev', roots: [{ path: fixtures, trust: 'user' }], includeUserRoot: false })

  const agentOn = async (sessionName, presetId) => {
    let agentCtx
    const handle = await ctx.agents.create({
      sessionId: SessionId(sessionName),
      setup: async (innerCtx) => { agentCtx = innerCtx; void await ctx.agentPresets.mount(innerCtx, presetId) },
    })
    return { agent: handle.agent, agentCtx }
  }
  const toolNames = (agent) => ctx.tools.schemas(agent).map((s) => s.name).sort()
  return { ctx, agentOn, toolNames, fixtures }
}

try {
  const { ctx, agentOn, toolNames, fixtures } = await bootHarness()

  const dev = await agentOn('sess-kit-dev', 'dsh-dev')
  const devTools = toolNames(dev.agent)
  check('mount dsh-dev: тул tool_collision_check зарегистрирован', devTools.includes('tool_collision_check'), devTools.join(','))
  check('mount dsh-dev: тестовый тул test_occupied в том же скоупе', devTools.includes('test_occupied'), devTools.join(','))

  const tpl = await agentOn('sess-kit-template', 'template-test')
  const tplTools = toolNames(tpl.agent)
  check('mount template-test: тул my_plugin_status зарегистрирован', tplTools.includes('my_plugin_status'), tplTools.join(','))

  // C. Поведение tool_collision_check в агентском скоупе (через ctx.tools.execute).
  const controller = new AbortController()
  const occupied = await ctx.tools.execute({
    callId: 'kit-c1', name: 'tool_collision_check',
    arguments: { name: 'test_occupied' }, agent: dev.agent, signal: controller.signal,
  })
  const occupiedText = extractText(occupied)
  check('поведение: занятое имя (test_occupied) → ЗАНЯТО', occupiedText.includes('ЗАНЯТО'), JSON.stringify(occupiedText.slice(0, 120)))

  const free = await ctx.tools.execute({
    callId: 'kit-c2', name: 'tool_collision_check',
    arguments: { name: 'free_name_xyz' }, agent: dev.agent, signal: controller.signal,
  })
  const freeText = extractText(free)
  check('поведение: свободное имя → свободно', freeText.includes('свободно'), JSON.stringify(freeText.slice(0, 120)))

  // D. Глобальный корень скилов отдаёт канон в каталог (host-слой, общий для агентов).
  // Ретрай: у файлового провайдера есть гонка инициализации ватчера на первом list().
  let skillNames = []
  for (let attempt = 0; attempt < 3 && !skillNames.includes('dsh-plugin-gotchas'); attempt++) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 150))
    const catalog = await ctx.skills.list()
    skillNames = catalog.map((s) => s.name).sort()
  }
  check('скилы: каталог содержит dsh-plugin-gotchas', skillNames.includes('dsh-plugin-gotchas'), skillNames.join(',') || '(пусто)')
  check('скилы: правило папка=name — валидные test-mini и var-d видны', skillNames.includes('test-mini') && skillNames.includes('var-d'), skillNames.join(',') || '(пусто)')
  check('скилы: правило папка=name — несовпадающие var-a/var-b/var-c молча пропущены', !skillNames.includes('var-a') && !skillNames.includes('var-b') && !skillNames.includes('var-c'), skillNames.join(',') || '(пусто)')

  await rm(fixtures, { recursive: true, force: true })
  if (typeof ctx.dispose === 'function') await ctx.dispose()
  else if (typeof ctx.scope?.dispose === 'function') await ctx.scope.dispose()
} catch (error) {
  check('живой mount/поведение/скилы: harness поднялся и проверки прошли', false, error instanceof Error ? error.message : String(error))
}

const failed = results.filter((r) => !r.ok).length
console.log(`\nИТОГ: ${results.length - failed}/${results.length} проверок пройдено`)
process.exit(failed > 0 ? 1 : 0)
