import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { raceRow } from './race-row.ts'
export default (j: Journey) => raceRow(j, { width: 1440, lang: 'da', row: 1 })
