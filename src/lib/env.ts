/**
 * Environment variable validation.
 * This runs at startup and will throw if required variables are missing.
 */

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${key}\n` +
        `Make sure it is set in your .env.local file.`
    );
  }
  return value;
}

function optionalEnv(key: string, defaultValue: string = ""): string {
  return process.env[key] ?? defaultValue;
}

export const env = {
  // Database
  DATABASE_URL: requireEnv("DATABASE_URL"),
  DIRECT_URL: requireEnv("DIRECT_URL"),

  // Auth
  AUTH_SECRET: requireEnv("AUTH_SECRET"),
  SESSION_COOKIE_NAME: optionalEnv("SESSION_COOKIE_NAME", "mf_session"),

  // App
  APP_URL: optionalEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000"),
  NODE_ENV: optionalEnv("NODE_ENV", "development"),

  // Stripe
  STRIPE_SECRET_KEY: requireEnv("STRIPE_SECRET_KEY"),
  STRIPE_WEBHOOK_SECRET: optionalEnv("STRIPE_WEBHOOK_SECRET"),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: optionalEnv(
    "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"
  ),

  // Resend
  RESEND_API_KEY: requireEnv("RESEND_API_KEY"),
  RESEND_FROM_EMAIL: optionalEnv("RESEND_FROM_EMAIL", "noreply@mechanicflow.com"),

  // Computed
  isDevelopment: process.env.NODE_ENV === "development",
  isProduction: process.env.NODE_ENV === "production",
} as const;
