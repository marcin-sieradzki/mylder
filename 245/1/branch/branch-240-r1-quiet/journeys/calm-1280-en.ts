import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { calm } from './nonecalm.ts'
export default async (j: Journey) => { await calm(j, { lang: 'en', width: 1280 }) }
