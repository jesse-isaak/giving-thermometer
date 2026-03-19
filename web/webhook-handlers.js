// webhook-handlers.js
// Automatic total comes from Shopify product sales
// Manual total is stored separately in metafields

const SHOP_DOMAIN = "pentecostal-assemblies-of-canada.myshopify.com";
const ADMIN_API_VERSION = "2023-10";
const ADMIN_API_URL = `https://${SHOP_DOMAIN}/admin/api/${ADMIN_API_VERSION}/graphql.json`;
const ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;
const NAMESPACE = "mission_global_integration";

async function callAdminGraphQL(query, variables = {}) {
  if (!ACCESS_TOKEN) {
    throw new Error("SHOPIFY_ADMIN_API_ACCESS_TOKEN is not set in environment");
  }

  const res = await fetch(ADMIN_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": ACCESS_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("Admin GraphQL HTTP error:", res.status, text);
    throw new Error(`Admin GraphQL HTTP ${res.status}`);
  }

  const json = await res.json();

  if (json.errors) {
    console.error("Admin GraphQL errors:", JSON.stringify(json.errors, null, 2));
    throw new Error("Admin GraphQL returned errors");
  }

  return json;
}

async function getProductMetafields(productId) {
  const query = `
    query getProductMetafields($id: ID!) {
      product(id: $id) {
        donationTotal: metafield(namespace: "${NAMESPACE}", key: "donation_total_value") {
          value
        }
        manualDonationTotal: metafield(namespace: "${NAMESPACE}", key: "manual_donation_total") {
          value
        }
      }
    }
  `;

  const variables = {
    id: `gid://shopify/Product/${productId}`,
  };

  const result = await callAdminGraphQL(query, variables);
  const product = result.data?.product;

  return {
    donationTotal: parseFloat(product?.donationTotal?.value || "0") || 0,
    manualDonationTotal: parseFloat(product?.manualDonationTotal?.value || "0") || 0,
  };
}

async function setProductMetafields(productId, fields) {
  const metafields = Object.entries(fields).map(([key, value]) => ({
    ownerId: `gid://shopify/Product/${productId}`,
    namespace: NAMESPACE,
    key,
    value: String(value),
    type: "single_line_text_field",
  }));

  const mutation = `
    mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields {
          key
          value
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const result = await callAdminGraphQL(mutation, { metafields });
  const userErrors = result.data?.metafieldsSet?.userErrors || [];

  if (userErrors.length) {
    console.error("Metafield update userErrors:", userErrors);
    throw new Error(JSON.stringify(userErrors));
  }

  return result.data?.metafieldsSet?.metafields || [];
}

/**
 * Pull automatic donation total from Shopify product sales.
 *
 * NOTE:
 * This uses totalSales on the product object.
 * If your donation product is $1 per unit, this should usually align closely to sales.
 * If you specifically need net sales after refunds/discounts exactly as shown in analytics,
 * we may need a different query/reporting approach.
 */
export async function getShopifyAutomaticDonationTotal(productId) {
  const query = `
    query getProductSales($id: ID!) {
      product(id: $id) {
        id
        totalSales
      }
    }
  `;

  const variables = {
    id: `gid://shopify/Product/${productId}`,
  };

  const result = await callAdminGraphQL(query, variables);
  const totalSales = result.data?.product?.totalSales ?? 0;
  const parsed = parseFloat(totalSales);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Sync the automatic donation total metafield from Shopify sales.
 */
export async function syncProductDonationTotalFromShopify(productId) {
  const automaticTotal = await getShopifyAutomaticDonationTotal(productId);

  await setProductMetafields(productId, {
    donation_total_value: automaticTotal,
  });

  console.log(
    `✅ Synced automatic donation total for product ${productId}: ${automaticTotal}`
  );

  return automaticTotal;
}

export async function getCurrentDonationTotal(productId) {
  const { donationTotal } = await getProductMetafields(productId);
  return donationTotal;
}

export async function getManualDonationTotal(productId) {
  const { manualDonationTotal } = await getProductMetafields(productId);
  return manualDonationTotal;
}

export async function getDisplayDonationTotal(productId) {
  const { donationTotal, manualDonationTotal } = await getProductMetafields(productId);
  return donationTotal + manualDonationTotal;
}

export async function setManualDonationTotal(productId, manualAmount) {
  await setProductMetafields(productId, {
    manual_donation_total: manualAmount,
  });

  console.log(
    `✅ Set manual donation total for product ${productId}: ${manualAmount}`
  );

  return manualAmount;
}

/**
 * orders/paid webhook:
 * Instead of incrementing, just resync from Shopify sales.
 */
export async function handleOrderPaid(orderData) {
  try {
    console.log(`Processing order ${orderData.id} for donation sync`);

    if (!Array.isArray(orderData.line_items)) {
      console.warn("No line_items on order:", orderData.id);
      return;
    }

    const productIds = [
      ...new Set(
        orderData.line_items
          .map((item) => item.product_id?.toString())
          .filter(Boolean)
      ),
    ];

    for (const productId of productIds) {
      await syncProductDonationTotalFromShopify(productId);
    }

    console.log(`Successfully synced donation totals for order ${orderData.id}`);
  } catch (error) {
    console.error(`Error processing donation for order ${orderData.id}:`, error);
    throw error;
  }
}