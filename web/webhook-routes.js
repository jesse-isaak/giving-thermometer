// webhook-routes.js
import express from "express";
import {
  handleOrderPaid,
  syncProductDonationTotalFromShopify,
  setManualDonationTotal,
  getDisplayDonationTotal,
  getCurrentDonationTotal,
  getManualDonationTotal,
} from "./webhook-handlers.js";

const router = express.Router();

router.get("/api/webhooks/health", (req, res) => {
  res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    service: "mission-global-donation-tracker",
  });
});

/**
 * Manual sync from Shopify sales
 */
router.post("/api/webhooks/test/donation-sync", async (req, res) => {
  try {
    const { productId } = req.body;

    if (!productId) {
      return res.status(400).json({
        error: "Missing required field: productId",
      });
    }

    const automaticTotal = await syncProductDonationTotalFromShopify(productId);
    const manualTotal = await getManualDonationTotal(productId);
    const displayTotal = automaticTotal + manualTotal;

    res.status(200).json({
      message: "Donation total synced from Shopify successfully",
      productId,
      automaticTotal,
      manualTotal,
      displayTotal,
    });
  } catch (error) {
    console.error("Donation sync error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Manual donation edit route
 */
router.post("/api/webhooks/test/manual-donation-update", async (req, res) => {
  try {
    const { productId, manualDonationAmount } = req.body;

    if (!productId || manualDonationAmount === undefined) {
      return res.status(400).json({
        error: "Missing required fields: productId, manualDonationAmount",
      });
    }

    const manualTotal = await setManualDonationTotal(
      productId,
      parseFloat(manualDonationAmount)
    );

    const automaticTotal = await getCurrentDonationTotal(productId);
    const displayTotal = automaticTotal + manualTotal;

    res.status(200).json({
      message: "Manual donation total updated successfully",
      productId,
      automaticTotal,
      manualTotal,
      displayTotal,
    });
  } catch (error) {
    console.error("Manual donation update error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Read totals route
 */
router.get("/api/webhooks/test/donation-totals/:productId", async (req, res) => {
  try {
    const { productId } = req.params;

    const automaticTotal = await getCurrentDonationTotal(productId);
    const manualTotal = await getManualDonationTotal(productId);
    const displayTotal = await getDisplayDonationTotal(productId);

    res.status(200).json({
      productId,
      automaticTotal,
      manualTotal,
      displayTotal,
    });
  } catch (error) {
    console.error("Donation totals read error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Shopify orders/paid webhook
 */
router.post("/api/webhooks/orders/paid", async (req, res) => {
  try {
    const orderData = req.body;

    if (!orderData || !orderData.id) {
      return res.status(400).send("Invalid payload");
    }

    await handleOrderPaid(orderData);
    res.status(200).send("ok");
  } catch (error) {
    console.error("Error handling orders/paid webhook:", error);
    res.status(500).send("Error");
  }
});

export default router;