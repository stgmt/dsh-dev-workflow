// dsh-dev: хелпер имён тулов (готча №1: поздняя регистрация молча вытесняет раннюю).
export default {
  name: 'dsh-dev',
  inject: ['tools'],
  apply(ctx) {
    ctx.tools.register({
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
          // Готча: schemas() БЕЗ скоупа = глобальный вид (только root-регистрации) и
          // не видит тулы агента. Правильный скоуп — exec.agent (ToolRunContext.agent).
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
  },
}
