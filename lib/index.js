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
        description: 'Ретро-чек Фазы 7 перед «готово»: чек-лист рефлексии + свежесть канона скила. Вызывай перед тем, как объявить задачу выполненной.',
        parameters: { type: 'object', properties: {} },
        output: {
          schema: { type: 'string' },
          render(args, value) { return [{ type: 'text', text: value }] },
        },
        async execute() {
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
          return lines.join('\n')
        },
      })
    }

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
