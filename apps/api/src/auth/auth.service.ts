import { Injectable, UnauthorizedException } from "@nestjs/common";
import type { AuthSession, DemoUserOption, UserRole } from "@enterprise-resilience/contracts";

const allowedRoles = new Set<UserRole>([
  "viewer",
  "business-approver",
  "incident-manager",
  "engineer",
  "auditor",
  "admin"
]);

@Injectable()
export class AuthService {
  listUsers(): DemoUserOption[] {
    return this.getDirectory();
  }

  getSession(headers: Record<string, string | string[] | undefined>): AuthSession {
    const headerUser = this.readHeader(headers, "x-era-user");
    const headerRole = this.readHeader(headers, "x-era-role");
    const directory = this.getDirectory();

    if (headerUser || headerRole) {
      if (!headerUser || !headerRole) {
        throw new UnauthorizedException("Both x-era-user and x-era-role headers are required.");
      }

      if (!allowedRoles.has(headerRole as UserRole)) {
        throw new UnauthorizedException(`Role ${headerRole} is not supported.`);
      }

      const matched = directory.find((entry) => entry.userId === headerUser && entry.role === headerRole);
      if (!matched) {
        throw new UnauthorizedException("The supplied user and role combination is not registered.");
      }

      return {
        userId: matched.userId,
        displayName: matched.displayName,
        role: matched.role,
        source: "header"
      };
    }

    const defaultUserId = process.env.ERA_DEFAULT_USER_ID ?? "manager.demo";
    const demoDefault =
      directory.find((entry) => entry.userId === defaultUserId) ??
      directory[0] ?? {
        userId: "manager.demo",
        displayName: "Incident Manager",
        role: "incident-manager" as const
      };

    return {
      userId: demoDefault.userId,
      displayName: demoDefault.displayName,
      role: demoDefault.role,
      source: "demo-default"
    };
  }

  private readHeader(headers: Record<string, string | string[] | undefined>, name: string) {
    const raw = headers[name];
    return Array.isArray(raw) ? raw[0] : raw;
  }

  private getDirectory(): DemoUserOption[] {
    const raw = process.env.ERA_DEMO_USERS;
    if (!raw) {
      return [
        { userId: "viewer.demo", displayName: "Demo Viewer", role: "viewer" },
        { userId: "approver.demo", displayName: "Business Approver", role: "business-approver" },
        { userId: "manager.demo", displayName: "Incident Manager", role: "incident-manager" },
        { userId: "engineer.demo", displayName: "Platform Engineer", role: "engineer" },
        { userId: "auditor.demo", displayName: "Audit Reviewer", role: "auditor" },
        { userId: "admin.demo", displayName: "Platform Admin", role: "admin" }
      ];
    }

    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        throw new Error("ERA_DEMO_USERS must be a JSON array.");
      }

      return parsed.map((entry) => ({
        userId: String(entry.userId),
        displayName: String(entry.displayName),
        role: String(entry.role) as UserRole
      }));
    } catch (error) {
      throw new UnauthorizedException(
        `ERA_DEMO_USERS is invalid: ${error instanceof Error ? error.message : "unknown error"}`
      );
    }
  }
}
