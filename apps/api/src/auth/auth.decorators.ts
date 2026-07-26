import { SetMetadata, createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { AuthSession, UserRole } from "@enterprise-resilience/contracts";
import { requiredRolesKey } from "./auth.guard.js";

export const Roles = (...roles: UserRole[]) => SetMetadata(requiredRolesKey, roles);

export const CurrentSession = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<{ authSession?: AuthSession }>();
  return request.authSession;
});
