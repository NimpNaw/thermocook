/**
 * HomePage : sections saisonnalité + suggestions aléatoires.
 */
import { test, expect } from '@playwright/test';

test.describe('HomePage', () => {
  test('affiche les sections "C\'est la saison !" et "Parcourir"', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: /c'est la saison/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /parcourir/i })).toBeVisible();

    // Le contenu de la section saisonnalité est soit des cards, soit un message
    // (selon le mois et les recettes en BDD) — on vérifie qu'au moins l'un est présent
    const seasonalSection = page.getByRole('heading', { name: /c'est la saison/i })
      .locator('xpath=ancestor::section[1]');
    const hasCards = await seasonalSection.locator('h3').count();
    const hasEmptyMsg = await seasonalSection.locator('p', { hasText: /aucune recette de saison/i }).count();
    expect(hasCards + hasEmptyMsg).toBeGreaterThan(0);
  });

  test('cliquer une catégorie de la section "Parcourir" → /recipes filtré', async ({ page }) => {
    await page.goto('/');

    // Cliquer la première catégorie de la section "Parcourir"
    const browseSection = page.getByRole('heading', { name: /parcourir/i })
      .locator('xpath=ancestor::section[1]');
    const firstCategoryButton = browseSection.locator('button, a').first();
    await firstCategoryButton.click();

    // Doit naviguer vers /recipes avec un ?category=
    await expect(page).toHaveURL(/\/recipes\?category=/);
  });
});
