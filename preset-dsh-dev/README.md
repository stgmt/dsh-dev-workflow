# preset-dsh-dev — пресет «всё разом» для разработки DSH

Обёртка из `dsh-dev-workflow`: workflow-скил + хелпер проверки имён тулов.

## Установка

```bash
cp -r preset-dsh-dev ~/.dsh/.agent-presets/dsh-dev
# → новая сессия → выбрать пресет dsh-dev
```

## Что внутри

- `skills/dsh-plugin-gotchas/SKILL.md` — копия канона из `skills/` (тест-кит требует байт-в-байт). На машине ставь junction на `~/.dsh/skills/dsh-plugin-gotchas`, иначе nearest layer затенит глобальный канон;
- `lib/index.js` — тул `tool_collision_check`: проверка имени перед регистрацией тула;
- минимальная композиция: persona, pwsh/bash, fs, skills.

## Примечание

Скил глобален (`~/.dsh/skills/`) и работает без этого пресета; пресет — для тех,
кто хочет получить всё выбором одной строки в новой сессии.
