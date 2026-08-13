import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { dataUrlToBuffer, sanitizeDocumentName } from "../documentUpload";
import { storagePut } from "../storage";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  app.post("/api/documents", async (req, res) => {
    try {
      const { fileName, mimeType, dataUrl } = req.body as { fileName?: string; mimeType?: string; dataUrl?: string };
      if (!fileName || !mimeType || !dataUrl) return res.status(400).json({ error: "Document details are required" });
      const buffer = dataUrlToBuffer(dataUrl);
      if (buffer.length === 0 || buffer.length > 10 * 1024 * 1024) return res.status(400).json({ error: "Documents must be smaller than 10 MB" });
      const safeName = sanitizeDocumentName(fileName);
      const { key, url } = await storagePut(`bridge/referral-documents/${Date.now()}-${safeName}`, buffer, mimeType);
      res.status(201).json({ id: crypto.randomUUID(), fileName, mimeType, fileSize: buffer.length, key, url });
    } catch (error) {
      console.error("Document upload failed", error);
      res.status(500).json({ error: "We could not upload that document. Please try again." });
    }
  });
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
