import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { actions } from './actions.ts'
export default (j: Journey) => actions(j, { width: 1280, lang: 'en' })
