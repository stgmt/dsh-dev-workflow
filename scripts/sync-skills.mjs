// Синк канонического скила во все копии. Канон — ровно один файл в git:
//   <repo>/skills/dsh-plugin-gotchas/SKILL.md
// Всё остальное — производные копии, которые НЕ правим руками:
//   - <repo>/preset-dsh-dev/skills/...            (пресет-пакет в репо)
//   - <dshHome>/skills/...                        (глобальный корень DSH)
//   - <dshHome>/.agent-presets/dsh-dev/skills/... (установленный пресет)
//   - <dshHome>/.agent-presets/reels-dsh/skills/… (установленный пресет)
//   - <repo>/tests/fixture-home/skills/...        (тестовая фикстура)
// CLI:  node scripts/sync-skills.mjs [repoRoot] [dshHome]
// API:  import { syncSkills } from './scripts/sync-skills.mjs'
// Правка канона + синк = живые сессии подхватывают изменения хот-релоадом
// (скил-ватчер DSH следит за корнями и инвалидирует каталог).
import { copyFile, mkdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const defaultRepoRoot = resolve(join(dirname(fileURLToPath(import.meta.url)), '..'))
const defaultDshHome = process.env.DSH_HOME ?? join(process.env.USERPROFILE ?? '', '.dsh')

export function skillTargets(repoRoot = defaultRepoRoot, dshHome = defaultDshHome) {
  const name = 'dsh-plugin-gotchas'
  return [
    ['repo/preset-dsh-dev', join(repoRoot, 'preset-dsh-dev', 'skills', name, 'SKILL.md')],
    ['global ~/.dsh/skills', join(dshHome, 'skills', name, 'SKILL.md')],
    ['preset dsh-dev', join(dshHome, '.agent-presets', 'dsh-dev', 'skills', name, 'SKILL.md')],
    ['preset reels-dsh', join(dshHome, '.agent-presets', 'reels-dsh', 'skills', name, 'SKILL.md')],
    ['tests/fixture-home', join(repoRoot, 'tests', 'fixture-home', 'skills', name, 'SKILL.md')],
  ]
}

export async function syncSkills({ repoRoot = defaultRepoRoot, dshHome = defaultDshHome, log = () => {} } = {}) {
  const canon = join(repoRoot, 'skills', 'dsh-plugin-gotchas', 'SKILL.md')
  const results = []
  for (const [label, target] of skillTargets(repoRoot, dshHome)) {
    await mkdir(dirname(target), { recursive: true })
    await copyFile(canon, target)
    results.push({ label, target })
    log(`SYNC  ${label} -> ${target}`)
  }
  return results
}

export async function isCanon(path) {
  // Защита от правки копии вместо канона: канон — только <repo>/skills/.
  return resolve(path) === resolve(join(defaultRepoRoot, 'skills', 'dsh-plugin-gotchas', 'SKILL.md'))
}

if (process.argv[1] && import.meta.url === new URL('file:///' + process.argv[1].replace(/\\/g, '/')).href) {
  const [, , repoArg, homeArg] = process.argv
  await syncSkills({ repoRoot: repoArg ? resolve(repoArg) : defaultRepoRoot, dshHome: homeArg ? resolve(homeArg) : defaultDshHome, log: console.log })
}
