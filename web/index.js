import { join } from "path";
import { readFileSync } from "fs";
import express from "express";
import serveStatic from "serve-static";
import shopify from "./shopify.js";
import webhookRoutes from "./webhook-routes.js";
import { handleAppInstallation } from "./installation-handler.js";
import { getCurrentDonationTotal } from "./webhook-handlers.js";

const PORT = parseInt(
  process.env.BACKEND_PORT || process.env.PORT || "3000",
  10
);

const STATIC_PATH =
  process.env.NODE_ENV === "production"
    ? `${process.cwd()}/frontend/dist`
    : `${process.cwd()}/frontend/`;

const app = express();

// Global JSON parser (fine for our webhook route which uses JSON body)
app.use(express.json());

// Basic CORS
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS"
  );
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization"
  );

  if (req.method === "OPTIONS") {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Shopify auth
app.get(shopify.config.auth.path, shopify.auth.begin());
app.get(
  shopify.config.auth.callbackPath,
  shopify.auth.callback(),
  shopify.redirectToShopifyOrAppRoot()
);

// Our webhook + test routes
app.use(webhookRoutes);

// Debug logging for routes
console.log("Webhook routes registered");
console.log("Available routes:");
app._router.stack.forEach(function (r) {
  if (r.route && r.route.path) {
    console.log("  Route:", r.route.methods, r.route.path);
  } else if (r.name === "router") {
    r.handle.stack.forEach(function (rr) {
      if (rr.route) {
        console.log("  Router route:", rr.route.methods, rr.route.path);
      }
    });
  }
});

// Shopify webhook processing (you can still use this for other topics if desired)
app.post(
  shopify.config.webhooks.path,
  shopify.processWebhooks({ webhookHandlers: {} })
);

// API route for getting donation totals (needs auth)
app.get(
  "/api/donation-total/:productId",
  shopify.ensureInstalledOnShop(),
  async (req, res) => {
    try {
      const { productId } = req.params;

      // We no longer need the session for this, it’s read via Admin API token
      const total = await getCurrentDonationTotal(productId);

      res.status(200).json({
        productId,
        donationTotal: total,
      });
    } catch (error) {
      console.error("Error getting donation total:", error);
      res.status(500).json({ error: "Failed to get donation total" });
    }
  }
);

// Webhook registration endpoint (unchanged)
app.post(
  "/api/webhooks/register",
  shopify.ensureInstalledOnShop(),
  async (req, res) => {
    try {
      const session = res.locals.shopify.session;

      await handleAppInstallation(session);
      res.status(200).json({ message: "Webhooks registered successfully" });
    } catch (error) {
      console.error("Webhook registration failed:", error);
      res.status(500).json({ error: "Failed to register webhooks" });
    }
  }
);

// Static frontend
app.use(shopify.cspHeaders());
app.use(serveStatic(STATIC_PATH, { index: false }));

// Frontend catch-all
app.use("/*", shopify.ensureInstalledOnShop(), async (_req, res, _next) => {
  return res
    .status(200)
    .set("Content-Type", "text/html")
    .send(readFileSync(join(STATIC_PATH, "index.html")));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
