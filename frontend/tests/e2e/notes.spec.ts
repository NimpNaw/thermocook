/**
 * Couvre le pattern try/IntegrityError de `add_note` (Phase 2 d'audit) :
 * écrire une note, sauvegarder, recharger la fiche, vérifier persistance.
 */
import { test, expect } from '@playwright/test';
import path from 'node:path';

const STORAGE_ADMIN = path.resolve(__dirname, '.auth/admin.json');

test.use({ storageState: STORAGE_ADMIN });

test.describe('Notes de recette', () => {
  test('écrire une note, sauvegarder, recharger → note persistée', async ({ page }) => {
    await page.goto('/recipes');
    await page.locator('h3').first().click();
    await expect(page).toHaveURL(/\/recipes\/[^/]+$/);

    const noteText = `Test e2e ${Date.now()}`;
    const textarea = page.getByPlaceholder(/astuces|notes|conseils|modifications/i);
    await textarea.fill(noteText);

    await page.getByRole('button', { name: /sauvegard/i }).click();
    await expect(page.getByRole('button', { name: /sauvegardé/i })).toBeVisible();

    // Reload : la note doit être présente
    await page.reload();
    await expect(textarea).toHaveValue(noteText);

    // Cleanup : vider la note
    await textarea.fill('');
    await page.getByRole('button', { name: /sauvegard/i }).click();
  });
});
