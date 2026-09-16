import { config } from "dotenv";

// Load the WorkOS CLI-provisioned secrets first, then the general .env on top
// (dotenv does not override variables that are already set).
config({ path: ".env.local" });
config();

// waitFor's default async-utility timeout is 1000ms. Several components perform
// three or more sequential awaits before their first meaningful paint, and under a
// fully parallel suite run the event loop starves past that budget — producing
// failures that pass 3/3 in isolation.
//
// Imported lazily and only where a DOM exists: this setup file also runs for the
// server tests, and pulling React Testing Library in for those adds real import
// cost to every server test file.
if (typeof window !== "undefined") {
  const { configure } = await import("@testing-library/react");
  configure({ asyncUtilTimeout: 5_000 });
}
