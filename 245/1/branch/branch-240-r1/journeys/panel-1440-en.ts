import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { panelJourney } from './panel.ts'
export default (j: Journey) => panelJourney(j, { width: 1440, lang: 'en', row: 1 })
