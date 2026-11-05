import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { link } from './link.ts'
export default (j: Journey) => link(j, { width: 360, lang: 'da', phone: true })
