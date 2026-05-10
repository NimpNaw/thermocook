/**
 * Stoppe la stack dev en local. En CI, on laisse le workflow gérer
 * (les logs sont utiles pour le debug en cas d'échec).
 *
 * Pour conserver la stack après un run local (debug) :
 *   KEEP_E2E_STACK=1 npm run test:e2e
 */
import { execSync } from 'node:child_process';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const COMPOSE = `docker compose -f ${REPO_ROOT}/docker-compose.dev.yml --project-directory ${REPO_ROOT}`;

export default async function globalTeardown() {
  if (process.env.CI || process.env.KEEP_E2E_STACK) return;
  console.log('🧹 Arrêt de la stack dev…');
  execSync(`${COMPOSE} stop`, { stdio: 'inherit' });
}
