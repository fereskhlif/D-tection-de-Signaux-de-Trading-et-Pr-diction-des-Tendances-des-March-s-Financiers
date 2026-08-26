import { API_BASE_URL } from "./api";
import { LoginCredentials, RegisterData, Token, User } from "../types/auth";

export const authService = {
  async login(credentials: LoginCredentials): Promise<Token> {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(credentials),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || "Email ou mot de passe incorrect.");
    }

    const data: Token = await response.json();
    localStorage.setItem("access_token", data.access_token);
    return data;
  },

  async register(data: RegisterData): Promise<User> {
    const response = await fetch(`${API_BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || "Erreur lors de l'inscription.");
    }

    return response.json();
  },

  async getCurrentUser(): Promise<User> {
    const token = localStorage.getItem("access_token");
    if (!token) throw new Error("No token found");

    const response = await fetch(`${API_BASE_URL}/auth/me`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      localStorage.removeItem("access_token");
      throw new Error("Invalid or expired token");
    }

    return response.json();
  },

  logout() {
    localStorage.removeItem("access_token");
  },

  async loginWithGoogle(credential: string): Promise<Token> {
    const response = await fetch(`${API_BASE_URL}/auth/google`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credential }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || "Impossible de vérifier votre connexion Google.");
    }

    const data: Token = await response.json();
    localStorage.setItem("access_token", data.access_token);
    return data;
  },

  async forgotPassword(email: string): Promise<{ message: string }> {
    const response = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || "Erreur lors de la demande de réinitialisation");
    }

    return response.json();
  },

  async verifyResetToken(token: string): Promise<{ valid: boolean }> {
    const response = await fetch(`${API_BASE_URL}/auth/reset-password/verify/${token}`, {
      method: "GET",
    });

    if (!response.ok) {
      return { valid: false };
    }

    return response.json();
  },

  async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    const response = await fetch(`${API_BASE_URL}/auth/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, new_password: newPassword }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || "Erreur lors de la réinitialisation du mot de passe");
    }

    return response.json();
  },
};
