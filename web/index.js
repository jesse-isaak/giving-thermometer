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

// Add JSON parsing
app.use(express.json());

// Set up Shopify authentication
app.get(shopify.config.auth.path, shopify.auth.begin());
app.get(
  shopify.config.auth.callbackPath,
  shopify.auth.callback(),
  shopify.redirectToShopifyOrAppRoot()
);

// Add your webhook routes BEFORE ensureInstalledOnShop
// Add your webhook routes BEFORE ensureInstalledOnShop
app.use(webhookRoutes);

// Debug logging - add these lines:
console.log('Webhook routes registered');
console.log('Available routes:');
app._router.stack.forEach(function(r){
  if (r.route && r.route.path){
    console.log('  Route:', r.route.methods, r.route.path);
  } else if (r.name === 'router') {
    r.handle.stack.forEach(function(rr) {
      if (rr.route) {
        console.log('  Router route:', rr.route.methods, rr.route.path);
      }
    });
  }
});

// Shopify webhook processing
app.post(
  shopify.config.webhooks.path,
  shopify.processWebhooks({ webhookHandlers: {} })
);

// API route for getting donation totals (needs auth)
app.get("/api/donation-total/:productId", shopify.ensureInstalledOnShop(), async (req, res) => {
  try {
    const { productId } = req.params;
    const session = res.locals.shopify.session;
    
    const total = await getCurrentDonationTotal(session, productId);
    
    res.status(200).json({ 
      productId,
      donationTotal: total
    });
  } catch (error) {
    console.error('Error getting donation total:', error);
    res.status(500).json({ error: "Failed to get donation total" });
  }
});

// Webhook registration endpoint (needs auth)
app.post("/api/webhooks/register", shopify.ensureInstalledOnShop(), async (req, res) => {
  try {
    const session = res.locals.shopify.session;
    
    await handleAppInstallation(session);
    res.status(200).json({ message: "Webhooks registered successfully" });
  } catch (error) {
    console.error('Webhook registration failed:', error);
    res.status(500).json({ error: "Failed to register webhooks" });
  }
});

// REMOVE THIS LINE:
// app.use("/api/*", shopify.ensureInstalledOnShop());

// Serve static files from frontend
app.use(shopify.cspHeaders());
app.use(serveStatic(STATIC_PATH, { index: false }));

// Handle frontend routing - send all non-API requests to index.html
app.use("/*", shopify.ensureInstalledOnShop(), async (_req, res, _next) => {
  return res
    .status(200)
    .set("Content-Type", "text/html")
    .send(readFileSync(join(STATIC_PATH, "index.html")));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});