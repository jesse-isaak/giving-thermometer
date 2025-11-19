// Add this to your existing web/index.js or app.js file

const express = require("express");
const { shopifyApp } = require("@shopify/shopify-app-express");
const webhookRoutes = require("./webhook-routes");

// Your existing shopify app setup
const shopify = shopifyApp({
  // your existing config
});

const app = express();

// IMPORTANT: Add webhook routes BEFORE the shopify middleware
// This ensures webhooks aren't blocked by authentication
app.use("/api", webhookRoutes);

// Your existing routes
app.use("/api/*", shopify.ensureInstalledOnShop(), async (req, res, next) => {
  // your existing API routes
  next();
});

// Add webhook registration during app installation
app.use("/api/webhooks/register", shopify.ensureInstalledOnShop(), async (req, res) => {
  try {
    const session = res.locals.shopify.session;
    
    // Register the order/paid webhook
    const webhook = {
      webhook: {
        topic: 'orders/paid',
        address: `${process.env.SHOPIFY_APP_URL}/api/webhooks/orders/paid`,
        format: 'json'
      }
    };

    const client = new session.restClient();
    const response = await client.post({
      path: 'webhooks',
      data: webhook,
    });

    console.log('Webhook registered:', response.body);
    res.status(200).json({ message: "Webhook registered successfully", webhook: response.body });
  } catch (error) {
    console.error('Webhook registration failed:', error);
    res.status(500).json({ error: "Failed to register webhook" });
  }
});

// Add endpoint to check current donation total for a product
app.use("/api/donation-total/:productId", shopify.ensureInstalledOnShop(), async (req, res) => {
  try {
    const { productId } = req.params;
    const session = res.locals.shopify.session;
    
    const { getCurrentDonationTotal } = require("./webhook-handlers");
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

// Your existing app setup continues...

module.exports = { app, shopify };
