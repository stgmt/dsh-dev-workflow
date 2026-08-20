---
name: dsh-plugin-gotchas
description: >-
  DeepSeek Harness plugin development playbook. Covers dynamic Cordis plugins,
  agent presets, npm/git bundles (dsh.bundle.patch, dsh plugin add), replacing
  shipped rows (compaction engines and other isolate singletons), global
  install across profiles, dump-config vs live session, and live proof.
  Load for any DSH plugin, preset, bundle, composition, compaction, or
  install work. Overlay shipped behavior into existing and future modes;
  never add a picker row. Do the proof in the same turn. Never wait for
  the user to ask to verify, dump-config, check UI, or check standard.
whenToUse: >-
  Use whenever creating, modifying, debugging, installing, or repairing
  anything in DeepSeek Harness — dynamic Cordis plugins (cordis_define,
  cordis_run, cordis_update, cordis_stop, cordis_inspect), npm/git bundles
  (dsh.bundle.patch, dsh plugin add, github:owner/repo), model Tools, Slot UI,
  Client-Host RPC, shell/subprocess/fs from plugin code, approvals, agent
  presets and compositions, replacing a shipped plugin row, compaction
  engines, global install across profiles/presets, overlaying a shipped
  row without a new picker mode. Follow the phases in order. Do NOT skip
  checkpoints. Do NOT wait for the user to ask about gotchas, proof,
  dump-config, UI, or standard. Do NOT add a new agent-mode picker row
  when the user wants install-and-forget.
---

# DSH Dev Workflow

Процесс разработки DeepSeek Harness. Иди по фазам, по порядку, отмечая каждый чек-поинт.
За точными паттернами API дополнительно грузи скил `cordis-plugin-development` (справочник);
этот файл — за **порядок работы и грабли**.

## Не ждать промптов

Пользователь не пишет «проверь», «а оно работает?», «dump-config», «а в UI?», «а в standard?».
Это твои чек-поинты той же фазы, в которой ты менял код.

Запрещено:
- сказать «готово» / «должно работать» / «после рестарта подхватит» без артефакта (команда + вывод);
- остановиться на unit-тестах, tsc, или «патч записан»;
- ждать аппрува на проверку — проверка не спрашивается, она выполняется.

`starting` / `awaiting-approval` у `cordis_run` — единственное исключение (жди steering, не выдумывай финал).

## Фаза 0 — Скоуп (до кода)

Реши и зафиксируй:
- ✅ Доставка — ровно один путь:
  - **динамика** (`cordis_define`) — умрёт с процессом, принадлежит сессии;
  - **user-пресет** (`copy` → другой id) — вечное для тех, кто выберет этот id;
  - **bundle** (npm/git, `dsh.bundle.patch` + `dsh plugin add`) — слой профиля; замена shipped-поведения без нового режима — overlay, Фаза 6.
- ✅ Платформа: host (файлы/команды/тулзы), client (UI/слоты) или обе?
- ✅ Плоскость живого провайдера: host composition или isolate-группа **пресета**. Смотри, где сейчас зарегистрирован сервис, и меняй **там**. Host dump не доказывает isolate.
- ✅ Аппрувы: client-пакеты требуют одобрения; одна галка = этот пакет, две = будущие версии; при policy `never` запрос висит в `awaiting-approval` — не жди и не повторяй.
- ✅ Дистрибуция: юзерам через пресеты — только host-код и скилы; **никаких карточек/UI** (см. «Дистрибуция» в приложении). Bundle может нести host-ряд; client UI — только npm-пакет с `dsh.client`.
- ✅ Имена тулов с уникальным префиксом — придумай до кода.
- ✅ «Поставил и забыл / все режимы / не переключать» = Фаза 6, overlay. **Запрещён** новый id в пикере (`copy('standard','smart-whatever')`). Юзер со своим режимом его не выберет.

## Фаза 1 — Разведка (до единой строки кода)

- ✅ `cordis_inspect_list` → `cordis_inspect_query` для КАЖДОГО сервиса/события/слота/builtin, который будешь использовать. Никогда по памяти.
- ✅ `Tool.listTools` — убедиться, что имена свободны (поздняя регистрация **молча вытесняет** раннюю).
- ✅ Дерево слотов (`Slots.listSubTree`): протокол (single/list/keyed/chain), занятые ключи, replaceRisk, ownerProps.
- ✅ Для пресетов: прочитать композицию целиком; если в контракте пустой `referencedTypes` — `.d.ts` установленных пакетов как второй источник правды.
- ✅ Для bundle/замены ряда: найти **все** живые `agent.cordis.yml` и host-слои, где стоит stock `name`. Не grep только репозиторий плагина.

## Фаза 2 — Код

- ✅ Plain JS в динамике (без import/require/TS/JSX), `React.createElement`; глобалы только из `Builtin.listBuiltins`.
- ✅ `ctx.x` только при `inject: ['x']`; иначе `ctx.get('x')` + проверка `undefined`.
- ✅ Каждый side effect обратим: `ctx.effect(() => disposer)`, `ctx.on`, disposer'ы сервисов.
- ✅ RPC: `harness.handle` / `host.call`, только lossless JSON, package-private.
- ✅ Обе половины пакета — всегда явно (см. готчу «update съедает половины»).
- ✅ Ошибки видимы: self-report (статус-тул или состояние, читаемое извне); никаких fire-and-forget.
- ✅ В пресете: настоящий `ToolDefinition` через `ctx.tools.register`; сервис-ряды — за isolate-realm.
- ✅ Проверка имён изнутри тула — только через `exec.agent` (см. «Проверка имён тулов изнутри тула»).
- ✅ Bundle: ESM `export default` плагина; `package.json` → `dsh.bundle.patch`; ряды в патче ссылаются на **имя пакета**, не на относительный путь.

## Фаза 3 — Запуск и приёмка (definition of done)

Нельзя закрыть фазу, пока нет доказательства **той плоскости, где фича живёт**.

| Доставка | Конфиг-доказательство | Поведение |
| --- | --- | --- |
| динамика | `cordis_inspect_self`: половины, handlers, пустые error/renderFailure | Смоук-вызовы, не только mount |
| user-пресет | `standingKeyFor(id)` + новая сессия **на этом id** | Список тулов и сам экшен в этой сессии |
| bundle / «на standard» | `dsh --profile <live> --dump-config` **и** `agent.cordis.yml` пресета, который монтирует UI (`standard` не затеняется) | Живой публичный метод фичи (не cousin, не unit) |

- ✅ `define` → `run`; `starting` ≠ успех — дождаться финала через steering.
- ✅ Client: в дереве слотов регистрант `dyn/<pluginId>` активен в нужном слоте; **видимость ≠ регистрация** — проверь глазами/у пользователя.
- ✅ Поведение проверено ВЫЗОВАМИ, а не только mount'ом: смоук-сценарии (свободно/занято, пусто/непусто) ловят то, что регистрация пропускает.
- ✅ Убрать за собой: лишнее stop/undefine, файлы-артефакты удалены.
- ✅ Если фича зовёт LLM: подними реальный `Context` через `await ctx.plugin(...)` (не выдумывай `ctx.start`). Мок модели должен advertise те же `model`/`reasoning.efforts`, что проверяешь, иначе рантайм кинет `UNSUPPORTED_REASONING_EFFORT`. Счётчик stream-вызовов должен доказать спеку (один вызов = one-shot stock, не «N чанков»).
- ✅ `dump-config` профиля показывает **host**. Isolate-сервис пресета там может выглядеть «выключенным», пока сессия на `standard` всё ещё крутит stock. Смотри оба.

## Фаза 4 — Фейл: протокол починки

- ✅ Сначала диагностика `cordis_inspect_self(pluginId, packageId)` — не гадать.
- ✅ Чинить **новым Package** (упавший не править), затем `update`; откат — `run` на current (упавший update сам не откатывает).
- ✅ Детектив сужением: зонды (cwd/env/сеть/обёртки) вместо перебора теорий; каждый зонд — короткий и с замером.
- ✅ Bundle «поставился, а поведение stock»: сначала `allowBuilds` / lifecycle, потом grep stock `name` в shipped YAML, потом плоскость (host vs isolate). Не начинай с новой теории.

## Фаза 5 — Вечное (пресет)

- ✅ `copy('standard', id)` → правки копии → `standingKeyFor(id)` → новая сессия на пресете.
- ✅ Свой код: `name: './plugins/x.js'` (относительный путь от папки пресета; ESM `export default`). Инлайн `js:`-ряды НЕ поддерживаются.
- ✅ Скилы пресета: `customSkillDirs` (в standard его нет — добавить, как в пресете cordis).
- ✅ Корни скилов: глобальные `~/.dsh/skills/`, проектные `<репо>/.dsh/skills/` — включаются по умолчанию.
- ✅ `copy()` **откажется** от id, который уже есть в любом root (`standard` / `code` / `minimal` / `cordis`). User-каталог с тем же id **не затеняет** shipped. `copy()` — только когда пользователь просит **новый** режим. Замена поведения у Standard/Creator/чужого пресета — Фаза 6, не копия.

## Фаза 6 — Bundle и замена shipped ряда

Официальный tutorial: `docs/user/develop/basic/publish.md` (bundle vs profile, слойность, git `prepare` + `allowBuilds`).

- ✅ Манифест: `dsh.bundle.patch` указывает на YAML-патч. Без этого поля `dsh plugin add` ставит npm-зависимость и **не активирует слой**.
- ✅ `dsh plugin --profile <name> add <pkg|github:owner/repo#ref>` = pnpm в `$DSH_HOME/profiles/<name>`. Первый add инициализирует профиль.
- ✅ Слойность (позже побеждает): bundle-патчи профиля по списку → `profiles/<name>/cordis.patch.yml` → `$DSH_HOME/cordis.patch.yml` → `--patch`. Патч **заменяет весь `config` ряда**, не мержит ключи.
- ✅ Патч **не переименовывает** ряд. Если `id` нашёлся, а `name` не совпал — loader пишет `name mismatch ... skipping` и идёт дальше. Нельзя написать `name: my-pkg` на чужой id. Для host-ряда: `disabled: true` на stock + `insert` нового. Для isolate-синглтона: overlay `name:` внутри группы, не второй провайдер на host. YAML-rewrite ест CRLF и оба стиля кавычек; после записи — grep файла.
- ✅ Изолированный синглтон (пример: `ctx.compaction` в группе пресета с `isolate: { compaction: true }`) живёт **в пресете сессии**, не в host dump. Замена = смена `name` **внутри этой группы**. Host-insert второго провайдера того же сервиса — ошибка плоскости.
- ✅ «Поставил и забыл / все найденные и будущие режимы»:
  1. bundle в каждый профиль — без нового пункта в пикере;
  2. host-ряд = overlay-плагин (boot + перед `mount`/`copy`/`recompose` + watch файлов), не сам синглтон;
  3. overlay пишет stock `name:` → наш во **всех** `agent.cordis.yml`, где capability уже есть (shipped `standard`/`code`/`cordis` и user-копии). Пресет без этой capability не трогать;
  4. будущий `copy('standard', 'mine')` наследует уже переписанный YAML; overlay перед copy/mount ловит апгрейд DSH, который заливает shipped stock обратно;
  5. закоммитить `dist/`. `prepare`/`postinstall` могут быть срезаны pnpm — overlay на старте DSH и есть инсталлер;
  6. leftover-пресет в пикере с нашим fingerprint — снести, это баг доставки.
- ✅ pnpm ≥10 режет lifecycle git-зависимости без `allowBuilds`. Пакет «стоит» ≠ overlay на месте. Доказательство: live `agent.cordis.yml` выбранного режима + dump-config host-ряда overlay.
- ✅ Не патчь случайный checkout `~/deepseek-harness`, если цель — установленный dsh. Корни: roster `agentPresets.list()`, npm global, `profiles/node_modules/@deepseek-ai/dsh`, `$DSH_HOME/.agent-presets`.

---

## Приложение: справочник готч

### Имена тулов — глобальный ресурс процесса
Поздняя регистрация молча вытесняет раннюю; пресетовские тулы вернутся только после рестарта процесса. Всегда `Tool.listTools` перед выбором имени, свои — с префиксом.

### Проверка имён тулов ИЗНУТРИ тула
`ctx.tools.schemas()` без скоупа = **глобальный вид** (только root-регистрации) — из agentless-вызова модель-видимые тулы в него НЕ попадают, и collision-check соврёт «свободно» про занятое имя. Правильно: `ctx.tools.schemas(exec.agent)` — `ToolRunContext.agent` и есть ключ скоупа («агент, от чьего имени выполняется вызов»). Без агента (agentless) — честная деградация: глобальный вид + пометка, что это неполный список.

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

### Тестирование DSH (апстрим-паттерн)
Официальные тесты — vitest + живой Context (см. `deepseek-harness/packages/preset/agent-presets/tests/mount.spec.ts`). Ключевые грабли переноса:
- `Context` — **именованный** экспорт `@deepseek-ai/cordis` (не default).
- Буст: `Context` → `Loader` (+ `ctx.loader.builtins.include = Include`) → `LlmRuntime` → `SessionStore` → `SystemPrompt({ persona: '' })` → `ToolRuntime` → `AgentRegistry` → `AgentLoop({ agents: [] })` → `AgentPresets({ default, roots: [{ path, trust }], includeUserRoot: false })`.
- Монтаж пресета: `ctx.agents.create({ sessionId, setup: agentCtx => ctx.agentPresets.mount(agentCtx, id) })`; ассерты — `ctx.tools.schemas(agent)`.
- Фикстуры — **только локальные файлы-плагины** (`'./lib/index.js'`): bare npm-ряды из temp-каталога не резолвятся («Cannot find package … imported from <tmp>»).
- YAML композиций — диалект загрузчика: `new yaml.Type('tag:yaml.org,2002:js', { kind: 'scalar', resolve: s => typeof s === 'string', construct: s => ({ __jsExpr: s }) })` + `yaml.JSON_SCHEMA.extend(type)`; без этого `!!js` не парсится.
- `ctx.dispose` в этой версии отсутствует — teardown толерантный (`typeof ctx.scope?.dispose === 'function'`).
- Тестируй **поведение** (смоук-вызовы: свободно/занято, пусто/непусто), а не только mount: `tc_check('pwsh')` на agentless-скоупе соврал «СВОБОДНО» — mount-тест этого не видит.
- Live-зонды из динамического плагина НЕ годятся для скоуп-зависимых реестров: `skills.list()` из agentless-фибера видит пустой слой, а `tools.schemas(exec.agent)` — не тот вид. Проверяй через тест-харнесс (`agentPresets.mount` + `ctx.tools.execute({..., agent})`) или в живой сессии на пресете.
- Скилы в харнесс-тестах: поднимай `dsh-skill` (реестр, default-экспорт) + `dsh-skill-filesystem` (плагин экспортируется ИМЕНОВАННЫМИ полями `apply`/`inject`/`name`, НЕ default!). Логгер обязателен — ошибки провайдеров реестр глушит в «skipped» без следа. Используй закоммиченную фикстуру со смесью валидных и несовпадающих записей + `watch: false`.

### Скилы (discovery, dsh-skill-filesystem)
- **Хот-релоад РАБОТАЕТ**: скил, созданный или изменённый в живом корне, появляется в каталоге в тот же момент (chokidar-ватчер → инвалидация реестра). Проверено вживую: новый файл в `~/.dsh/skills` подхватился без рестарта в том же ходе, и `dsh-plugin-gotchas` ожил сразу после починки шапки. Если скил не появился — это НЕ кэш, а discovery (см. ниже).
- **Frontmatter должен быть валидным YAML без `: ` в plain-скалярах**: колонка-пробел в значении (например, «…in DeepSeek Harness: dynamic…») молча ломает парсинг шапки → скил пропадает из каталога без ошибок. Лечение: block-scalar `>-` для `description`/`whenToUse`. Проверяй парсинг шапки (тест-кит ловит этот класс багов).
- **Имя папки скила ОБЯЗАНО совпадать с `name` в шапке SKILL.md** — иначе скил МОЛЧА пропускается (без ошибок и warning'ов; проверено: `var-d` виден, `var-a/b/c` с name≠папке — нет).
- Шапка: `name` + `description` обязательны; `whenToUse` — опционально; имя — kebab-case `[a-z0-9]+(-[a-z0-9]+)*`.
- Корни: `<dshHome>/skills` (в нём папка `.system` пропускается), `<agentsHome>/skills`, проектные `<проект>/.dsh/skills` и `<проект>/.agents/skills` (только когда передан cwd), `customSkillDirs`, `bundledSkillDir`.
- В пресете стандартный ряд `skill-filesystem` НЕ имеет `customSkillDirs` — добавь, чтобы папка `skills/` пресета подхватилась.
- Копия `SKILL.md` в `customSkillDirs` пресета **затеняет** `~/.dsh/skills` (nearest layer wins). Не копируй канон в пресет: junction на глобальный корень или не клади скил в пресет вообще.
- Grok/Codex/Claude **не** сканируют `~/.dsh/skills`. Этот скил должен быть ещё и в их user-корне (junction), иначе агент его не загрузит и снова будет ждать проверочных промптов.

### Дистрибуция (что кому достаётся)
- Пресет-клон доставляет: host-код (тулы) + скилы. **Никаких карточек/кнопок/UI**: client-модули грузятся только из npm-пакета с полем `dsh.client`, установленного в деплоймент.
- Юзерам через пресеты карточки ставить НЕЛЬЗЯ — они просто не доедут. Продукту нужен UI? Это отдельный дистрибутив (npm-публикация или git-установка в деплоймент), не пресет.

### Цифры и проверки
- Сверяй результат независимым инструментом; живой репозиторий меняется — только одновременные замеры.
- После каждого update читай диагностику, даже если «по ощущениям» работает.
- Конфиг-доказательство и поведение-доказательство — разные вещи. Оба обязательны. YAML без вызова фичи = не доказано.

### Жизнь плагинов
Динамические плагины умирают с процессом и принадлежат сессии. Вечное для выбранного id — пресет (Фаза 5). Замена дефолтного shipped поведения без нового пункта в пикере — bundle + overlay (Фаза 6). Скилы: глобально `~/.dsh/skills/`; в пресете не копировать канон.
