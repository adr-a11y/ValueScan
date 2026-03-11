import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";

// Hardcoded admin credentials
const ADMIN_USERNAME = "adreyes96";
const ADMIN_PASSWORD = "0Ni0np33l!";

// In-memory session store: token -> expiry timestamp
const sessions = new Map<string, number>();
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export function createSession(): string {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, Date.now() + SESSION_TTL_MS);
  return token;
}

export function validateSession(token: string): boolean {
  const expiry = sessions.get(token);
  if (!expiry) return false;
  if (Date.now() > expiry) {
    sessions.delete(token);
    return false;
  }
  return true;
}

export function destroySession(token: string): void {
  sessions.delete(token);
}

export function checkCredentials(username: string, password: string): boolean {
  return username === ADMIN_USERNAME && password === ADMIN_PASSWORD;
}

// Express middleware — requires valid admin session token in Authorization header
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token || !validateSession(token)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}
