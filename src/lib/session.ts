import { SessionOptions } from "iron-session";

export interface SessionData {
  address?: string;
  chainId?: number;
  isAuthenticated?: boolean;
  nonce?: string;
}

export const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET || "complex_password_at_least_32_characters_long!!",
  cookieName: "cryptoninja-session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "strict",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  },
};
