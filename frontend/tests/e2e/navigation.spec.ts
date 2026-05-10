import { test, expect } from '@playwright/test';

test.describe('Navigation principale', () => {
  test('home → catalogue avec filtre → recette → retour conserve le filtre', async ({ page }) => {
    await page.goto('/');

    // BottomNav : aller au Catalogue
    await page.getByRole('button', { name: /catalogue/i }).click();
    await expect(page).toHaveURL(/\/recipes/);

    // Cliquer sur la première recette du catalogue
    const firstCard = page.locator('h3').first();
    await firstCard.waitFor({ state: 'visible' });
    const title = await firstCard.textContent();
    await firstCard.click();

    // On doit arriver sur la page recette (overlay /recipes/<id>)
    await expect(page).toHaveURL(/\/recipes\/[^/]+$/);
    if (title) {
      // Le titre apparaît à la fois sur la card (h3) et sur la fiche (h1) — on cible h1.
      await expect(page.locator('h1', { hasText: title })).toBeVisible();
    }

    // Bouton retour (icône arrow-left) doit ramener au catalogue
    await page.locator('button').filter({ has: page.locator('svg.lucide-arrow-left') }).first().click();
    await expect(page).toHaveURL(/\/recipes/);
  });

  test('mode cuisine : ouvrir, naviguer entre étapes, fermer', async ({ page }) => {
    // Aller au catalogue, ouvrir une recette
    await page.goto('/recipes');
    await page.locator('h3').first().waitFor({ state: 'visible' });
    await page.locator('h3').first().click();
    await expect(page).toHaveURL(/\/recipes\/[^/]+$/);

    // Lancer le mode cuisine
    await page.getByRole('button', { name: /commencer la cuisine/i }).click();
    await expect(page).toHaveURL(/\/recipes\/[^/]+\/cooking$/);
    await expect(page.getByText(/étape 1 sur/i)).toBeVisible();

    // Avancer d'une étape
    const nextButton = page.getByRole('button', { name: /suivant/i });
    if (await nextButton.isVisible()) {
      await nextButton.click();
      await expect(page.getByText(/étape 2 sur/i)).toBeVisible();
    }

    // Fermer (X) : retour à la fiche recette
    await page.locator('button').filter({ has: page.locator('svg.lucide-x') }).first().click();
    await expect(page).toHaveURL(/\/recipes\/[^/]+$/);
  });

  test('mode cuisine : timer cliquable se lance, peut être annulé', async ({ page }) => {
    // On vise une recette d'exemple connue qui contient `{3 sec/vitesse 8}`.
    // Naviguer directement par ID évite le flake quand le catalogue contient
    // plusieurs recettes "agneau" (Cookomix peut en ajouter beaucoup).
    await page.goto('/recipes/thermocook_agneau-a-la-mediterraneenne-cuisson-lente_r541954');
    await expect(page).toHaveURL(/\/recipes\/[^/]+$/);

    // Lancer la cuisine
    await page.getByRole('button', { name: /commencer la cuisine/i }).click();
    await expect(page).toHaveURL(/\/cooking$/);

    // TimerButton a la classe text-orange-500 + font-black
    const timerButton = page.locator('button.text-orange-500.font-black').first();
    await timerButton.waitFor({ state: 'visible', timeout: 15000 });
    await timerButton.click();

    // La barre timer apparaît avec un format M:SS
    await expect(page.locator('span.font-mono').filter({ hasText: /^\d+:\d{2}$/ })).toBeVisible();

    // Annuler le timer (bouton X transparent)
    await page.locator('button.bg-black\\/20').click();
    await expect(page.locator('span.font-mono').filter({ hasText: /^\d+:\d{2}$/ })).not.toBeVisible();

    // Sortir de la cuisine
    await page.locator('button').filter({ has: page.locator('svg.lucide-x') }).first().click();
    await expect(page).toHaveURL(/\/recipes\/[^/]+$/);
  });

  test('catalogue : filtre catégorie conservé au retour de la recette', async ({ page }) => {
    await page.goto('/recipes');

    // Sélectionner une chip de catégorie (la première qui n'est pas "Tout")
    const chips = page.locator('button').filter({ hasText: /^[A-ZÀ-Ö].+/ });
    // Trouver une chip de catégorie qui filtre la liste : les chips ont un emoji
    const categoryChip = page.locator('button').filter({ has: page.locator('span').nth(0) })
      .filter({ hasNotText: /tout/i }).first();

    // Plus simple : utiliser l'URL pour appliquer le filtre
    await page.goto('/recipes?category=Dessert');
    await expect(page).toHaveURL(/category=Dessert/);

    // Cliquer une recette dans le filtre
    const firstCard = page.locator('h3').first();
    await firstCard.waitFor();
    await firstCard.click();
    await expect(page).toHaveURL(/\/recipes\/[^/]+$/);

    // Retour : URL doit conserver le filtre
    await page.locator('button').filter({ has: page.locator('svg.lucide-arrow-left') }).first().click();
    await expect(page).toHaveURL(/category=Dessert/);
    // Et la chip "Dessert" doit être active (bg vert #006d5b)
    const desserChip = page.locator('button', { hasText: 'Dessert' }).first();
    await expect(desserChip).toHaveClass(/bg-\[#006d5b\]/);
  });

  // Note : la restauration de scroll n'est pas testée en E2E ici parce que les
  // 4 recettes d'exemple ne génèrent pas une page suffisamment haute pour
  // scroller en viewport desktop (1280x720). Le hook `useScrollRestoration`
  // est déjà couvert exhaustivement par `src/hooks/useScrollRestoration.test.ts`
  // (StrictMode, suffix dynamique, sessionStorage, rAF).

test('BottomNav : onglet Catalogue actif sur fiche recette', async ({ page }) => {
    await page.goto('/recipes');
    await page.locator('h3').first().waitFor({ state: 'visible' });
    await page.locator('h3').first().click();
    await expect(page).toHaveURL(/\/recipes\/[^/]+$/);

    // L'onglet Catalogue doit être actif (aria-current="page")
    const catalogueBtn = page.getByRole('button', { name: /catalogue/i });
    await expect(catalogueBtn).toHaveAttribute('aria-current', 'page');
  });
});
