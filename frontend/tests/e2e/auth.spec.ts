import { test, expect } from '@playwright/test';

test.describe('Authentification', () => {
  test('login admin → redirect vers / et avatar visible', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder(/utilisateur|username/i).fill('admin');
    await page.getByPlaceholder(/mot de passe|password/i).fill('changeme');
    await page.getByRole('button', { name: /se connecter|connexion/i }).click();

    await expect(page).toHaveURL('/');
    await expect(page.getByRole('button', { name: /admin/i })).toBeVisible();
  });

  test('logout depuis /profile ramène à un état non connecté', async ({ page }) => {
    // login d'abord
    await page.goto('/login');
    await page.getByPlaceholder(/utilisateur|username/i).fill('admin');
    await page.getByPlaceholder(/mot de passe|password/i).fill('changeme');
    await page.getByRole('button', { name: /se connecter|connexion/i }).click();
    await expect(page).toHaveURL('/');

    // logout via /profile
    await page.goto('/profile');
    await page.getByRole('button', { name: /se déconnecter/i }).click();

    // après logout : Header doit afficher "Connexion" au lieu du nom d'admin
    await expect(page.getByRole('button', { name: /connexion/i })).toBeVisible();
  });
});
