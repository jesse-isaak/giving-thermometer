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
 * Update or create donation metafield using existing app session
 */
async function updateProductDonationMetafield(productId, newDonationAmount) {
  try {
    // Import your existing shopify instance
    const shopifyModule = await import("./shopify.js");
    const shopify = shopifyModule.default;

    // Get an offline session for your store
    const sessions = await shopify.config.sessionStorage.findSessionsByShop('misg-checkout-extension.myshopify.com');
    const session = sessions?.find(s => !s.isOnline) || sessions?.[0];

    if (!session) {
      throw new Error('No valid session found for store');
    }

    console.log(`Using session for ${session.shop}`);

    // Create REST client with existing session
    const client = new shopify.clients.Rest({ session });

    // Get current metafields
    let currentTotal = 0;
    let metafieldId = null;

    try {
      const metafields = await client.get({
        path: `products/${productId}/metafields`,
      });

      const existingMetafield = metafields.body.metafields?.find(
        m => m.namespace === 'mission_global_integration' && m.key === 'donation_total_value'
      );

      if (existingMetafield) {
        currentTotal = parseFloat(existingMetafield.value) || 0;
        metafieldId = existingMetafield.id;
      }
    } catch (error) {
      console.log('No existing metafield found, will create new one');
    }

    const newTotal = currentTotal + newDonationAmount;

    // Create or update metafield
    const metafieldData = {
      metafield: {
        namespace: 'mission_global_integration',
        key: 'donation_total_value',
        value: newTotal.toString(),
        type: 'number_decimal'
      }
    };

    let result;
    if (metafieldId) {
      // Update existing
      result = await client.put({
        path: `products/${productId}/metafields/${metafieldId}`,
        data: metafieldData
      });
    } else {
      // Create new
      result = await client.post({
        path: `products/${productId}/metafields`,
        data: metafieldData
      });
    }

    console.log(`✅ METAFIELD ${metafieldId ? 'UPDATED' : 'CREATED'} for product ${productId}: ${currentTotal} + ${newDonationAmount} = ${newTotal}`);
    return newTotal;

  } catch (error) {
    console.error('❌ Metafield update error:', error);
    throw error;
  }
}

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