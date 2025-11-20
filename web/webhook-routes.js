// webhook-routes.js - ES Module version for Shopify CLI
import express from "express";
import { handleOrderPaid, syncDonationForProduct } from "./webhook-handlers.js";

const router = express.Router();

/**
 * Health check endpoint for webhooks
 */
router.get("/api/webhooks/health", (req, res) => {
  console.log("Health endpoint hit!");
  res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    service: "mission-global-donation-tracker",
  });
});

/**
 * Simple test endpoint (no Shopify session required)
 */
router.post("/api/webhooks/test/simple", async (req, res) => {
  console.log("Simple test endpoint hit!", req.body);

  try {
    const { productId, donationAmount } = req.body;

    res.status(200).json({
      message: "Simple test successful - no Shopify API calls made",
      productId,
      donationAmount: parseFloat(donationAmount),
      mockTotal: parseFloat(donationAmount),
    });
  } catch (error) {
    console.error("Simple test error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Manual trigger endpoint for testing donation sync for a product.
 * This recomputes donation from product.totalSales and updates the metafield.
 */
router.post("/api/webhooks/test/donation-update", async (req, res) => {
  console.log("Test donation endpoint hit!", req.body);

  try {
    const { productId } = req.body;

    if (!productId) {
      return res.status(400).json({
        error: "Missing required field: productId",
      });
    }

    const newTotal = await syncDonationForProduct(productId);

    res.status(200).json({
      message:
        "Test donation sync successful (recomputed from product.totalSales)",
      productId,
      donationTotal: newTotal,
    });
  } catch (error) {
    console.error("Test endpoint error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Real Shopify webhook endpoint:
 * Configure your `orders/paid` webhook to POST here.
 *
 * In shopify.app.toml:
 *   [[webhooks.subscriptions]]
 *   topics = ["orders/paid"]
 *   uri = "/api/webhooks/orders/paid"
 */
router.post("/api/webhooks/orders/paid", async (req, res) => {
  try {
    console.log("🛎️ Order paid webhook hit!");
    const orderData = req.body;

    if (!orderData || !orderData.id) {
      console.error("Invalid order payload:", orderData);
      return res.status(400).send("Invalid payload");
    }

    await handleOrderPaid(orderData);

    // Respond 200 quickly so Shopify doesn’t retry unnecessarily
    res.status(200).send("ok");
  } catch (error) {
    console.error("❌ Error handling orders/paid webhook:", error);
    // Let Shopify retry on 500 – but our handler is idempotent
    res.status(500).send("Error");
  }
});

export default router;
