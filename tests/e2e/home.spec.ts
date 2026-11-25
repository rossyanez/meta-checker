import { expect, test } from '@playwright/test'

test('home page shows a URL box and a Check button', async ({ page }) => {
  await page.goto('/tools/meta-checker')

  await expect(page.getByRole('heading', { name: 'Meta Checker' })).toBeVisible()
  await expect(page.getByLabel(/url/i)).toHaveAttribute('type', 'url')
  await expect(page.getByRole('button', { name: 'Check' })).toBeVisible()
})
