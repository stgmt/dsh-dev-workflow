// dsh-dev: хелпер имён тулов (готча №1: поздняя регистрация молча вытесняет раннюю).
export default {
  name: 'dsh-dev',
  inject: ['tools'],
  apply(ctx) {
    ctx.tools.register({
      name: 'tool_collision_check',
      description: 'Проверка имён тулов перед регистрацией: без аргументов — список всех видимых имён; с name — свободно ли выбранное имя.',
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
      async execute(args) {
        try {
          const schemas = ctx.tools.schemas()
          const names = schemas.map((s) => s.name).sort()
          if (args && typeof args.name === 'string' && args.name.length > 0) {
            return names.includes(args.name)
              ? 'имя "' + args.name + '" ЗАНЯТО — выбери другое'
              : 'имя "' + args.name + '" свободно'
          }
          return 'тулов: ' + names.length + '\n' + names.join('\n')
        } catch (error) {
          return 'ошибка: ' + (error && typeof error.message === 'string' ? error.message : String(error))
        }
      },
    })
  },
}
