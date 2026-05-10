/**
 * Création de compte via le toggle "S'inscrire" de LoginPage,
 * puis vérification du premier login automatique.
 */
import { test, expect, request } from '@playwright/test';
import path from 'node:path';

const STORAGE_ADMIN = path.resolve(__dirname, '.auth/admin.json');
const BACKEND_URL =
  process.env.E2E_BACKEND_URL ?? `http://localhost:${process.env.E2E_BACKEND_PORT ?? '8000'}`;

test.describe('Inscription (register)', () => {
  test('register → premier login auto, avatar visible, cleanup en API admin', async ({ page }) => {
    const username = `e2e_reg_${Date.now()}`;
    const password = `pwd_${Date.now()}`;

    await page.goto('/login');
    // Toggle vers le mode inscription
    await page.getByRole('button', { name: /pas encore de compte/i }).click();
    await expect(page.getByText(/créer un compte/i)).toBeVisible();

    await page.getByPlaceholder(/utilisateur|username/i).fill(username);
    await page.getByPlaceholder(/mot de passe|password/i).fill(password);
    await page.getByRole('button', { name: /s'inscrire/i }).click();

    // Le register fait un login automatique → redirect /
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('button', { name: new RegExp(username, 'i') })).toBeVisible();

    // Cleanup : suppression via API admin
    const adminApi = await request.newContext({ storageState: STORAGE_ADMIN });
    const usersResp = await adminApi.get(`${BACKEND_URL}/admin/users`);
    const users = await usersResp.json();
    const created = users.find((u: { username: string }) => u.username === username);
    if (created) await adminApi.delete(`${BACKEND_URL}/admin/users/${created.id}`);
    await adminApi.dispose();
  });
});
