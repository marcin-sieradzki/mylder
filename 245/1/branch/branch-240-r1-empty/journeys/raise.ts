import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
/** Phone sheets: drag the panel's heading up, and to a middle height; where does it rest, and what does the header cover? */
export default async ({ page, step, expect }: Journey) => {
  await page.setViewportSize({ width: 360, height: 800 })
  const url = process.env.PANEL_URL ?? '/da?latest=now'
  await page.goto(url)
  const panel = page.getByRole('dialog').last()
  await expect(panel).toBeVisible({ timeout: 60000 })
  await page.waitForTimeout(4000)
  const report = async (label: string) => {
    const r = await page.evaluate(() => {
      const d = [...document.querySelectorAll('[role=dialog]')].pop() as HTMLElement
      const b = document.querySelector('[role=banner], header')!
      let hb = 0
      for (const el of [b, ...b.querySelectorAll('*')]) { const r = el.getBoundingClientRect(); if (r.width && r.height) hb = Math.max(hb, r.bottom) }
      for (const el of document.querySelectorAll('[role=status]')) { if (el.closest('[role=dialog]')) continue; const r = el.getBoundingClientRect(); if (r.width && r.top < 300) hb = Math.max(hb, r.bottom) }
      const covered: string[] = [], shown: string[] = []
      for (const el of d.querySelectorAll<HTMLElement>('h2, h3, dt, dd, p, button, .pn-Delay, .pn-VehicleDotLabel')) {
        const r = el.getBoundingClientRect()
        if (!r.width) continue
        const hit = document.elementFromPoint(r.left + Math.min(10, r.width / 2), r.top + r.height / 2)
        const mine = hit && (el === hit || el.contains(hit) || hit.contains(el))
        const t = `${el.tagName} "${(el.innerText || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').slice(0, 30)}" @${Math.round(r.top)}`
        if (r.top >= window.innerHeight) continue
        ;(mine ? shown : covered).push(t)
      }
      return { dialogTop: Math.round(d.getBoundingClientRect().top), headerBottom: Math.round(hb), covered, shown: shown.slice(0, 8) }
    })
    console.log(label, JSON.stringify(r))
    return r
  }
  await report('peek')
  await step('peek')
  const h = await panel.getByRole('heading').first().boundingBox()
  const drag = async (toY: number) => {
    const hh = (await panel.getByRole('heading').first().boundingBox())!
    await page.mouse.move(hh.x + 20, hh.y + hh.height / 2)
    await page.mouse.down()
    await page.mouse.move(hh.x + 20, toY, { steps: 12 })
    await page.mouse.up()
    await page.waitForTimeout(1000)
  }
  await drag(150)
  await report('dragged to 150')
  await step('raised')
  // try to scroll the sheet so its head comes out below the header
  await page.mouse.move(180, 600)
  await page.mouse.wheel(0, -600)
  await page.waitForTimeout(600)
  await report('raised, wheel up')
  await drag(700)
  await report('dragged back down')
  await drag(450)
  await report('dragged to 450')
  await step('middle')
}
