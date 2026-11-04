import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { spotlight } from './spot.ts'
export default (j: Journey) => spotlight(j, { lang: 'en', phone: true })
