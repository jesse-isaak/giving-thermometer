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

    // Process donation tracking and update metafields
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
    });

    console.log("Donation processing:", {
      orderId: orderData.id,
      productUpdates
    });

    // Update metafields for each product
    for (const [productId, donationAmount] of Object.entries(productUpdates)) {
      try {
        await updateProductDonationMetafield(productId, donationAmount);
        console.log(`Updated metafield for product ${productId}: +$${donationAmount}`);
      } catch (error) {
        console.error(`Failed to update metafield for product ${productId}:`, error);
      }
    }

    res.status(200).json({
      message: "Donation tracking updated successfully",
      productsUpdated: Object.keys(productUpdates).length
    });
  } catch (error) {
    console.error("Webhook processing error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * Update or create donation metafield for a product using REST API
 */
async function updateProductDonationMetafield(productId, newDonationAmount) {
  try {
    const shopDomain = 'misg-checkout-extension.myshopify.com';
    const apiKey = process.env.SHOPIFY_API_KEY;
    const apiPassword = process.env.SHOPIFY_API_SECRET;

    // Create authorization header
    const auth = Buffer.from(`${apiKey}:${apiPassword}`).toString('base64');
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${auth}`
    };

    // Get current metafield value
    const getUrl = `https://${shopDomain}/admin/api/2023-10/products/${productId}/metafields.json`;

    const getResponse = await fetch(getUrl, { headers });
    const currentMetafields = await getResponse.json();

    let currentTotal = 0;
    let metafieldId = null;

    // Find existing donation metafield
    if (currentMetafields.metafields) {
      const existingMetafield = currentMetafields.metafields.find(
        m => m.namespace === 'mission_global_integration' && m.key === 'donation_total_value'
      );

      if (existingMetafield) {
        currentTotal = parseFloat(existingMetafield.value) || 0;
        metafieldId = existingMetafield.id;
      }
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

    let updateUrl, method;
    if (metafieldId) {
      // Update existing metafield
      updateUrl = `https://${shopDomain}/admin/api/2023-10/products/${productId}/metafields/${metafieldId}.json`;
      method = 'PUT';
    } else {
      // Create new metafield
      updateUrl = `https://${shopDomain}/admin/api/2023-10/products/${productId}/metafields.json`;
      method = 'POST';
    }

    const updateResponse = await fetch(updateUrl, {
      method: method,
      headers: headers,
      body: JSON.stringify(metafieldData)
    });

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      throw new Error(`Metafield update failed: ${updateResponse.status} - ${errorText}`);
    }

    const result = await updateResponse.json();
    console.log(`Metafield ${method === 'PUT' ? 'updated' : 'created'} for product ${productId}: ${currentTotal} + ${newDonationAmount} = ${newTotal}`);

    return newTotal;
  } catch (error) {
    console.error('Metafield update error:', error);
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