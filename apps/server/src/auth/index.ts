import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import { and, asc, eq, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "../db/client.js";
import * as schema from "../db/schema.js";
import { env } from "../env.js";

export type MerakDb = typeof db;

export interface CreateAuthOptions {
  secret?: string;
  baseURL?: string;
  trustedOrigins?: string[];
}

function slugifyBase(value: string): string {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return cleaned || "workspace";
}

export function createAuth(dbInstance: MerakDb = db, options?: CreateAuthOptions) {
  return betterAuth({
    database: drizzleAdapter(dbInstance, {
      provider: "sqlite",
      schema,
    }),
    secret: options?.secret ?? env.BETTER_AUTH_SECRET,
    baseURL: options?.baseURL ?? env.BETTER_AUTH_URL,
    trustedOrigins: options?.trustedOrigins ?? [env.WEB_ORIGIN],
    emailAndPassword: {
      enabled: true,
    },
    plugins: [
      organization({
        allowUserToCreateOrganization: true,
        creatorRole: "owner",
      }),
    ],
    databaseHooks: {
      user: {
        create: {
          after: async (createdUser) => {
            const existingMembership = await dbInstance
              .select({ id: schema.member.id })
              .from(schema.member)
              .where(eq(schema.member.userId, createdUser.id))
              .limit(1);

            if (existingMembership.length > 0) {
              return;
            }

            const now = new Date();
            const nowIso = now.toISOString();
            const orgId = `org_${nanoid(16)}`;
            const memberId = `mem_${nanoid(16)}`;
            const spaceId = `spc_${nanoid(16)}`;

            const displayName =
              createdUser.name?.trim() ||
              createdUser.email?.split("@")[0]?.trim() ||
              "Personal";
            const slug = `${slugifyBase(displayName)}-${nanoid(6).toLowerCase()}`;

            await dbInstance.insert(schema.organization).values({
              id: orgId,
              name: `${displayName}'s Workspace`,
              slug,
              logo: null,
              createdAt: now,
              metadata: JSON.stringify({ personal: true }),
            });

            await dbInstance.insert(schema.member).values({
              id: memberId,
              organizationId: orgId,
              userId: createdUser.id,
              role: "owner",
              createdAt: now,
            });

            await dbInstance.insert(schema.spaces).values({
              id: spaceId,
              orgId,
              kind: "knowledge",
              slug: "knowledge",
              name: "Knowledge Base",
              icon: "book-open",
              description: "Default personal knowledge base",
              sortOrder: "i",
              createdAt: nowIso,
              updatedAt: nowIso,
            });

            // Better Auth runs user.create.after post-transaction, after the initial sign-up
            // session was inserted, so backfill activeOrganizationId if still unset.
            await dbInstance
              .update(schema.session)
              .set({ activeOrganizationId: orgId })
              .where(
                and(
                  eq(schema.session.userId, createdUser.id),
                  isNull(schema.session.activeOrganizationId),
                ),
              );
          },
        },
      },
      session: {
        create: {
          before: async (sessionData) => {
            const current = sessionData as typeof sessionData & {
              activeOrganizationId?: string | null;
            };
            if (current.activeOrganizationId) {
              return { data: current };
            }

            const memberships = await dbInstance
              .select({ organizationId: schema.member.organizationId })
              .from(schema.member)
              .where(eq(schema.member.userId, sessionData.userId))
              .orderBy(asc(schema.member.createdAt))
              .limit(1);

            const firstOrgId = memberships[0]?.organizationId ?? null;
            if (!firstOrgId) {
              return { data: current };
            }

            return {
              data: {
                ...current,
                activeOrganizationId: firstOrgId,
              },
            };
          },
        },
      },
    },
  });
}

export type AuthInstance = ReturnType<typeof createAuth>;

export const auth = createAuth(db);
