// web/index.js
import { join } from "path";
import { readFileSync, existsSync } from "fs";
import express from "express";
import serveStatic from "serve-static";
import shopify from "./shopify.js";
import webhookRoutes from "./webhook-routes.js";
import { handleAppInstallation } from "./installation-handler.js";
import { getCurrentDonationTotal } from "./webhook-handlers.js";

const PORT = parseInt(process.env.BACKEND_PORT || process.env.PORT || "3000", 10);

const STATIC_PATH =
  process.env.NODE_ENV === "production"
    ? `${process.cwd()}/frontend/dist`
    : `${process.cwd()}/frontend`;

const app = express();

app.use(express.json());

// CORS
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");

  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// Auth routes
app.get(shopify.config.auth.path, shopify.auth.begin({ isOnline: false }));
app.get(
  shopify.config.auth.callbackPath,
  shopify.auth.callback({ isOnline: false }),
  shopify.redirectToShopifyOrAppRoot()
);

// Webhooks
app.post(
  shopify.config.webhooks.path,
  shopify.processWebhooks({ webhookHandlers: {} })
);

// Include webhook custom routes
app.use(webhookRoutes);

// --- TEMP ENDPOINT to create OFFLINE token manually ------
app.get("/api/create-offline-token", shopify.ensureInstalledOnShop(), async (req, res) => {
  try {
    const session = res.locals.shopify.session;

    const offlineId = shopify.api.session.getOfflineId(session.shop);

    const offlineSession = new shopify.api.session.Session({
      id: offlineId,
      shop: session.shop,
      state: "",
      isOnline: false,
      scope: session.scope,
      accessToken: session.accessToken,
    });

    await shopify.config.sessionStorage.storeSession(offlineSession);

    res.status(200).json({ message: "Offline token saved successfully", session: offlineSession });
  } catch (error) {
    console.error("Error creating offline token:", error);
    res.status(500).json({ error: error.message });
  }
});

// Test endpoint to fetch donation totals
app.get("/api/donation-total/:productId", shopify.ensureInstalledOnShop(), async (req, res) => {
  try {
    const { productId } = req.params;
    const session = res.locals.shopify.session;
    const total = await getCurrentDonationTotal(session, productId);

    res.status(200).json({ productId, donationTotal: total });
  } catch (error) {
    res.status(500).json({ error: "Failed to get donation total" });
  }
});

// Serve static frontend (if exists)
app.use(shopify.cspHeaders());
app.use(serveStatic(STATIC_PATH, { index: false }));

// Catch-all route for embedded UI
app.use("/*", shopify.ensureInstalledOnShop(), async (_req, res) => {
  const filePath = join(STATIC_PATH, "index.html");

  if (!existsSync(filePath)) {
    res.send(`<html><body><h1>Giving Thermometer Installed</h1><p>Frontend is not built yet.</p></body></html>`);
  } else {
    res.status(200).set("Content-Type", "text/html").send(readFileSync(filePath));
  }
});

// Start server
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
