// webhook-routes.js - ES Module version for Shopify CLI
import express from "express";
import { handleOrderPaid } from "./webhook-handlers.js";

const router = express.Router();

/**
 * Health check endpoint for webhooks
 */
router.get("/api/webhooks/health", (req, res) => {
  console.log("Health endpoint hit!");
  res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    service: "mission-global-donation-tracker"
  });
});

/**
 * Simple test endpoint (no Shopify session required)
 */
router.post("/api/webhooks/test/simple", async (req, res) => {
  console.log("Simple test endpoint hit!", req.body);

  try {
    const { productId, donationAmount } = req.body;

    // Just return a mock response for testing
    res.status(200).json({
      message: "Simple test successful - no Shopify API calls made",
      productId,
      donationAmount: parseFloat(donationAmount),
      mockTotal: parseFloat(donationAmount)
    });
  } catch (error) {
    console.error("Simple test error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Manual trigger endpoint for testing
 */
router.post("/api/webhooks/test/donation-update", async (req, res) => {
  console.log("Test donation endpoint hit!", req.body);

  try {
    const { productId, donationAmount, shopDomain } = req.body;

    if (!productId || !donationAmount || !shopDomain) {
      return res.status(400).json({
        error: "Missing required fields: productId, donationAmount, shopDomain"
      });
    }

    const session = await getSessionForShop(shopDomain);
    if (!session) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { updateProductDonationTotal } = await import("./webhook-handlers.js");
    const newTotal = await updateProductDonationTotal(session, productId, parseFloat(donationAmount));

    res.status(200).json({
      message: "Test donation update successful",
      productId,
      donationAmount: parseFloat(donationAmount),
      newTotal
    });
  } catch (error) {
    console.error("Test endpoint error:", error);
    res.status(500).json({ error: error.message });
  }
});


/**
 * Production webhook endpoint for order/paid events
 */
router.post("/api/webhooks/orders/paid", async (req, res) => {
  console.log("Order paid webhook hit!");

  try {
    const orderData = req.body;

    // Validate that this is actually a paid order
    if (orderData.financial_status !== 'paid') {
      console.log(`Order ${orderData.id} is not paid yet, skipping donation tracking`);
      return res.status(200).json({ message: "Order not paid, skipping" });
    }

    // Process donation tracking directly from webhook data
    let totalDonation = 0;
    const productUpdates = {};

    orderData.line_items.forEach(item => {
      const productId = item.product_id.toString();
      const quantity = item.quantity;
      const donationAmount = quantity; // Since price is $1, quantity = donation amount

      if (productUpdates[productId]) {
        productUpdates[productId] += donationAmount;
      } else {
        productUpdates[productId] = donationAmount;
      }

      totalDonation += donationAmount;
    });

    console.log("Donation processing:", {
      orderId: orderData.id,
      totalDonation,
      productUpdates
    });

    // For now, just log success - we'll add actual metafield updates in the next step
    console.log(`Successfully processed $${totalDonation} donation for products:`, Object.keys(productUpdates));

    res.status(200).json({
      message: "Donation tracking updated successfully",
      totalDonation,
      productsUpdated: Object.keys(productUpdates).length
    });
  } catch (error) {
    console.error("Webhook processing error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * Helper function to get session for a shop
 */
async function getSessionForShop(shopDomain) {
  try {
    // Import shopify instance from your shopify.js file
    const shopifyModule = await import("./shopify.js");
    const shopify = shopifyModule.default;

    // Use the session storage from Shopify CLI
    const sessions = await shopify.config.sessionStorage.findSessionsByShop(shopDomain);

    // Return the most recent active session
    if (sessions && sessions.length > 0) {
      // Find the session with the most scopes (usually the offline session)
      const offlineSession = sessions.find(session => session.isOnline === false);
      return offlineSession || sessions[0];
    }

    return null;
  } catch (error) {
    console.error("Error getting session:", error);
    return null;
  }
}

export default router;