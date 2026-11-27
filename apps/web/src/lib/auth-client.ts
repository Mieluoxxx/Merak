import { API_ROUTES } from "@merak/shared";
import { organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

const baseURL = typeof window !== "undefined" ? window.location.origin : undefined;

export const authClient = createAuthClient({
  baseURL,
  basePath: API_ROUTES.authBase,
  plugins: [organizationClient()],
});

export type AuthSessionData = typeof authClient.$Infer.Session;
export type ActiveOrganizationData = typeof authClient.$Infer.ActiveOrganization;
export type OrganizationSummary = typeof authClient.$Infer.Organization;
export type OrganizationMemberRole = "owner" | "admin" | "member";

export const useSession = authClient.useSession;
export const useActiveOrganization = authClient.useActiveOrganization;
export const useListOrganizations = authClient.useListOrganizations;

export interface SignInEmailParams {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface SignUpEmailParams {
  name: string;
  email: string;
  password: string;
}

export interface CreateOrganizationParams {
  name: string;
  slug: string;
  logo?: string;
}

export interface InviteMemberParams {
  email: string;
  role: OrganizationMemberRole;
  organizationId?: string;
}

export function extractAuthError(error: unknown, fallback = "Authentication failed"): string {
  if (!error) return fallback;
  if (typeof error === "string") return error;
  if (typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return fallback;
}

export async function signInWithEmail(params: SignInEmailParams) {
  const result = await authClient.signIn.email({
    email: params.email,
    password: params.password,
    rememberMe: params.rememberMe ?? true,
  });
  if (result.error) {
    throw new Error(extractAuthError(result.error, "Failed to sign in"));
  }
  return result.data;
}

export async function signUpWithEmail(params: SignUpEmailParams) {
  const result = await authClient.signUp.email({
    name: params.name,
    email: params.email,
    password: params.password,
  });
  if (result.error) {
    throw new Error(extractAuthError(result.error, "Failed to create account"));
  }
  return result.data;
}

export async function signOut() {
  const result = await authClient.signOut();
  if (result.error) {
    throw new Error(extractAuthError(result.error, "Failed to sign out"));
  }
  return result.data;
}

export async function createOrganization(params: CreateOrganizationParams) {
  const result = await authClient.organization.create({
    name: params.name,
    slug: params.slug,
    logo: params.logo,
  });
  if (result.error) {
    throw new Error(extractAuthError(result.error, "Failed to create team"));
  }
  return result.data;
}

export async function setActiveOrganization(organizationId: string | null) {
  const result = await authClient.organization.setActive({
    organizationId,
  });
  if (result.error) {
    throw new Error(extractAuthError(result.error, "Failed to switch active team"));
  }
  return result.data;
}

export async function inviteOrganizationMember(params: InviteMemberParams) {
  const result = await authClient.organization.inviteMember({
    email: params.email,
    role: params.role,
    organizationId: params.organizationId,
  });
  if (result.error) {
    throw new Error(extractAuthError(result.error, "Failed to send invitation"));
  }
  return result.data;
}

export function slugifyOrganizationName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}
