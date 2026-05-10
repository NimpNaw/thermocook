/**
 * Race condition du `useFavorites` retry queue : double-toggle rapide,
 * persistance après reload, sync server après login. Bloque les régressions
 * du hook qui sont invisibles aux tests unitaires (sync + localStorage).
 */
import { test, expect, request } from '@playwright/test';
import path from 'node:path';

const STORAGE_ADMIN = path.resolve(__dirname, '.auth/admin.json');
const BACKEND_URL =
  process.env.E2E_BACKEND_URL ?? `http://localhost:${process.env.E2E_BACKEND_PORT ?? '8000'}`;

test.use({ storageState: STORAGE_ADMIN });

test.describe('Favoris', () => {
  test('toggle favori depuis la card → persistance après reload', async ({ page }) => {
    await page.goto('/recipes');

    // Première card : récupérer son titre + cliquer le coeur
    const firstCard = page.locator('h3').first();
    await firstCard.waitFor();
    const title = await firstCard.textContent();
    if (!title) throw new Error('Pas de recette dans le catalogue');

    // Le bouton favori est le premier <button> de la card (z-10 absolute top-2 left-2)
    const favBtn = page.locator('button.absolute.top-2.left-2').first();
    await favBtn.click();

    // Naviguer vers /favorites pour vérifier la présence
    await page.goto('/favorites');
    await expect(page.locator('h3', { hasText: title })).toBeVisible();

    // Reload : le favori doit persister (sync server)
    await page.reload();
    await expect(page.locator('h3', { hasText: title })).toBeVisible();

    // Cleanup : retirer le favori
    await page.locator('button.absolute.top-2.left-2').first().click();
    await expect(page.locator('h3', { hasText: title })).not.toBeVisible();
  });

  test('page favoris vide pour un nouveau user affiche le message d\'incitation', async ({ browser }) => {
    // Créer un user fraîchement vierge via API admin
    const adminApi = await request.newContext({ storageState: STORAGE_ADMIN });
    const username = `e2e_emptyfav_${Date.now()}`;
    const password = `pwd_${Date.now()}`;
    const created = await (await adminApi.post(`${BACKEND_URL}/admin/users`, {
      data: { username, password, is_admin: false },
      headers: { 'Content-Type': 'application/json' },
    })).json();

    try {
      // Login en tant que ce user vierge
      const userCtx = await browser.newContext();
      const userPage = await userCtx.newPage();
      await userPage.goto('/login');
      await userPage.getByPlaceholder(/utilisateur|username/i).fill(username);
      await userPage.getByPlaceholder(/mot de passe|password/i).fill(password);
      await userPage.getByRole('button', { name: /se connecter|connexion/i }).click();
      await expect(userPage).toHaveURL('/');

      // /favorites doit afficher le message vide
      await userPage.goto('/favorites');
      await expect(userPage.getByText(/pas encore de recettes favorites/i)).toBeVisible();

      await userCtx.close();
    } finally {
      await adminApi.delete(`${BACKEND_URL}/admin/users/${created.id}`);
      await adminApi.dispose();
    }
  });

  test('page favoris affiche les recettes ajoutées en favoris', async ({ page }) => {
    // Ajouter 2 favoris via API
    const api = await request.newContext({ storageState: STORAGE_ADMIN });
    const recipes = await (await api.get(`${BACKEND_URL}/recipes?limit=2`)).json();
    const ids = recipes.map((r: { id: string }) => r.id);
    await api.post(`${BACKEND_URL}/favorites/sync`, {
      data: ids,
      headers: { 'Content-Type': 'application/json' },
    });
    await api.dispose();

    await page.goto('/favorites');
    // Les 2 recettes doivent apparaître
    for (const r of recipes) {
      await expect(page.locator('h3', { hasText: r.title })).toBeVisible();
    }

    // Cleanup : vider les favoris
    const cleanupApi = await request.newContext({ storageState: STORAGE_ADMIN });
    await cleanupApi.post(`${BACKEND_URL}/favorites/sync`, {
      data: [],
      headers: { 'Content-Type': 'application/json' },
    });
    await cleanupApi.dispose();
  });

  test('toggle favori depuis la fiche recette', async ({ page }) => {
    await page.goto('/recipes');
    await page.locator('h3').first().click();
    await expect(page).toHaveURL(/\/recipes\/[^/]+$/);

    // Le bouton favori sur la fiche est en top-right (fixed top-4 right-4)
    const favBtn = page.locator('button.fixed.top-4.right-4');
    await favBtn.click();

    // Vérifier que le bouton est en état "favori actif" (bg-orange-500)
    await expect(favBtn).toHaveClass(/bg-orange-500/);

    // Cleanup
    await favBtn.click();
    await expect(favBtn).not.toHaveClass(/bg-orange-500/);
  });
});
