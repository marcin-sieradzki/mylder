import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { panelJourney } from './panel.ts'
export default (j: Journey) => panelJourney(j, { width: 1000, lang: 'da', row: 0 })
