---
name: dsh-plugin-gotchas
description: DeepSeek Harness development workflow and gotchas playbook — a six-phase process with checkpoints for creating, modifying, debugging, and repairing dynamic Cordis Plugins, agent presets, and compositions. Load automatically for any DSH development work and follow the phases in order.
whenToUse: Use whenever creating, modifying, debugging, or repairing anything in DeepSeek Harness: dynamic Cordis plugins (cordis_define/cordis_run/cordis_update/cordis_stop/cordis_inspect), model Tools, Slot UI and tool cards, Client↔Host RPC, shell/subprocess/fs calls from plugin code, approvals and version rollback, agent presets and compositions (copy/edit/validate). Follow the phases in order; do NOT skip checkpoints and do NOT wait for the user to ask about gotchas.
---

# DSH Dev Workflow

Процесс разработки DeepSeek Harness. Иди по фазам, по порядку, отмечая каждый чек-поинт.
За точными паттернами API дополнительно грузи скил `cordis-plugin-development` (справочник);
этот файл — за **порядок работы и грабли**.

## Фаза 0 — Скоуп (до кода)

Реши и зафиксируй:
- ✅ Временное (динамический плагин: умрёт с процессом, принадлежит сессии) или вечное (пресет)?
- ✅ Платформа: host (файлы/команды/тулзы), client (UI/слоты) или обе?
- ✅ Аппрувы: client-пакеты требуют одобрения; одна галка = этот пакет, две = будущие версии; при policy `never` запрос висит в `awaiting-approval` — не жди и не повторяй.
- ✅ Имена тулов с уникальным префиксом — придумай до кода.

## Фаза 1 — Разведка (до единой строки кода)

- ✅ `cordis_inspect_list` → `cordis_inspect_query` для КАЖДОГО сервиса/события/слота/builtin, который будешь использовать. Никогда по памяти.
- ✅ `Tool.listTools` — убедиться, что имена свободны (поздняя регистрация **молча вытесняет** раннюю).
- ✅ Дерево слотов (`Slots.listSubTree`): протокол (single/list/keyed/chain), занятые ключи, replaceRisk, ownerProps.
- ✅ Для пресетов: прочитать композицию целиком; если в контракте пустой `referencedTypes` — `.d.ts` установленных пакетов как второй источник правды.

## Фаза 2 — Код

- ✅ Plain JS в динамике (без import/require/TS/JSX), `React.createElement`; глобалы только из `Builtin.listBuiltins`.
- ✅ `ctx.x` только при `inject: ['x']`; иначе `ctx.get('x')` + проверка `undefined`.
- ✅ Каждый side effect обратим: `ctx.effect(() => disposer)`, `ctx.on`, disposer'ы сервисов.
- ✅ RPC: `harness.handle` / `host.call`, только lossless JSON, package-private.
- ✅ Обе половины пакета — всегда явно (см. готчу «update съедает половины»).
- ✅ Ошибки видимы: self-report (статус-тул или состояние, читаемое извне); никаких fire-and-forget.
- ✅ В пресете: настоящий `ToolDefinition` через `ctx.tools.register`; сервис-ряды — за isolate-realm.

## Фаза 3 — Запуск и приёмка (definition of done)

- ✅ `define` → `run`; `starting` ≠ успех — дождаться финала через steering.
- ✅ `cordis_inspect_self`: `hasHostHalf`/`hasClientHalf` совпадают с задумкой, `runtime.host.handlers` на месте, `host.error`/`client.error`/`renderFailure` пусты.
- ✅ Client: в дереве слотов регистрант `dyn/<pluginId>` активен в нужном слоте; **видимость ≠ регистрация** — проверь глазами/у пользователя.
- ✅ Убрать за собой: лишнее stop/undefine, файлы-артефакты удалены.

## Фаза 4 — Фейл: протокол починки

- ✅ Сначала диагностика `cordis_inspect_self(pluginId, packageId)` — не гадать.
- ✅ Чинить **новым Package** (упавший не править), затем `update`; откат — `run` на current (упавший update сам не откатывает).
- ✅ Детектив сужением: зонды (cwd/env/сеть/обёртки) вместо перебора теорий; каждый зонд — короткий и с замером.

## Фаза 5 — Вечное (пресет)

- ✅ `copy('standard', id)` → правки копии → `standingKeyFor(id)` → новая сессия на пресете.
- ✅ Свой код: `name: './plugins/x.js'` (относительный путь от папки пресета; ESM `export default`). Инлайн `js:`-ряды НЕ поддерживаются.
- ✅ Скилы пресета: `customSkillDirs` (в standard его нет — добавить, как в пресете cordis).
- ✅ Корни скилов: глобальные `~/.dsh/skills/`, проектные `<репо>/.dsh/skills/` — включаются по умолчанию.

---

## Приложение: справочник готч

### Имена тулов — глобальный ресурс процесса
Поздняя регистрация молча вытесняет раннюю; пресетовские тулы вернутся только после рестарта процесса. Всегда `Tool.listTools` перед выбором имени, свои — с префиксом.

### Динамический плагин — agentless
- Нет сессии → нет воркспейса: относительные пути резолвятся против `sandboxPolicy.workspaceRoot` (fallback-корень = `process.cwd()` процесса — может быть ДРУГИМ репозиторием; наш файл уехал в соседний).
- Нет управляемых `DSH_*` фактов — CLI, которым они нужны, деградируют; передавай через `dshEnv`.
- Слушатели событий слышат **весь процесс**: фильтруй по `exec.agent`. В пресете — наоборот (скоуп агента).
- Плагин принадлежит сессии: чужая сессия его не видит/не управляет, `@pluginId` недоступен («belongs to another Session»). Чужой плагин виден в дереве слотов как `dyn/<pluginId>`.

### События (хуки)
`emit` — только наблюдение; `waterfall` — можно менять/отклонять, но **верни `next()`**, иначе цепочка оборвётся на тебе (иногда это цель: `'ask'` в `tools/pre-execute`). Ошибки слушателей изолированы — кривой логгер не уронит инструменты.

### Валидация defineTool
Ключ `required` в `parameters` либо отсутствует (параметр опционален), либо `true`. `required: false` — ошибка запуска.

### Версии и аппрувы
- `starting` ≠ успех: финал приходит через steering.
- **Update заменяет весь пакет**: забыл host-код в новой версии — RPC-обработчики исчезли. Перечисляй обе половины; сверяй `hasHostHalf`/`handlers`.
- Упавший update не восстанавливает старую версию: явный `run` на current.
- `currentPackageId` меняется только при полном успехе.

### Shell из плагина (Windows)
1. Прямой `npx` может висеть вечно: confined-песочница блокирует named pipes (docker/WSL). Лечение: явная `sandboxPolicy: { mode: 'danger-full-access', workspaceRoot }` в `ShellExecRequest`.
2. `npx.ps1` блокируется execution policy: используй `npx.cmd` в обёртке `powershell.exe -NoProfile -NonInteractive -Command "..."`.
3. Нет `DSH_*` → передавай `dshEnv: { DSH_WEB_URL, DSH_HOME, DSH_SHELL: '1' }`.
4. Исполнитель кэппит `timeoutMs` в `run()`; для долгих — `start()` + `proc.done` + инкрементальный `readOutput()`; при `lossy` полный текст в `spillPath` через `fs`.
5. Вывод CLI может быть в **stderr** — читай оба потока; JSON из смеси вытаскивай `/\{[\s\S]*\}/`.

### Слоты и карточки
- Additive list-слоты предпочтительны. `sidebar.footer.action` тесен и перекрывается — для кнопок со статусом бери `conversation.input.dock` или `composer.dock`.
- Слот даёт место, видимость — твой дизайн: в rail-режиме `props.wide === false` рисуй заметную пилюлю.
- `tool.call.toolview`: key = имя тула; свободный ключ — аддитивно, занятый — замена штатной карточки. Результат — из `props.block.content` (текстовые блоки), live-объекты не сериализовать.
- `tool.view.cordis` key `'self'` — интерактив в карточке `cordis_run`. single-слоты с `replaceRisk: shadows-shipped-ui` не занимать без нужды.

### Цифры и проверки
- Сверяй результат независимым инструментом; живой репозиторий меняется — только одновременные замеры.
- После каждого update читай диагностику, даже если «по ощущениям» работает.

### Жизнь плагинов
Динамические плагины умирают с процессом и принадлежат сессии. Вечное — пресет (Фаза 5). Скилы: глобально `~/.dsh/skills/`, проектно `<репо>/.dsh/skills/`, в пресете — `customSkillDirs`.
