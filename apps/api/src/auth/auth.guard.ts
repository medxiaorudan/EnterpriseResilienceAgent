import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { AuthSession, UserRole } from "@enterprise-resilience/contracts";
import { AuthService } from "./auth.service.js";

export const requiredRolesKey = "requiredRoles";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService
  ) {}

  canActivate(context: ExecutionContext) {
    const roles =
      this.reflector.getAllAndOverride<UserRole[]>(requiredRolesKey, [
        context.getHandler(),
        context.getClass()
      ]) ?? [];

    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      authSession?: AuthSession;
    }>();

    const session = this.authService.getSession(request.headers);
    request.authSession = session;

    if (roles.length > 0 && !roles.includes(session.role) && session.role !== "admin") {
      throw new ForbiddenException(
        `Role ${session.role} cannot access this route. Required roles: ${roles.join(", ")}.`
      );
    }

    return true;
  }
}
