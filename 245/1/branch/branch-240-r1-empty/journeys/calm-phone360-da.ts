import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { calm } from './nonecalm.ts'
export default async (j: Journey) => { await j.page.setViewportSize({ width: 360, height: 800 }); await calm(j, { lang: 'da', phone: true }) }
