import { existsSync } from "node:fs";
// Scripts run outside Next.js, so load .env files ourselves.
for (const f of [".env.local", ".env"]) if (existsSync(f)) process.loadEnvFile(f);
