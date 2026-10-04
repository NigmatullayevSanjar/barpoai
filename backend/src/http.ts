import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import cookie from '@fastify/cookie';
import { z } from 'zod';
import type pg from 'pg';
import { transaction, idempotent, mapDatabaseError, type Db, type Row } from './db.js';
import { authenticate, tenantAccess, SESSION_COOKIE, SESSION_SECONDS } from './auth.js';
import { invariant } from './errors.js';
import {
  permit,
  type Permission,
  allowed,
  redactPrices,
  pageAllowed,
  permissionPage,
  type Page,
  type Action,
} from './permissions.js';
export interface Context {
  db: Db;
  actor: Row;
  body: Row;
  params: Row;
  query: Row;
  request: FastifyRequest;
  reply: FastifyReply;
  /** Brauzer cookie orqali kelgan sessiya; login javobi ham cookie qo'yishi uchun. */
  channel: 'bearer' | 'cookie';
}
export interface Endpoint {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  summary: string;
  body?: z.ZodType;
  params?: z.ZodType;
  query?: z.ZodType;
  public?: boolean;
  platform?: string[];
  recovery?: boolean;
  passwordChange?: boolean;
  permission?: Permission;
  idempotent?: boolean;
  sensitive?: boolean;
  page?: Page;
  action?: Action;
  adminOnly?: boolean;
  pageFor?: (body: Row, query: Row) => Page;
  response?: Record<string, unknown>;
  /** Marshrutga xos cheklov (masalan, login uchun qattiqroq). */
  rateLimit?: { max: number; timeWindow: string };
  /** 'set' — javobdagi access_token cookie sifatida ham qo'yiladi; 'clear' — cookie o'chiriladi. */
  session?: 'set' | 'clear';
  handler: (ctx: Context) => Promise<any>;
}
export const appOrigin = () => process.env.APP_ORIGIN ?? 'http://localhost:5173';
export function setSessionCookie(reply: FastifyReply, token: string) {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_SECONDS,
  });
}
export function clearSessionCookie(reply: FastifyReply) {
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}
export function router(app: FastifyInstance, pool: pg.Pool, definitions: Endpoint[]) {
  return (route: Endpoint) => {
    definitions.push(route);
    app.route({
      method: route.method,
      url: route.path,
      config: route.rateLimit ? { rateLimit: route.rateLimit } : undefined,
      handler: async (request, reply) =>
        transaction(pool, null, async (db) => {
          const body = route.body ? route.body.parse(request.body) : {};
          const params = route.params ? route.params.parse(request.params) : {};
          const query = route.query ? route.query.parse(request.query) : {};
          const cookieToken = request.cookies?.[SESSION_COOKIE];
          const bearer = request.headers.authorization;
          const channel: 'bearer' | 'cookie' = bearer
            ? 'bearer'
            : cookieToken
              ? 'cookie'
              : 'bearer';
          // Cookie sessiya bilan kelgan o'zgartiruvchi so'rovlar faqat o'z frontend originidan qabul qilinadi (CSRF).
          if (!bearer && cookieToken && request.method !== 'GET') {
            const origin =
              request.headers.origin ??
              request.headers.referer?.replace(/(^https?:\/\/[^/]+).*/, '$1');
            invariant(origin === appOrigin(), 'CSRF_ORIGIN_REJECTED', 403);
          }
          const actor = route.public ? {} : await authenticate(db, bearer, cookieToken);
          if (!route.public) {
            invariant(
              !actor.must_change_password || route.passwordChange,
              'PASSWORD_CHANGE_REQUIRED',
              403,
            );
            if (route.platform)
              invariant(!actor.tenant_id && route.platform.includes(actor.role), 'FORBIDDEN', 403);
            else if (!route.passwordChange) {
              await db.query("SELECT set_config('app.tenant_id',$1,true)", [actor.tenant_id ?? '']);
              await tenantAccess(db, actor, route.recovery);
              if (route.adminOnly) invariant(actor.role === 'tenant_admin', 'FORBIDDEN', 403);
              if (route.permission || route.page || route.pageFor) {
                const page =
                  route.pageFor?.(body as Row, query as Row) ??
                  route.page ??
                  permissionPage[route.permission!][0];
                const action =
                  route.action ??
                  (route.method === 'GET'
                    ? 'read'
                    : route.method === 'DELETE'
                      ? 'delete'
                      : route.method === 'PATCH'
                        ? 'update'
                        : (permissionPage[route.permission!]?.[1] ?? 'create'));
                invariant(await pageAllowed(db, actor, page, action), 'PAGE_ACTION_FORBIDDEN', 403);
                if (route.permission) await permit(db, actor, route.permission, action, page);
              }
            }
          }
          const run = () =>
            route.handler({
              db,
              actor,
              body: body as Row,
              params: params as Row,
              query: query as Row,
              request,
              reply,
              channel,
            });
          let result = route.idempotent
            ? await idempotent(
                db,
                actor,
                String(request.headers['idempotency-key'] ?? ''),
                { path: request.url, body },
                run,
              )
            : await run();
          if (route.sensitive && !(await allowed(db, actor, 'prices.read')))
            result = redactPrices(result);
          if (route.session === 'set' && result?.access_token)
            setSessionCookie(reply, result.access_token);
          if (route.session === 'clear') clearSessionCookie(reply);
          return result;
        }),
    });
  };
}
export async function baseApp(logging = false) {
  const app = Fastify({
    logger: logging
      ? {
          redact: [
            'req.headers.authorization',
            'req.headers.cookie',
            'req.headers["x-telegram-bot-api-secret-token"]',
          ],
          serializers: {
            req(req) {
              return { method: req.method, url: req.url.split('?')[0], remoteAddress: req.ip };
            },
          },
        }
      : false,
    bodyLimit: 8 * 1024 * 1024,
    trustProxy: process.env.TRUST_PROXY === '1',
  });
  await app.register(helmet);
  await app.register(cookie);
  await app.register(cors, {
    origin: appOrigin(),
    credentials: true,
  });
  // SPA polling va bitta IP orqasidagi ko'p foydalanuvchi uchun umumiy chegara; login/reset alohida qattiq.
  await app.register(rateLimit, {
    max: Number(process.env.RATE_LIMIT_PER_MINUTE ?? 900),
    timeWindow: '1 minute',
  });
  app.setErrorHandler((error: any, request, reply) => {
    if (error instanceof z.ZodError)
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          fields: error.issues.map((e) => ({ path: e.path, message: e.message })),
        },
        request_id: request.id,
      });
    if (error.statusCode === 429)
      return reply.code(429).send({ error: { code: 'RATE_LIMITED' }, request_id: request.id });
    if (error.statusCode === 413)
      return reply.code(413).send({ error: { code: 'PAYLOAD_TOO_LARGE' }, request_id: request.id });
    if (error.statusCode === 400)
      return reply.code(400).send({ error: { code: 'INVALID_JSON' }, request_id: request.id });
    const mapped = mapDatabaseError(error);
    if (mapped.status === 500)
      request.log.error({ code: error.code, name: error.name }, 'Request failed');
    return reply
      .code(mapped.status)
      .send({
        error: { code: mapped.code, details: (mapped as any).details ?? undefined },
        request_id: request.id,
      });
  });
  return app;
}
export function openapi(definitions: Endpoint[]) {
  const paths: Record<string, any> = {};
  for (const r of definitions) {
    const path = r.path.replace(/:([a-z_]+)/g, '{$1}');
    const parameters: any[] = [];
    for (const [schema, location] of [
      [r.params, 'path'],
      [r.query, 'query'],
    ] as const)
      if (schema) {
        const json = z.toJSONSchema(schema, { unrepresentable: 'any' }) as any;
        for (const [name, value] of Object.entries(json.properties ?? {}))
          parameters.push({
            name,
            in: location,
            required: location === 'path' || json.required?.includes(name) || false,
            schema: value,
          });
      }
    if (r.idempotent)
      parameters.push({
        name: 'Idempotency-Key',
        in: 'header',
        required: true,
        schema: { type: 'string', minLength: 8, maxLength: 128 },
      });
    const error = {
      description: 'Xato; error.code mashina uchun barqaror identifikator.',
      content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
    };
    const operation: any = {
      summary: r.summary,
      operationId: r.method.toLowerCase() + r.path.replace(/[^a-zA-Z0-9]/g, '_'),
      security: r.public ? [] : [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters,
      'x-permission': r.permission ?? r.platform?.join('|') ?? 'authenticated',
      'x-tenant-scope': !r.platform && !r.public,
      responses: {
        '200': {
          description: 'Muvaffaqiyat',
          content: {
            'application/json': {
              schema: r.response ?? { type: 'object', additionalProperties: true },
            },
          },
        },
        '400': error,
        '401': error,
        '402': error,
        '403': error,
        '404': error,
        '409': error,
        '410': error,
        '429': error,
        '503': error,
      },
    };
    if (r.body)
      operation.requestBody = {
        required: true,
        content: {
          'application/json': { schema: z.toJSONSchema(r.body, { unrepresentable: 'any' }) },
        },
      };
    (paths[path] ??= {})[r.method.toLowerCase()] = operation;
  }
  return {
    openapi: '3.1.0',
    info: {
      title: 'BARPO AI API',
      version: '0.2.0',
      description:
        'UZS decimal qiymatlar string. Tenant sessiyadan olinadi. Sessiya Bearer token yoki httpOnly cookie orqali. Trial tugashi avtomatik bloklamaydi; platforma egasi qo‘lda hal qiladi.',
    },
    servers: [{ url: 'http://localhost:3001' }],
    paths,
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer' },
        cookieAuth: { type: 'apiKey', in: 'cookie', name: SESSION_COOKIE },
      },
      schemas: {
        Error: {
          type: 'object',
          required: ['error', 'request_id'],
          properties: {
            error: {
              type: 'object',
              required: ['code'],
              properties: {
                code: { type: 'string' },
                fields: { type: 'array', items: { type: 'object' } },
              },
            },
            request_id: { type: 'string' },
          },
        },
      },
    },
  };
}
