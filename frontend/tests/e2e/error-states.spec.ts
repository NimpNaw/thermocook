/**
 * États d'erreur : recette inexistante, auto-logout sur 401.
 */
import { test, expect } from '@playwright/test';
import path from 'node:path';

const STORAGE_ADMIN = path.resolve(__dirname, '.auth/admin.json');

test.describe('États d\'erreur', () => {
  test('recette inexistante : ErrorMessage "Recette introuvable"', async ({ page }) => {
    await page.goto('/recipes/garbage_id_xxx');
    await expect(page.getByText(/recette introuvable|introuvable|erreur/i).first()).toBeVisible();
  });

  test('auto-logout sur 401 : token invalidé → état non connecté', async ({ browser }) => {
    // Démarrer connecté en admin
    const ctx = await browser.newContext({ storageState: STORAGE_ADMIN });
    const page = await ctx.newPage();
    await page.goto('/');
    await expect(page.getByRole('button', { name: /admin/i })).toBeVisible();

    // Invalider le cookie pour simuler une expiration de token côté serveur
    await ctx.clearCookies();

    // Provoquer une requête authentifiée — n'importe quel appel à /users/me
    // passera désormais par le `apiFetch` qui dispatch `thermocook:unauthorized`
    // → useAuth listener déclenche logout().
    await page.goto('/profile');
    // Le profile sans cookie déclenche getCurrentUser() → 401 → logout auto
    // → user devient null → Header affiche "Connexion"
    await expect(page.getByRole('button', { name: /connexion/i })).toBeVisible({ timeout: 15000 });

    await ctx.close();
  });
});
