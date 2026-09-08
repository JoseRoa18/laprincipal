import { config } from "dotenv";

// Vitest sets NODE_ENV=test itself; here we only load local variables.
config({ path: [".env.test", ".env.local", ".env"], quiet: true });
