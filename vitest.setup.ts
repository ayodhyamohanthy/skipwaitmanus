import { config } from "dotenv";

// Load the WorkOS CLI-provisioned secrets first, then the general .env on top
// (dotenv does not override variables that are already set).
config({ path: ".env.local" });
config();
