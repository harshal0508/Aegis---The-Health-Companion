import crypto from "crypto";

const BASE62_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/**
 * Generates a 128-bit cryptographically secure random token (base62 encoded).
 * 128 bits provides 3.4 x 10^38 possible keys, impervious to brute force guessing.
 * The raw token is displayed to the user ONCE and NEVER stored in the database.
 */
export function generateEmergencyToken(): string {
  const bytes = crypto.randomBytes(16);
  let num = BigInt("0x" + bytes.toString("hex"));
  const zero = BigInt(0);
  const base = BigInt(62);
  let str = "";
  while (num > zero) {
    const rem = Number(num % base);
    str = BASE62_CHARS[rem] + str;
    num = num / base;
  }
  return str.padStart(22, "0");
}

/**
 * Computes a SHA-256 hash of the emergency token.
 * Only this hash is stored in the emergency_cards database table.
 */
export function hashEmergencyToken(token: string): string {
  if (!token || !token.trim()) return "";
  return crypto.createHash("sha256").update(token.trim()).digest("hex");
}

/**
 * Anonymously hashes an IP address for audit logging without storing raw PII.
 * Requires IP_HASH_SALT in environment; strictly fails with an error if missing
 * to prevent reversible IP rainbow-table attacks.
 */
export function hashIpAddress(ip: string): string {
  const salt = process.env.IP_HASH_SALT;
  if (!salt) {
    throw new Error(
      "CRITICAL SECURITY CONFIGURATION ERROR: IP_HASH_SALT is not set in environment variables. Refusing to hash client IP with an insecure default salt."
    );
  }
  return crypto.createHash("sha256").update((ip || "unknown") + salt).digest("hex").slice(0, 16);
}

// In-memory rate limiter for public emergency endpoints (dev & standard deployment)
interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();

/**
 * IP rate limiter: enforces max 30 requests per minute per IP hash.
 */
export function checkEmergencyRateLimit(ipHash: string, limit = 30, windowMs = 60000): {
  allowed: boolean;
  remaining: number;
} {
  const now = Date.now();
  const entry = rateLimitMap.get(ipHash);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ipHash, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1 };
  }

  if (entry.count >= limit) {
    return { allowed: false, remaining: 0 };
  }

  entry.count++;
  return { allowed: true, remaining: limit - entry.count };
}
