/**
 * database/index.ts
 *
 * Public entrypoint every route/service already imports `db` from. Now backed
 * by a Proxy that forwards each property access to whichever tenant's
 * Drizzle client is active for the current request (see tenantContext.ts).
 * This means none of the existing route files needed to change — they keep
 * doing `import { db, files } from '../../database/index.js'` and it just
 * resolves to the right tenant transparently.
 */

import { getTenantContext } from './tenantContext.js';
import * as schema from './schema.js';

type DbShape = ReturnType<typeof getTenantContext>['db'];

export const db: DbShape = new Proxy({} as DbShape, {
  get(_target, prop, receiver) {
    const activeDb = getTenantContext().db;
    const value = Reflect.get(activeDb as object, prop, receiver);
    return typeof value === 'function' ? value.bind(activeDb) : value;
  },
}) as DbShape;

export * from './schema.js';
export { schema };
