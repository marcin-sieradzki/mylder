import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { panelJourney } from './panel.ts'
export default (j: Journey) => panelJourney(j, { width: 360, lang: 'en', phone: true, row: 1 })
