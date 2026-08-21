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
          const schemas = ctx.tools.schemas(scope)
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
        await ctx.plugin(sub, { customSkillDirs: [skillsDir], watch: true })
      }
    } catch {
      // Провайдер недоступен в этом деплое — скил доставляется пресетом/глобально.
    }
  },
}
