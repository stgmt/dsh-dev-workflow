// Шаблон host-плагина для пресета (dsh-dev-workflow/template).
// Замени TODO, переименуй, сохрани префикс имени тула (готча: имена тулов — глобальный ресурс).
//
// ВНИМАНИЕ (готча): в файлах пресета грузится ТОЛЬКО host-код.
// Client-половина (слоты/кнопки/карточки) в пресет-файлах НЕ работает —
// для UI нужен npm-пакет с полем "dsh.client" в package.json (см. README репозитория).

export default {
  name: 'my-plugin',
  inject: ['tools'],
  apply(ctx) {
    ctx.tools.register({
      name: 'my_plugin_status', // TODO: уникальный префикс
      description: 'TODO: что делает тул — это читает модель и решает, вызывать ли его.',
      parameters: { type: 'object', properties: {} },
      output: {
        schema: { type: 'string' },
        render(args, value) { return [{ type: 'text', text: value }] },
      },
      async execute(args, exec) {
        // TODO: бизнес-логика. Ошибки возвращай текстом (self-report), не кидай молча.
        return 'my-plugin работает'
      },
    })
  },
}
