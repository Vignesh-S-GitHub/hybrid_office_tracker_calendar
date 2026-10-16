import { betterAuth } from "better-auth";
import { bearer } from "better-auth/plugins";

export function createAuth(env: CloudflareEnv) {
  return betterAuth({
    appName: "Hybrid Office Tracker",
    database: env.DB,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.API_URL,
    trustedOrigins: env.ALLOWED_ORIGINS.split(","),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 15,
      maxPasswordLength: 128,
    },
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 60,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 60, max: 3 },
      },
    },
    advanced: { ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] } },
    plugins: [bearer()],
  });
}
