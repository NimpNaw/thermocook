import { test, expect } from '@playwright/test';

test.describe('Recherche', () => {
  test('taper "agneau" affiche un résultat, clique → fiche, retour → résultats restaurés', async ({ page }) => {
    await page.goto('/');

    const searchInput = page.getByPlaceholder(/envie de cuisiner/i);
    await searchInput.fill('agneau');

    // Overlay des résultats apparaît (debounce 300ms)
    await expect(page.getByText(/résultats pour "agneau"/i)).toBeVisible();

    // Cliquer sur la première recette dans les résultats
    const firstHit = page.locator('h3').first();
    await firstHit.waitFor({ state: 'visible' });
    await firstHit.click();

    await expect(page).toHaveURL(/\/recipes\/[^/]+$/);

    // Retour : on revient sur l'overlay de recherche avec la requête restaurée
    await page.locator('button').filter({ has: page.locator('svg.lucide-arrow-left') }).first().click();
    await expect(page.getByText(/résultats pour "agneau"/i)).toBeVisible();
  });

  test('"Effacer" la recherche masque l\'overlay', async ({ page }) => {
    await page.goto('/');
    await page.getByPlaceholder(/envie de cuisiner/i).fill('agneau');
    await expect(page.getByText(/résultats pour "agneau"/i)).toBeVisible();

    await page.getByRole('button', { name: /effacer/i }).click();
    await expect(page.getByText(/résultats pour "agneau"/i)).not.toBeVisible();
  });

  test('seuil 3 chars : 2 chars = pas d\'overlay, 3 chars = overlay s\'affiche', async ({ page }) => {
    await page.goto('/');
    const input = page.getByPlaceholder(/envie de cuisiner/i);

    // 2 chars : aucun overlay
    await input.fill('ag');
    await expect(page.getByText(/résultats pour/i)).not.toBeVisible();

    // 3 chars : overlay apparaît
    await input.fill('agn');
    await expect(page.getByText(/résultats pour "agn"/i)).toBeVisible();
  });

  test('FTS hybride : recherche multi-mots avec faute de frappe trouve quand même', async ({ page }) => {
    await page.goto('/');

    // "agnea" (sans le "u" final) → trigram + ILIKE doit matcher "agneau"
    await page.getByPlaceholder(/envie de cuisiner/i).fill('agnea');
    await expect(page.getByText(/résultats pour "agnea"/i)).toBeVisible();

    // Au moins un résultat doit s'afficher
    const results = page.locator('h3');
    await expect(results.first()).toBeVisible();
    const titles = await results.allInnerTexts();
    expect(titles.some(t => t.toLowerCase().includes('agneau'))).toBeTruthy();
  });
});
