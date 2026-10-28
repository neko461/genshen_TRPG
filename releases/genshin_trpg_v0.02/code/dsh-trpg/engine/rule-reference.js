import { BUILD_SCHEMES, RECOVERY, INDEPENDENT_SOLO, MAX_POSITIVE_REDUCTION_RATIO } from './rules.js'
import { CAPS, DIFFICULTY } from './dice.js'
import { listEnemies } from './enemies.js'
import { ARTIFACT_SETS, listWeapons } from './gear.js'

// Only materialize the selected topic. The legacy all shape is preserved.
export function ruleReference(scope = 'all', version) {
  const topics = {
    creation: () => ({ schemes: BUILD_SCHEMES }),
    checks: () => ({ caps: CAPS, difficulty: DIFFICULTY }),
    combat: () => ({ enemies: listEnemies(), independentSolo: INDEPENDENT_SOLO, maxPositiveReductionRatio: MAX_POSITIVE_REDUCTION_RATIO }),
    equipment: () => ({ artifactSets: ARTIFACT_SETS, weapons: listWeapons() }),
    recovery: () => ({ recovery: RECOVERY }),
  }
  if (scope !== 'all' && !Object.hasOwn(topics, scope)) throw new Error('scope 须为 all/creation/checks/combat/equipment/recovery')
  return { version, ...(scope === 'all' ? Object.assign({}, ...Object.values(topics).map(read => read())) : topics[scope]()) }
}
