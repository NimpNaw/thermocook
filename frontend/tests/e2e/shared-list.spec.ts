/**
 * Régression de la PR #77 : ouvrir un lien partagé `/shared/<token>` doit
 * afficher la liste de courses, pas rester bloqué sur "Ouverture du paquet…".
 *
 * Ce test couvre le bug où `<SharedListPage />` était rendu hors d'un
 * `<Routes>` parent → `useParams` retournait {} → `loadList` court-circuitait
 * via `if (!token) return;`.
 */
import { test, expect, request } from '@playwright/test';
import path from 'node:path';

const STORAGE_ADMIN = path.resolve(__dirname, '.auth/admin.json');
const BACKEND_URL =
  process.env.E2E_BACKEND_URL ?? `http://localhost:${process.env.E2E_BACKEND_PORT ?? '8000'}`;

test.describe('Liste de courses partagée', () => {
  test('admin ajoute une recette → génère un lien → un visiteur sans cookie voit la liste', async ({ browser }) => {
    // 1. Contexte admin (avec cookie persisté par global-setup)
    const adminApi = await request.newContext({ storageState: STORAGE_ADMIN });

    // Ajouter une recette à la liste de courses via API (plus rapide qu'UI)
    const recipesResp = await adminApi.get(`${BACKEND_URL}/recipes?limit=1`);
    const recipes = await recipesResp.json();
    const recipeId = recipes[0].id;

    const addResp = await adminApi.post(`${BACKEND_URL}/shopping-list/add`, {
      data: { recipe_id: recipeId },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(addResp.ok()).toBeTruthy();

    // Générer le lien de partage
    const shareResp = await adminApi.post(`${BACKEND_URL}/shopping-list/share`);
    expect(shareResp.ok()).toBeTruthy();
    const { token } = await shareResp.json();
    expect(token).toBeTruthy();

    await adminApi.dispose();

    // 2. Contexte visiteur (sans cookie)
    const visitorContext = await browser.newContext();
    const visitorPage = await visitorContext.newPage();

    // Capture des requêtes API pour vérifier que /api/shared-list/<token> part bien
    const apiCalls: string[] = [];
    visitorPage.on('response', resp => {
      if (resp.url().includes('/api/shared-list/')) {
        apiCalls.push(`${resp.status()} ${resp.url()}`);
      }
    });

    await visitorPage.goto(`/shared/${token}`);

    // ✅ Le composant a fait sa requête (preuve : useParams fonctionne)
    await expect.poll(() => apiCalls.length, { timeout: 10_000 }).toBeGreaterThan(0);
    expect(apiCalls[0]).toContain('200');
    expect(apiCalls[0]).toContain(`/api/shared-list/${token}`);

    // ✅ Le nom du propriétaire s'affiche (= owner ≠ '' → JSON traité)
    await expect(visitorPage.getByText(/partagée par.*admin/i)).toBeVisible();

    // ✅ Pas bloqué sur le loader
    await expect(visitorPage.getByText(/ouverture du paquet/i)).not.toBeVisible();

    // ✅ Au moins une catégorie d'ingrédients est rendue
    const categoryHeading = visitorPage.locator('h3').first();
    await expect(categoryHeading).toBeVisible();

    await visitorContext.close();
  });

  test('mode offline : API API en panne → cache localStorage utilisé', async ({ browser }) => {
    // 1. Génère un lien
    const adminApi = await request.newContext({ storageState: STORAGE_ADMIN });
    const recipes = await (await adminApi.get(`${BACKEND_URL}/recipes?limit=1`)).json();
    await adminApi.post(`${BACKEND_URL}/shopping-list/add`, {
      data: { recipe_id: recipes[0].id },
      headers: { 'Content-Type': 'application/json' },
    });
    const { token } = await (await adminApi.post(`${BACKEND_URL}/shopping-list/share`)).json();
    await adminApi.dispose();

    // 2. Visiteur charge le lien une fois → cache localStorage rempli
    const visitorContext = await browser.newContext();
    const visitorPage = await visitorContext.newPage();
    await visitorPage.goto(`/shared/${token}`);
    await expect(visitorPage.getByText(/partagée par.*admin/i)).toBeVisible();

    // 3. On simule une panne API : la requête /api/shared-list/<token> abort
    await visitorContext.route(`**/api/shared-list/${token}`, route => route.abort('connectionfailed'));

    // 4. Reload → loadList échoue → catch → fallback localStorage → badge "Hors-ligne"
    await visitorPage.reload();
    await expect(visitorPage.getByText(/partagée par.*admin/i)).toBeVisible();
    // Badge "Hors-ligne" (exact, pour ne pas matcher le toast "Affichage de la version hors-ligne")
    await expect(visitorPage.getByText('Hors-ligne', { exact: true })).toBeVisible();

    await visitorContext.close();
  });

  test('lien invalide (404) : toast et liste vide', async ({ page }) => {
    await page.goto('/shared/garbage-token-does-not-exist');
    // Le composant traite 404 → toast "Lien expiré ou introuvable" + setCategories({})
    await expect(page.getByText(/expir|introuvable/i).first()).toBeVisible();
    await expect(page.getByText(/cette liste est vide ou n'existe plus/i)).toBeVisible();
  });

  test('lien expiré (403) : toast', async ({ page, context }) => {
    // On simule une réponse 403 pour n'importe quel token
    await context.route('**/api/shared-list/*', route =>
      route.fulfill({ status: 403, body: JSON.stringify({ detail: 'expired' }), contentType: 'application/json' })
    );
    await page.goto('/shared/some-fake-token');
    await expect(page.getByText(/expir|introuvable/i).first()).toBeVisible();
  });
});
