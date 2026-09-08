// Import this file FIRST in any script run with tsx so process.env is ready
// before modules that read it (db client, env validation) are evaluated.
import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });
