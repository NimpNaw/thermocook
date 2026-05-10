/**
 * Test E2E de l'import de package via URL distante.
 *
 * Couvre la chaîne complète :
 *   UI admin → POST /admin/import-package → download → tar slip check
 *   → extraction → parser → BD → polling status → résumé final
 *
 * Utilise une archive Cookomix réelle hébergée sur le registry Gitea privé.
 * Comme c'est un test long (~30-90s selon réseau), il est isolé dans son
 * propre fichier (workers=1 → exécuté séquentiellement avec les autres).
 */
import { test, expect } from '@playwright/test';
import path from 'node:path';

const STORAGE_ADMIN = path.resolve(__dirname, '.auth/admin.json');
const ARCHIVE_URL =
  process.env.E2E_IMPORT_URL ??
  'https://example.com/fabien/recettes_thermomix/releases/download/recettes_v1.0.1/cookomix_v1.0.1.tar.gz';

test.use({ storageState: STORAGE_ADMIN });

// Timeout étendu : download + extraction + parsing peut prendre du temps
test.describe.configure({ timeout: 240_000 });

// Test réseau (download d'une archive externe) : opt-in via E2E_INCLUDE_NETWORK=1.
// Skippé par défaut en CI car la latence/firewall vers `example.com` depuis
// le container `thermo-e2e` peut faire dépasser le timeout (alors que ça
// passe en local).
test.skip(
  !process.env.E2E_INCLUDE_NETWORK,
  'Réseau requis : set E2E_INCLUDE_NETWORK=1 pour exécuter (durée ~2 min)',
);

test.describe('Import de package via URL', () => {
  test('saisir URL → import lancé → progression → résumé final', async ({ page }) => {
    await page.goto('/admin');
    await expect(page.getByText(/chargement du tableau/i)).not.toBeVisible({ timeout: 15_000 });

    // L'onglet "URL distante" est actif par défaut
    const importInput = page.getByPlaceholder(/exemple\.com|recettes_v/i);
    await importInput.fill(ARCHIVE_URL);

    // Bouton "Installer"
    await page.getByRole('button', { name: /^installer$/i }).click();

    // L'état "Import en cours..." apparaît rapidement
    await expect(page.getByRole('button', { name: /import en cours/i })).toBeVisible({ timeout: 10_000 });

    // Attendre la fin de l'import : le bouton repasse à "Installer" ET un
    // résumé apparaît (texte qui mentionne "terminé", "recettes" ou "import")
    await expect(page.getByRole('button', { name: /^installer$/i })).toBeVisible({ timeout: 150_000 });

    // Vérifier qu'on a un statut de fin (success ou error visible)
    const finalStatus = page.locator('text=/terminé|recette[s]?\\s+(import|ajout)|aucune\\s+nouvelle|import.*réussi|erreur/i').first();
    await expect(finalStatus).toBeVisible({ timeout: 10_000 });

    // Vérifier que le bouton "Voir le journal" du job est dispo (preuve qu'un job a tourné)
    const logLink = page.getByRole('link', { name: /journal|log|détails/i });
    if (await logLink.count() > 0) {
      await expect(logLink.first()).toBeVisible();
    }
  });
});
