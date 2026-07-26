import { readSelectedUser } from "./auth.js";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const selectedUser = readSelectedUser();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(selectedUser
        ? {
            "x-era-user": selectedUser.userId,
            "x-era-role": selectedUser.role
          }
        : {}),
      ...(init?.headers ?? {})
    },
    ...init
  });

  if (!response.ok) {
    let detail = `API request failed: ${response.status}`;
    try {
      const body = (await response.json()) as { message?: string | string[] };
      const message = Array.isArray(body.message) ? body.message.join(", ") : body.message;
      if (message) {
        detail = message;
      }
    } catch {
      // Keep the default message if the error body is not JSON.
    }
    throw new Error(detail);
  }

  return response.json() as Promise<T>;
}

export const apiBaseUrl = API_BASE_URL;
