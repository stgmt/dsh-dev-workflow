// dsh-dev-workflow bundle entry: тулы + скил из собственной папки пакета.
// Скил доставляется БЕЗ копий: провайдер dsh-skill-filesystem регистрируется
// сам на <пакет>/skills/ (import.meta.url), так что canonical SKILL.md живёт
// в git и читается из установленного пакета напрямую.
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

export default {
  name: 'dsh-dev',
  async apply(ctx) {
    const tools = ctx.get('tools')
    if (tools !== undefined) {
      tools.register({
      name: 'tool_collision_check',
      description: 'Проверка имён тулов перед регистрацией: без аргументов — список имён, видимых модели; с name — свободно ли выбранное имя.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
      },
      output: {
        schema: { type: 'string' },
        render(args, value) { return [{ type: 'text', text: value }] },
      },
      async execute(args, exec) {
        try {
          // Готча: schemas() БЕЗ скоупа = глобальный вид; правильный скоуп — exec.agent.
          const scope = exec && exec.agent ? exec.agent : undefined
          const schemas = tools.schemas(scope)
          const names = schemas.map((s) => s.name).sort()
          const note = scope === undefined ? ' (внимание: agentless-вызов, виден только глобальный слой)' : ''
          if (args && typeof args.name === 'string' && args.name.length > 0) {
            return names.includes(args.name)
              ? 'имя "' + args.name + '" ЗАНЯТО — выбери другое'
              : 'имя "' + args.name + '" свободно' + note
          }
          return 'тулов: ' + names.length + note + '\n' + names.join('\n')
        } catch (error) {
          return 'ошибка: ' + (error && typeof error.message === 'string' ? error.message : String(error))
        }
      },
      })

      tools.register({
        name: 'dsh_retro',
        description: 'Ретро-чек Фазы 7 перед «готово»: чек-лист рефлексии + свежесть канона. С patterns:true — агрегат журнала (retro-missed/retro-called, последние пропуски). Вызывай перед «готово»; patterns — для ретроспективы привычки.',
        parameters: {
          type: 'object',
          properties: {
            patterns: { type: 'boolean', description: 'Вернуть агрегат журнала ретро вместо чек-листа.' },
          },
        },
        output: {
          schema: { type: 'string' },
          render(args, value) { return [{ type: 'text', text: value }] },
        },
        async execute(args) {
          if (args && args.patterns === true) {
            const out = ['RETRO-ПАТТЕРНЫ (журнал .dsh-dev-retro.jsonl):']
            try {
              const { readFile } = await import('node:fs/promises')
              const jp = join(dirname(fileURLToPath(import.meta.url)), '..', '.dsh-dev-retro.jsonl')
              const raw = await readFile(jp, 'utf8')
              const entries = raw.trim().split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
              const missed = entries.filter((e) => e.kind === 'retro-missed')
              const called = entries.filter((e) => e.kind === 'retro-called')
              const done = entries.filter((e) => e.kind === 'retro-done')
              out.push('ходов с работой: ' + (missed.length + done.length) + ' | ретро сделано: ' + done.length + ' | ПРОПУЩЕНО: ' + missed.length + ' | вызовов dsh_retro всего: ' + called.length)
              for (const m of missed.slice(-5)) out.push('пропуск: ' + m.ts + ' агент=' + m.agent + ' ход=' + m.turn + ' тулов=' + m.toolsUsed)
              if (missed.length > 0) out.push('', 'Повторяющиеся пропуски = кандидат в новый чекпоинт канона.')
            } catch {
              out.push('(журнал пуст или недоступен — ретро-событий ещё не было)')
            }
            return out.join('\n')
          }
          const lines = [
            'RETRO-ЧЕК (пройди по пунктам честно, до слов «готово»):',
            '1. Штатный механизм прежде самодельного? Что мог взять из доков/inspect/CLI?',
            '2. Что из сделанного станет граблёй завтра → запиши в канон СЕЙЧАС (готча → фаза → чек-поинт → репро).',
            '3. Инцидент или пинок пользователя → готча в канон в том же ходе.',
            '4. Поведение проверено ВЫЗОВОМ (не только mount-ом)? Артефакт прилагается?',
            '5. Обновил скил? Следующий агент знает как/когда/зачем это использовать?',
          ]
          try {
            const { stat, readFile } = await import('node:fs/promises')
            const skillPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'skills', 'dsh-plugin-gotchas', 'SKILL.md')
            const st = await stat(skillPath)
            const raw = await readFile(skillPath, 'utf8')
            lines.push('', 'канон: ' + skillPath)
            lines.push('правка: ' + st.mtime.toISOString() + ' | байт: ' + st.size + ' | фаз: ' + (raw.match(/^## Фаза/gm) || []).length)
          } catch {
            lines.push('(канон рядом с пакетом недоступен — скил доставлен другим путём)')
          }
          try {
            const { appendFile } = await import('node:fs/promises')
            const jp = join(dirname(fileURLToPath(import.meta.url)), '..', '.dsh-dev-retro.jsonl')
            await appendFile(jp, JSON.stringify({ ts: new Date().toISOString(), kind: 'retro-called' }) + '\n', 'utf8')
          } catch {}
          return lines.join('\n')
        },
      })
    }

    // ── Шаг 5: персистентное напоминание Фазы 7 в system prompt ───────────
    // Секция в зоне tool guidance (order 150) — её видит КАЖДЫЙ агент профиля
    // с бандлом, без расчёта на дисциплину модели.
    try {
      const sp = ctx.get('systemPrompt')
      if (sp !== undefined && typeof sp.section === 'function') {
        const dispose = sp.section({
          name: 'dsh-dev:phase7',
          order: 150,
          text: 'Завершая любую задачу разработки под DSH, вызови тул dsh_retro и пройди Фазу 7 (рефлексия): штатный механизм прежде самодельного; готча/инцидент → в канон в том же ходе; «обновил скил?». Не объявляй «готово» без ретро-чека.',
        })
        if (typeof ctx.effect === 'function' && typeof dispose === 'function') ctx.effect(() => dispose)
      }
    } catch {}

    // ── Автомат Фазы 7 ─────────────────────────────────────────────────────
    // tools/result: считаем вызовы тулов за ход и фиксируем факт dsh_retro.
    // agent/turn-stopping: тяжёлый ход (>=3 вызовов) без ретро → warn в лог
    // + строка в журнал (.dsh-dev-retro.jsonl рядом с пакетом).
    // Всё в try/catch: слушатели не имеют права ломать агентов.
    try {
      const turnStat = new Map() // agentKey -> { tools, retro }
      const journalPath = join(dirname(fileURLToPath(import.meta.url)), '..', '.dsh-dev-retro.jsonl')
      const appendJournal = async (entry) => {
        try {
          const { appendFile } = await import('node:fs/promises')
          await appendFile(journalPath, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n', 'utf8')
        } catch {}
      }
      ctx.on('tools/result', (exec) => {
        try {
          const key = String(exec?.agent?.id ?? 'agentless')
          const st = turnStat.get(key) ?? { tools: 0, retro: false }
          st.tools += 1
          if (exec?.toolName === 'dsh_retro') st.retro = true
          turnStat.set(key, st)
        } catch {}
      })
      ctx.on('agent/turn-stopping', async (payload) => {
        try {
          const key = String(payload?.agent?.id ?? 'agentless')
          const st = turnStat.get(key)
          turnStat.delete(key)
          if (!st || st.tools < 3) return
          await appendJournal({ kind: st.retro ? 'retro-done' : 'retro-missed', agent: key, turn: payload?.turn, toolsUsed: st.tools })
          if (!st.retro && ctx.logger?.warn) {
            ctx.logger.warn('[dsh-dev] Фаза 7: ход с ' + st.tools + ' вызовами тулов закрыт без dsh_retro — прогони ретро-чек перед «готово».')
          }
        } catch {}
      })
    } catch {}

    // Скил из пакета: суб-установка провайдера на собственную папку skills/.
    // Ошибки не роняют тулы — self-report через skills/change отсутствие.
    try {
      const fsSkill = await import('@deepseek-ai/dsh-skill-filesystem')
      const skills = ctx.get('skills')
      if (skills !== undefined && fsSkill && typeof fsSkill.apply === 'function') {
        const skillsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'skills')
        const sub = Object.create(null)
        sub.name = fsSkill.name
        sub.inject = fsSkill.inject
        sub.apply = fsSkill.apply
        // watch: false — обновления пакета идут через pnpm update / повторный
        // `dsh plugin add` (явная инвалидация), а ватчер здесь в тестовых
        // харнессах держит процесс. Глобальный корень (~/.dsh/skills) смотрит
        // свой провайдер с дефолтным watch.
        await ctx.plugin(sub, { customSkillDirs: [skillsDir], watch: false })
      }
    } catch {
      // Провайдер недоступен в этом деплое — скил доставляется пресетом/глобально.
    }
  },
}
