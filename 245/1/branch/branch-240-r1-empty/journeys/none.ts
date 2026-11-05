import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { none } from './nonecalm.ts'
export default async (j: Journey) => { await none(j, 'en'); await none(j, 'da') }
