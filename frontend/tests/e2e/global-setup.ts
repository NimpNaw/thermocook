/**
 * Démarre la stack docker compose dev (sauf en CI, où le job yaml l'a déjà
 * lancée), attend que le backend soit `healthy`, et persiste un cookie admin
 * dans `storage-admin.json` pour les tests qui en ont besoin.
 */
import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const COMPOSE = `docker compose -f ${REPO_ROOT}/docker-compose.dev.yml --project-directory ${REPO_ROOT}`;
const BACKEND_URL = process.env.E2E_BACKEND_URL ?? `http://localhost:${process.env.E2E_BACKEND_PORT ?? '8000'}`;
const FRONTEND_URL = process.env.E2E_BASE_URL ?? `http://localhost:${process.env.E2E_PORT ?? '3000'}`;
const ADMIN_USERNAME = process.env.E2E_ADMIN_USERNAME ?? 'admin';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'changeme';
const STORAGE_DIR = path.resolve(__dirname, '.auth');
const STORAGE_ADMIN = path.join(STORAGE_DIR, 'admin.json');

async function waitFor(url: string, label: string, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (err) {
      lastError = err;
    }
    await new Promise(r => setTimeout(r, 1_000));
  }
  throw new Error(`${label} not ready after ${timeoutMs}ms: ${lastError}`);
}

async function loginAdmin(): Promise<string> {
  const body = new URLSearchParams({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD });
  const response = await fetch(`${BACKEND_URL}/login`, {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  if (!response.ok) throw new Error(`admin login failed: HTTP ${response.status}`);
  const setCookie = response.headers.get('set-cookie');
  if (!setCookie) throw new Error('admin login did not return Set-Cookie');
  const match = /access_token=([^;]+)/.exec(setCookie);
  if (!match) throw new Error('access_token cookie not found');
  return match[1];
}

export default async function globalSetup() {
  if (!process.env.CI) {
    console.log('🐳 Démarrage de la stack dev (docker compose)…');
    execSync(`${COMPOSE} up -d`, { stdio: 'inherit' });
  } else {
    console.log('🐳 CI mode : la stack est démarrée par le workflow.');
  }

  console.log('⏳ Attente du backend (/health)…');
  await waitFor(`${BACKEND_URL}/health`, 'backend');
  console.log('⏳ Attente du frontend…');
  await waitFor(`${FRONTEND_URL}/`, 'frontend');

  console.log('🔐 Login admin…');
  const token = await loginAdmin();

  mkdirSync(STORAGE_DIR, { recursive: true });
  const storage = {
    cookies: [
      {
        name: 'access_token',
        value: token,
        domain: 'localhost',
        path: '/',
        expires: -1,
        httpOnly: true,
        secure: false,
        sameSite: 'Lax' as const,
      },
    ],
    origins: [],
  };
  writeFileSync(STORAGE_ADMIN, JSON.stringify(storage, null, 2));
  console.log(`✅ Storage admin écrit dans ${STORAGE_ADMIN}`);
}
