import type pg from 'pg';
import { baseApp, router, openapi, type Endpoint } from './http.js';
import { authRoutes } from './routes-auth.js';
import { platformRoutes } from './routes-platform.js';
import { platformExtraRoutes } from './routes-platform-extra.js';
import { companyRoutes } from './routes-company.js';
import { companyExtraRoutes } from './routes-company-extra.js';
import { estimateExtraRoutes } from './routes-estimates-extra.js';
import { stockExtraRoutes } from './routes-stock-extra.js';
import { permissionRoutes } from './routes-permissions.js';
import { operationRoutes } from './routes-operations.js';
import { workRoutes } from './routes-work.js';
import { lifecycleRoutes } from './routes-lifecycle.js';
export async function buildApp(pool: pg.Pool, logging = false) {
  const app = await baseApp(logging);
  const definitions: Endpoint[] = [];
  const add = router(app, pool, definitions);
  app.get('/health/live', async () => ({ status: 'ok' }));
  app.get('/health/ready', async (_req, reply) => {
    try {
      await pool.query('SELECT 1 FROM schema_migrations LIMIT 1');
      return { status: 'ok' };
    } catch {
      return reply.code(503).send({ status: 'unavailable' });
    }
  });
  authRoutes(add);
  platformRoutes(add);
  platformExtraRoutes(add);
  companyRoutes(add);
  companyExtraRoutes(add);
  estimateExtraRoutes(add);
  stockExtraRoutes(add);
  permissionRoutes(add);
  operationRoutes(add);
  workRoutes(add);
  lifecycleRoutes(add);
  app.get('/openapi.json', async () => openapi(definitions));
  return { app, definitions };
}
