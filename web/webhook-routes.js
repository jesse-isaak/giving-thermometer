// webhook-routes.js - ES Module version for Shopify CLI
import express from "express";
import { handleOrderPaid, updateProductDonationTotal } from "./webhook-handlers.js";

const router = express.Router();

/**
 * Health check endpoint
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
 * Simple test endpoint
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
 * Manual donation update for testing
 */
router.post("/api/webhooks/test/donation-update", async (req, res) => {
  console.log("Test donation endpoint hit!", req.body);

  try {
    const { productId, donationAmount } = req.body;

    if (!productId || !donationAmount) {
      return res.status(400).json({
        error: "Missing required fields: productId, donationAmount",
      });
    }

    const newTotal = await updateProductDonationTotal(productId, parseFloat(donationAmount));

    res.status(200).json({
      message: "Test donation update successful",
      productId,
      donationAmount,
      newTotal,
    });
  } catch (error) {
    console.error("Test endpoint error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Shopify orders/paid webhook handler
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

    res.status(200).send("ok");
  } catch (error) {
    console.error("❌ Error handling orders/paid webhook:", error);
    res.status(500).send("Error");
  }
});

export default router;
