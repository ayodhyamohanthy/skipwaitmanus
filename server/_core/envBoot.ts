import { config } from "dotenv";

/**
 * Environment bootstrap: the WorkOS CLI provisions credentials into
 * .env.local; the general project config lives in .env. Load .env.local
 * first, then .env without overriding anything already set, so both sources
 * are available to the server process. Must be imported before anything
 * reads process.env.
 */
config({ path: ".env.local" });
config();
