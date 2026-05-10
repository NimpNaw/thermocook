/**
 * Tests de sécurité — couvrent les zones les moins testées de l'app.
 * Toutes les vérifications passent par l'API directement (pas l'UI) car
 * les exploits typiques essaient de bypasser la couche UI.
 */
import { test, expect, request } from '@playwright/test';
import path from 'node:path';

const STORAGE_ADMIN = path.resolve(__dirname, '.auth/admin.json');
const BACKEND_URL =
  process.env.E2E_BACKEND_URL ?? `http://localhost:${process.env.E2E_BACKEND_PORT ?? '8000'}`;

test.describe('Sécurité', () => {
  // Note : le test "rate limiting login" est implémenté côté backend
  // (`tests/test_main_auth.py` — slowapi avec un client en mémoire) plutôt
  // qu'en E2E, parce que saturer le rate limiter en E2E bloque le
  // `globalSetup` (login admin) pour le reste de la suite.

  test('XSS : injecter <script> dans une note → renvoyé tel quel (pas exécuté)', async ({ page }) => {
    // Créer un user de test pour ne pas polluer l'admin
    const adminApi = await request.newContext({ storageState: STORAGE_ADMIN });
    const username = `e2e_xss_${Date.now()}`;
    const password = `pwd_${Date.now()}`;
    const created = await (await adminApi.post(`${BACKEND_URL}/admin/users`, {
      data: { username, password, is_admin: false },
      headers: { 'Content-Type': 'application/json' },
    })).json();

    try {
      // Login en tant que ce user
      const userApi = await request.newContext();
      await userApi.post(`${BACKEND_URL}/login`, { form: { username, password } });

      // Récupérer une recette + écrire une note avec un script
      const recipes = await (await userApi.get(`${BACKEND_URL}/recipes?limit=1`)).json();
      const recipeId = recipes[0].id;
      const malicious = `<script>window.__pwned=true</script>HELLO_${Date.now()}`;
      await userApi.post(`${BACKEND_URL}/recipes/${recipeId}/notes`, {
        data: { note_text: malicious },
        headers: { 'Content-Type': 'application/json' },
      });

      // Récupérer la note via API : doit être renvoyée telle quelle (string)
      const stored = await (await userApi.get(`${BACKEND_URL}/recipes/${recipeId}/notes`)).text();
      expect(stored).toContain('HELLO_');

      // Naviguer vers la fiche recette en tant que ce user et vérifier que
      // le textarea contient la string mais qu'aucun script n'a été exécuté
      const ctx = await page.context().browser()?.newContext();
      if (!ctx) throw new Error('no context');
      const userPage = await ctx.newPage();
      // Login UI
      await userPage.goto('/login');
      await userPage.getByPlaceholder(/utilisateur|username/i).fill(username);
      await userPage.getByPlaceholder(/mot de passe|password/i).fill(password);
      await userPage.getByRole('button', { name: /se connecter|connexion/i }).click();
      await expect(userPage).toHaveURL('/');

      await userPage.goto(`/recipes/${recipeId}`);
      const textarea = userPage.getByPlaceholder(/astuces|notes|conseils|modifications/i);
      await expect(textarea).toHaveValue(malicious);

      // Le marqueur d'exécution `window.__pwned` ne doit PAS être true
      const pwned = await userPage.evaluate(() => (window as unknown as { __pwned?: boolean }).__pwned);
      expect(pwned).toBeFalsy();

      await ctx.close();
      await userApi.dispose();
    } finally {
      await adminApi.delete(`${BACKEND_URL}/admin/users/${created.id}`);
      await adminApi.dispose();
    }
  });

  test('cross-user : userA ne peut pas lire les notes de userB', async () => {
    const adminApi = await request.newContext({ storageState: STORAGE_ADMIN });

    // Créer userA et userB
    const ts = Date.now();
    const userA = await (await adminApi.post(`${BACKEND_URL}/admin/users`, {
      data: { username: `e2e_a_${ts}`, password: 'passA', is_admin: false },
      headers: { 'Content-Type': 'application/json' },
    })).json();
    const userB = await (await adminApi.post(`${BACKEND_URL}/admin/users`, {
      data: { username: `e2e_b_${ts}`, password: 'passB', is_admin: false },
      headers: { 'Content-Type': 'application/json' },
    })).json();

    try {
      // userB écrit une note privée
      const apiB = await request.newContext();
      await apiB.post(`${BACKEND_URL}/login`, { form: { username: userB.username, password: 'passB' } });
      const recipes = await (await apiB.get(`${BACKEND_URL}/recipes?limit=1`)).json();
      const recipeId = recipes[0].id;
      await apiB.post(`${BACKEND_URL}/recipes/${recipeId}/notes`, {
        data: { note_text: 'PRIVATE_NOTE_OF_B' },
        headers: { 'Content-Type': 'application/json' },
      });
      await apiB.dispose();

      // userA tente de lire la note de userB sur la même recette
      const apiA = await request.newContext();
      await apiA.post(`${BACKEND_URL}/login`, { form: { username: userA.username, password: 'passA' } });
      const noteForA = await (await apiA.get(`${BACKEND_URL}/recipes/${recipeId}/notes`)).text();
      // userA doit avoir une note vide (la sienne, qui n'existe pas) — pas celle de B
      expect(noteForA).not.toContain('PRIVATE_NOTE_OF_B');
      await apiA.dispose();
    } finally {
      await adminApi.delete(`${BACKEND_URL}/admin/users/${userA.id}`);
      await adminApi.delete(`${BACKEND_URL}/admin/users/${userB.id}`);
      await adminApi.dispose();
    }
  });

  test('path traversal sur /api/thumbs : refus 4xx', async () => {
    const api = await request.newContext();
    // Tentative classique de sortie du dossier recipes
    const resp = await api.get(`${BACKEND_URL}/thumbs/..%2F..%2Fetc%2Fpasswd?size=thumb`, {
      failOnStatusCode: false,
    });
    expect([400, 403, 404, 422]).toContain(resp.status());

    // Variante avec slash brut
    const resp2 = await api.get(`${BACKEND_URL}/thumbs/../../etc/passwd?size=thumb`, {
      failOnStatusCode: false,
    });
    expect([400, 403, 404, 422]).toContain(resp2.status());
    await api.dispose();
  });

  test('JWT manipulé : cookie altéré → 401 sur endpoint protégé', async ({ browser }) => {
    // Faire un login admin valide
    const ctx = await browser.newContext({ storageState: STORAGE_ADMIN });
    const cookies = await ctx.cookies();
    const accessToken = cookies.find(c => c.name === 'access_token');
    expect(accessToken).toBeTruthy();

    // Modifier le payload (corrompre une lettre du token JWT)
    const tampered = accessToken!.value.slice(0, -3) + 'XXX';
    await ctx.clearCookies();
    await ctx.addCookies([{
      ...accessToken!,
      value: tampered,
      domain: 'localhost',
    }]);

    // Appeler un endpoint protégé via API
    const apiCtx = await request.newContext({ storageState: await ctx.storageState() });
    const resp = await apiCtx.get(`${BACKEND_URL}/users/me`, { failOnStatusCode: false });
    expect(resp.status()).toBe(401);

    await apiCtx.dispose();
    await ctx.close();
  });
});
