import type { AuthSession, DemoUserOption, UserRole } from "@enterprise-resilience/contracts";
import { apiRequest } from "./client.js";

const storageKey = "era-demo-user";

const fallbackUsers: DemoUserOption[] = [
  { userId: "manager.demo", displayName: "Incident Manager", role: "incident-manager" },
  { userId: "approver.demo", displayName: "Business Approver", role: "business-approver" },
  { userId: "auditor.demo", displayName: "Audit Reviewer", role: "auditor" },
  { userId: "engineer.demo", displayName: "Platform Engineer", role: "engineer" },
  { userId: "viewer.demo", displayName: "Demo Viewer", role: "viewer" },
  { userId: "admin.demo", displayName: "Platform Admin", role: "admin" }
];

export interface SelectedUser {
  userId: string;
  role: UserRole;
}

export function listDemoUsers() {
  return apiRequest<DemoUserOption[]>("/auth/users");
}

export function getAuthSession() {
  return apiRequest<AuthSession>("/auth/session");
}

export function readSelectedUser(): SelectedUser | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  const raw = window.localStorage.getItem(storageKey);
  if (!raw) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.userId !== "string" || typeof parsed?.role !== "string") {
      return undefined;
    }

    return {
      userId: parsed.userId,
      role: parsed.role as UserRole
    };
  } catch {
    return undefined;
  }
}

export function writeSelectedUser(user: SelectedUser) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(storageKey, JSON.stringify(user));
}

export function getFallbackUsers() {
  return fallbackUsers;
}
