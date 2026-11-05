import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { panelJourney } from './panel.ts'
export default (j: Journey) => panelJourney(j, { width: undefined, lang: 'da', phone: true, row: 1 })
