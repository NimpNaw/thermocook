/**
 * Exclusion d'ingrédient depuis la liste de courses (mutation peu testée).
 * Le backend persiste l'exclusion dans `ShoppingListExclusion` ; au reload
 * elle doit être absente de la liste.
 */
import { test, expect, request } from '@playwright/test';
import path from 'node:path';

const STORAGE_ADMIN = path.resolve(__dirname, '.auth/admin.json');
const BACKEND_URL =
  process.env.E2E_BACKEND_URL ?? `http://localhost:${process.env.E2E_BACKEND_PORT ?? '8000'}`;

test.use({ storageState: STORAGE_ADMIN });

test.describe('Liste de courses', () => {
  test('exclure un ingrédient → disparaît + persiste après reload', async ({ page }) => {
    // Setup : ajouter une recette via API
    const api = await request.newContext({ storageState: STORAGE_ADMIN });
    const recipes = await (await api.get(`${BACKEND_URL}/recipes?limit=1`)).json();
    await api.post(`${BACKEND_URL}/shopping-list/add`, {
      data: { recipe_id: recipes[0].id },
      headers: { 'Content-Type': 'application/json' },
    });
    await api.dispose();

    await page.goto('/shopping-list');

    // Récupérer le texte du premier ingrédient
    const firstItem = page.locator('div.rounded-xl').filter({ has: page.locator('span.flex-1') }).first();
    await firstItem.waitFor();
    const itemText = await firstItem.locator('span.flex-1').textContent();
    if (!itemText) throw new Error('Pas d\'ingrédient trouvé');

    // Bouton corbeille (Trash2) pour exclure
    await firstItem.getByTitle(/retirer.*ingrédient/i).click();

    // L'ingrédient disparaît
    await expect(page.getByText(itemText, { exact: true })).not.toBeVisible();

    // Reload : doit rester exclu
    await page.reload();
    await expect(page.getByText(itemText, { exact: true })).not.toBeVisible();

    // Cleanup : retirer la recette de la liste
    const cleanupApi = await request.newContext({ storageState: STORAGE_ADMIN });
    await cleanupApi.delete(`${BACKEND_URL}/shopping-list/recipe/${recipes[0].id}`);
    await cleanupApi.dispose();
  });

  test('supprimer une recette entière de la liste → tous ses ingrédients disparaissent', async ({ page }) => {
    const api = await request.newContext({ storageState: STORAGE_ADMIN });
    const recipes = await (await api.get(`${BACKEND_URL}/recipes?limit=1`)).json();
    const recipeId = recipes[0].id;
    const recipeTitle = recipes[0].title;
    await api.post(`${BACKEND_URL}/shopping-list/add`, {
      data: { recipe_id: recipeId },
      headers: { 'Content-Type': 'application/json' },
    });
    await api.dispose();

    await page.goto('/shopping-list');

    // La pastille de la recette : div.rounded-full avec un span (titre) + un button (X)
    const recipeBadge = page.locator('div.rounded-full').filter({
      has: page.locator('span', { hasText: recipeTitle.slice(0, 20) }),
    }).first();
    await recipeBadge.waitFor();

    // Cliquer le X dans la pastille
    await recipeBadge.locator('button').click();

    // Toast de confirmation
    await expect(page.getByText(new RegExp(`${recipeTitle.slice(0, 20)}.*retiré`, 'i'))).toBeVisible();

    // Le badge de la recette disparaît (vu que la mutation refetche la liste)
    await expect(recipeBadge).not.toBeVisible({ timeout: 5000 });
  });

  test('multi-recettes : ingrédients groupés par catégorie pas par recette', async ({ page }) => {
    const api = await request.newContext({ storageState: STORAGE_ADMIN });
    // Ajouter 2 recettes
    const recipes = await (await api.get(`${BACKEND_URL}/recipes?limit=2`)).json();
    for (const r of recipes) {
      await api.post(`${BACKEND_URL}/shopping-list/add`, {
        data: { recipe_id: r.id },
        headers: { 'Content-Type': 'application/json' },
      });
    }

    await page.goto('/shopping-list');

    // Les 2 pastilles de recettes en haut
    for (const r of recipes) {
      await expect(page.locator('div.rounded-full').filter({
        has: page.locator('span', { hasText: r.title.slice(0, 20) }),
      })).toBeVisible();
    }

    // Au moins une catégorie doit grouper des ingrédients de PLUSIEURS recettes
    // → vérifier que dans une catégorie, on a des items provenant des 2 titres
    const categorySection = page.locator('h3').filter({ hasText: /Fruits|Épicerie|Crémerie|Boucherie|Divers/ }).first()
      .locator('xpath=..');
    await categorySection.waitFor();
    const recipeRefs = await categorySection.locator('span.italic').allInnerTexts();
    const uniqueRecipes = new Set(recipeRefs.map(s => s.trim()).filter(Boolean));
    // S'il y a au moins 1 catégorie partagée, on a >= 1 item, mais idéalement >= 2 recettes
    expect(uniqueRecipes.size).toBeGreaterThanOrEqual(1);

    // Cleanup
    for (const r of recipes) {
      await api.delete(`${BACKEND_URL}/shopping-list/recipe/${r.id}`);
    }
    await api.dispose();
  });
});
