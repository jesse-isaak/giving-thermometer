// webhook-handlers.js
const SHOP_DOMAIN = "pentecostal-assemblies-of-canada.myshopify.com";
const ADMIN_API_VERSION = "2025-10";
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

  const text = await res.text();
  let json = {};
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response: ${text}`);
  }

  if (!res.ok) {
    console.error("Admin GraphQL HTTP error:", res.status, json);
    throw new Error(`Admin GraphQL HTTP ${res.status}`);
  }

  if (json.errors) {
    console.error("Admin GraphQL errors:", JSON.stringify(json.errors, null, 2));
    throw new Error(JSON.stringify(json.errors));
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
    throw new Error(JSON.stringify(userErrors));
  }

  return result.data?.metafieldsSet?.metafields || [];
}

export async function getShopifyAutomaticDonationTotal(productId) {
  const shopifyQl = `
FROM sales
SHOW net_sales
WHERE product_id = ${productId}
SINCE startOfDay(-500d) UNTIL today
`;

  const query = `
    query getNetSales($query: String!) {
      shopifyqlQuery(query: $query) {
        tableData {
          columns {
            name
            dataType
            displayName
          }
          rows
        }
        parseErrors
      }
    }
  `;

  const result = await callAdminGraphQL(query, { query: shopifyQl });
  const payload = result.data?.shopifyqlQuery;

  if (payload?.parseErrors?.length) {
    throw new Error(JSON.stringify(payload.parseErrors));
  }

  const rows = payload?.tableData?.rows || [];

  if (!rows.length || !rows[0]?.length) {
    return 0;
  }

  const raw = rows[0][0];
  const parsed = parseFloat(raw);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export async function syncProductDonationTotalFromShopify(productId) {
  const automaticTotal = await getShopifyAutomaticDonationTotal(productId);

  await setProductMetafields(productId, {
    donation_total_value: automaticTotal,
  });

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

  return manualAmount;
}

export async function handleOrderPaid(orderData) {
  try {
    if (!Array.isArray(orderData.line_items)) return;

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
  } catch (error) {
    console.error(`Error processing donation for order ${orderData.id}:`, error);
    throw error;
  }
}