import { SessionOptions } from "iron-session";

export interface SessionData {
  address?: string;
  chainId?: number;
  isAuthenticated?: boolean;
  nonce?: string;
}

export const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET || "cryptoninja_default_secret_32chars!!",
  cookieName: "cryptoninja-session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    // "lax" allows the cookie to be sent on same-site navigations and
    // top-level cross-site GET requests — required for Railway proxy envs
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  },
};
