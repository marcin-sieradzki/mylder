import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { spotlight } from './spot.ts'
export default (j: Journey) => spotlight(j, { width: 1440, lang: 'da' })
