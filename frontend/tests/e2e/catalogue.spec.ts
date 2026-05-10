/**
 * Tri du catalogue (random/A-Z/Z-A) — feature core peu testée.
 */
import { test, expect } from '@playwright/test';

// Helper : compare le premier caractère brut, normalisé en minuscule.
// PostgreSQL utilise le collation du serveur (peut différer de `localeCompare`
// JS sur les accents/digrammes), mais le premier caractère reste cohérent.
// Note : `name_asc` PostgreSQL place les chiffres avant les lettres ('1' < 'A').
function firstChar(s: string): string {
  return (s[0] ?? '').toLowerCase();
}

test.describe('Tri du catalogue', () => {
  test('A→Z : premier titre commence par une lettre <= dernier titre', async ({ page }) => {
    await page.goto('/recipes?sort=name_asc');
    await page.locator('h3').first().waitFor();

    const titles = await page.locator('h3').allInnerTexts();
    expect(titles.length).toBeGreaterThan(1);
    const first = firstChar(titles[0]);
    const last = firstChar(titles[titles.length - 1]);
    expect(first <= last).toBeTruthy();
  });

  test('Z→A : premier titre commence par une lettre >= dernier titre', async ({ page }) => {
    await page.goto('/recipes?sort=name_desc');
    await page.locator('h3').first().waitFor();

    const titles = await page.locator('h3').allInnerTexts();
    expect(titles.length).toBeGreaterThan(1);
    const first = firstChar(titles[0]);
    const last = firstChar(titles[titles.length - 1]);
    expect(first >= last).toBeTruthy();
  });
});
