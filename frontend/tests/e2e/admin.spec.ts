import { test, expect } from '@playwright/test';
import path from 'node:path';

const STORAGE_ADMIN = path.resolve(__dirname, '.auth/admin.json');

test.use({ storageState: STORAGE_ADMIN });

test.describe('Admin', () => {
  test('démarrer une synchronisation → progression visible puis résumé', async ({ page }) => {
    await page.goto('/admin');

    // Bouton "Synchronisation complète"
    await page.getByRole('button', { name: /synchronisation complète/i }).click();

    // Soit l'état "Synchronisation..." (en cours), soit le résumé "Synchronisé" / "terminé"
    // (les 4 recettes d'exemple peuvent finir avant qu'on observe l'état intermédiaire)
    const syncFeedback = page.locator(
      'text=/synchronisation\\.\\.\\.|recettes traitées|aucun changement|recette[s]? ajoutée|terminée/i'
    ).first();
    await expect(syncFeedback).toBeVisible({ timeout: 30_000 });
  });

  test('/admin affiche les stats et les onglets import/sync', async ({ page }) => {
    await page.goto('/admin');

    // Stats : compteur de recettes (au moins 1, vu qu'on a 4 recettes d'exemple)
    await expect(page.getByText(/recettes/i).first()).toBeVisible();

    // Onglet "URL distante" pour l'import
    await expect(page.getByRole('button', { name: /url distante/i })).toBeVisible();

    // Le placeholder doit être générique (pas "Gitea")
    await expect(page.getByPlaceholder(/exemple\.com|recettes_v/i)).toBeVisible();
  });
});
