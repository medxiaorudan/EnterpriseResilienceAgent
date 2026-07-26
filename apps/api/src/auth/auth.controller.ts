import { Controller, Get, Headers, UseGuards } from "@nestjs/common";
import { Roles } from "./auth.decorators.js";
import { AuthService } from "./auth.service.js";
import { AuthGuard } from "./auth.guard.js";

@Controller("auth")
@UseGuards(AuthGuard)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get("session")
  getSession(@Headers() headers: Record<string, string | string[] | undefined>) {
    return this.authService.getSession(headers);
  }

  @Get("users")
  @Roles("viewer", "business-approver", "incident-manager", "engineer", "auditor", "admin")
  listUsers() {
    return this.authService.listUsers();
  }
}
