// webhook-handlers.js - ES Module version for Shopify CLI
// New version: uses Admin GraphQL directly with an access token,
// calculates donation from product.totalSales, and writes a metafield.

const SHOP_DOMAIN =
  process.env.SHOPIFY_SHOP_DOMAIN || "misg-checkout-extension.myshopify.com";

const ADMIN_API_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;

// $ per unit sold – can make this configurable if you ever need.
const DONATION_RATE_PER_UNIT = parseFloat(
  process.env.DONATION_RATE_PER_UNIT || "1"
);

if (!ADMIN_API_ACCESS_TOKEN) {
  console.warn(
    "⚠️ SHOPIFY_ADMIN_API_ACCESS_TOKEN is not set. Donation syncing will fail until this is configured."
  );
}

/**
 * Generic small helper for calling the Admin GraphQL API
 */
async function adminGraphql(query, variables = {}) {
  const url = `https://${SHOP_DOMAIN}/admin/api/2023-10/graphql.json`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": ADMIN_API_ACCESS_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("❌ Admin GraphQL HTTP error:", res.status, text);
    throw new Error(`Admin GraphQL HTTP ${res.status}`);
  }

  const json = await res.json();

  if (json.errors) {
    console.error("❌ Admin GraphQL errors:", JSON.stringify(json.errors));
    throw new Error("Admin GraphQL returned errors");
  }

  return json.data;
}

/**
 * Get product.totalSales from Shopify
 */
async function getProductTotalSales(productId) {
  const query = `
    query getProductTotalSales($id: ID!) {
      product(id: $id) {
        id
        totalSales
      }
    }
  `;

  const variables = {
    id: `gid://shopify/Product/${productId}`,
  };

  const data = await adminGraphql(query, variables);
  const totalSales = data?.product?.totalSales ?? 0;

  return parseInt(totalSales, 10) || 0;
}

/**
 * Set the donation metafield for a product, based on computed donation value
 */
async function setProductDonationMetafield(productId, donationValue) {
  const mutation = `
    mutation metafieldSet($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields {
          id
          namespace
          key
          value
          type
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const variables = {
    metafields: [
      {
        ownerId: `gid://shopify/Product/${productId}`,
        namespace: "mission_global_integration",
        key: "donation_total_value",
        // donationValue is a number – store as decimal string
        value: donationValue.toString(),
        type: "number_decimal",
      },
    ],
  };

  const data = await adminGraphql(mutation, variables);
  const result = data.metafieldsSet;

  if (result.userErrors && result.userErrors.length > 0) {
    console.error(
      "❌ Metafield set userErrors:",
      JSON.stringify(result.userErrors)
    );
    throw new Error(
      `Metafield update failed: ${JSON.stringify(result.userErrors)}`
    );
  }

  console.log(
    `✅ Donation metafield updated for product ${productId}: ${donationValue}`
  );

  return donationValue;
}

/**
 * Public helper: recompute + update donation total for a specific product
 * based on product.totalSales
 */
export async function syncDonationForProduct(productId) {
  const totalSales = await getProductTotalSales(productId);
  const donationValue = totalSales * DONATION_RATE_PER_UNIT;

  console.log(
    `🔢 Calculated donation for product ${productId}: totalSales=${totalSales}, donation=${donationValue}`
  );

  return await setProductDonationMetafield(productId, donationValue);
}

/**
 * Webhook handler: handles order payment webhook to update donation totals.
 * Idempotent: it *recomputes* from totalSales, so retries are safe.
 */
export async function handleOrderPaid(orderData) {
  try {
    console.log(`🧾 Processing order ${orderData.id} for donation tracking`);

    // Collect unique product IDs from line items
    const productIds = new Set();

    (orderData.line_items || []).forEach((item) => {
      if (item.product_id) {
        productIds.add(item.product_id);
      }
    });

    if (productIds.size === 0) {
      console.log(
        `ℹ️ Order ${orderData.id} has no line items with product_id – nothing to sync.`
      );
      return;
    }

    for (const productId of productIds) {
      try {
        await syncDonationForProduct(productId);
      } catch (err) {
        console.error(
          `❌ Failed to sync donation for product ${productId} in order ${orderData.id}:`,
          err
        );
      }
    }

    console.log(
      `✅ Successfully synced donation totals for order ${orderData.id}`
    );
  } catch (error) {
    console.error(
      `❌ Error processing donation for order ${orderData.id}:`,
      error
    );
    throw error;
  }
}

/**
 * Get the *current* donation total for a product by reading the metafield.
 * This is used by your /api/donation-total/:productId endpoint.
 */
export async function getCurrentDonationTotal(productId) {
  try {
    const query = `
      query getDonationMetafield($id: ID!) {
        product(id: $id) {
          metafield(namespace: "mission_global_integration", key: "donation_total_value") {
            value
          }
        }
      }
    `;

    const variables = {
      id: `gid://shopify/Product/${productId}`,
    };

    const data = await adminGraphql(query, variables);
    const value = data?.product?.metafield?.value;

    const parsed = value ? parseFloat(value) : 0;
    return isNaN(parsed) ? 0 : parsed;
  } catch (error) {
    console.error(
      `❌ Error getting current donation total for product ${productId}:`,
      error
    );
    // Fallback to 0 on error so UI doesn’t explode
    return 0;
  }
}
