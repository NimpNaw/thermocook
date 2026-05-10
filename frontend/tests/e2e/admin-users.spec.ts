/**
 * Couvre 2 mutations admin peu testées :
 *  - Changement de mot de passe d'un autre user via l'UI admin (Phase 2)
 *  - Suppression d'un user qui a des données croisées : favoris, notes,
 *    SharedLink, MealPlan. Bug cascade delete corrigé en Phase 2 — sans
 *    le fix, le DELETE plantait en IntegrityError 500.
 */
import { test, expect, request } from '@playwright/test';
import path from 'node:path';

const STORAGE_ADMIN = path.resolve(__dirname, '.auth/admin.json');
const BACKEND_URL =
  process.env.E2E_BACKEND_URL ?? `http://localhost:${process.env.E2E_BACKEND_PORT ?? '8000'}`;

async function adminApi() {
  return request.newContext({ storageState: STORAGE_ADMIN });
}

async function createTestUser(api: Awaited<ReturnType<typeof adminApi>>, username: string, password: string) {
  const resp = await api.post(`${BACKEND_URL}/admin/users`, {
    data: { username, password, is_admin: false },
    headers: { 'Content-Type': 'application/json' },
  });
  if (!resp.ok()) throw new Error(`createTestUser failed: ${resp.status()} ${await resp.text()}`);
  const user = await resp.json();
  return user.id as number;
}

async function deleteTestUser(api: Awaited<ReturnType<typeof adminApi>>, userId: number) {
  await api.delete(`${BACKEND_URL}/admin/users/${userId}`);
}

test.use({ storageState: STORAGE_ADMIN });

test.describe('Admin — gestion utilisateurs', () => {
  test('changement de mot de passe d\'un autre user → login OK avec le nouveau', async ({ browser }) => {
    const api = await adminApi();
    const username = `e2e_pwd_${Date.now()}`;
    const userId = await createTestUser(api, username, 'oldPass123');

    try {
      // UI : ouvrir admin, trouver la ligne du user, cliquer "Changer le mot de passe"
      const adminCtx = await browser.newContext({ storageState: STORAGE_ADMIN });
      const page = await adminCtx.newPage();
      await page.goto('/admin');

      // Le row du user (flex justify-between qui contient le username)
      const userRow = page.locator('div.flex.items-center.justify-between').filter({
        has: page.locator('span.font-bold', { hasText: new RegExp(`^${username}$`) }),
      });
      // Le wrapper qui contient le row + le formulaire inline (parent direct)
      const userWrapper = userRow.locator('xpath=..');
      await userRow.waitFor();

      await userRow.getByTitle(/changer le mot de passe/i).click();

      await userWrapper.getByPlaceholder(/nouveau mot de passe/i).fill('newPass456');
      // Le bouton "valider" (Check) a la classe bg-[#006d5b]
      await userWrapper.locator('button.bg-\\[\\#006d5b\\]').click();

      // Toast success
      await expect(page.getByText(/mot de passe.*modifié/i)).toBeVisible();

      // Vérifier qu'on peut se logger avec le nouveau password
      const loginCtx = await browser.newContext();
      const loginPage = await loginCtx.newPage();
      await loginPage.goto('/login');
      await loginPage.getByPlaceholder(/utilisateur|username/i).fill(username);
      await loginPage.getByPlaceholder(/mot de passe|password/i).fill('newPass456');
      await loginPage.getByRole('button', { name: /se connecter|connexion/i }).click();
      await expect(loginPage).toHaveURL('/');
      await expect(loginPage.getByRole('button', { name: new RegExp(username, 'i') })).toBeVisible();

      await loginCtx.close();
      await adminCtx.close();
    } finally {
      await deleteTestUser(api, userId);
      await api.dispose();
    }
  });

  test('création user via UI admin → utilisateur listé + login fonctionnel', async ({ page, browser }) => {
    const username = `e2e_create_${Date.now()}`;
    const password = `pwd_${Date.now()}`;

    await page.goto('/admin');
    await page.waitForLoadState('networkidle');

    // Toggle "Créer" : avant click, c'est le seul bouton avec ce texte.
    const createToggle = page.locator('button:has-text("Créer")').first();
    await createToggle.waitFor({ state: 'visible', timeout: 15000 });
    await createToggle.click();

    // Remplir le formulaire
    await page.getByPlaceholder(/nom d'utilisateur/i).fill(username);
    await page.getByPlaceholder(/^Mot de passe$/i).fill(password);

    // Bouton submit du formulaire de création (cibler via le form qui contient
    // l'heading "Nouvel utilisateur" pour éviter le submit du Header search)
    const createForm = page.locator('form').filter({ has: page.getByRole('heading', { name: /nouvel utilisateur/i }) });
    await createForm.locator('button[type=submit]').click();

    // Le user apparaît dans la liste
    await expect(page.locator('span.font-bold', { hasText: username })).toBeVisible();

    // Vérifier qu'on peut se logger
    const loginCtx = await browser.newContext();
    const loginPage = await loginCtx.newPage();
    await loginPage.goto('/login');
    await loginPage.getByPlaceholder(/utilisateur|username/i).fill(username);
    await loginPage.getByPlaceholder(/mot de passe|password/i).fill(password);
    await loginPage.getByRole('button', { name: /se connecter|connexion/i }).click();
    await expect(loginPage).toHaveURL('/');
    await loginCtx.close();

    // Cleanup
    const api = await adminApi();
    const users = await (await api.get(`${BACKEND_URL}/admin/users`)).json();
    const created = users.find((u: { username: string }) => u.username === username);
    if (created) await api.delete(`${BACKEND_URL}/admin/users/${created.id}`);
    await api.dispose();
  });

  test('suppression d\'un user avec favoris + lien partagé → 200, pas d\'IntegrityError', async ({ browser }) => {
    const api = await adminApi();
    const username = `e2e_del_${Date.now()}`;
    const password = `pass_${Date.now()}`;
    const userId = await createTestUser(api, username, password);

    // Authentifier le user de test pour ajouter ses données croisées
    const userApi = await request.newContext();
    const loginResp = await userApi.post(`${BACKEND_URL}/login`, {
      form: { username, password },
    });
    expect(loginResp.ok()).toBeTruthy();

    // Ajouter une recette à sa liste de courses + générer un lien partagé
    const recipes = await (await userApi.get(`${BACKEND_URL}/recipes?limit=1`)).json();
    await userApi.post(`${BACKEND_URL}/shopping-list/add`, {
      data: { recipe_id: recipes[0].id },
      headers: { 'Content-Type': 'application/json' },
    });
    await userApi.post(`${BACKEND_URL}/shopping-list/share`);

    // Ajouter un favori (via sync : POST /favorites/sync avec la liste)
    await userApi.post(`${BACKEND_URL}/favorites/sync`, {
      data: [recipes[0].id],
      headers: { 'Content-Type': 'application/json' },
    });

    await userApi.dispose();

    // Suppression via l'API admin (= ce que fait l'UI)
    const delResp = await api.delete(`${BACKEND_URL}/admin/users/${userId}`);
    expect(delResp.status()).toBe(200);

    // Vérifier que le user n'apparaît plus
    const usersResp = await api.get(`${BACKEND_URL}/admin/users`);
    const users = await usersResp.json();
    expect(users.find((u: { username: string }) => u.username === username)).toBeFalsy();

    await api.dispose();
  });
});
