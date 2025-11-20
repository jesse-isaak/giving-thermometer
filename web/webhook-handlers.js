// webhook-handlers.js
// Uses direct Admin GraphQL calls with the offline token from env

const SHOP_DOMAIN = "pentecostal-assemblies-of-canada.myshopify.com";
const ADMIN_API_VERSION = "2023-10";
const ADMIN_API_URL = `https://${SHOP_DOMAIN}/admin/api/${ADMIN_API_VERSION}/graphql.json`;
const ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;

/**
 * Helper: Call Shopify Admin GraphQL API using fetch + offline token
 */
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

/**
 * Handles order payment webhook to update donation totals
 */
export async function handleOrderPaid(orderData) {
  try {
    console.log(`Processing order ${orderData.id} for donation tracking`);

    const productDonations = {};

    if (!orderData.line_items || !Array.isArray(orderData.line_items)) {
      console.warn("No line_items on order:", orderData.id);
      return;
    }

    orderData.line_items.forEach((item) => {
      const productId = item.product_id && item.product_id.toString();
      const quantity = item.quantity || 0;
      const donationAmount = quantity; // $1 per unit → quantity = donation

      if (productId) {
        productDonations[productId] =
          (productDonations[productId] || 0) + donationAmount;
      }
    });

    for (const [productId, donationAmount] of Object.entries(
      productDonations
    )) {
      await updateProductDonationTotal(productId, donationAmount);
    }

    console.log(`Successfully updated donation totals for order ${orderData.id}`);
  } catch (error) {
    console.error(`Error processing donation for order ${orderData.id}:`, error);
    throw error;
  }
}

/**
 * Updates the donation total metafield for a specific product
 */
export async function updateProductDonationTotal(productId, newDonationAmount) {
  try {
    const currentTotal = await getCurrentDonationTotal(productId);
    const updatedTotal = currentTotal + newDonationAmount;

    const metafieldMutation = `
      mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields {
            id
            namespace
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

    const variables = {
      metafields: [
        {
          ownerId: `gid://shopify/Product/${productId}`,
          namespace: "mission_global_integration",
          key: "donation_total_value",
          value: updatedTotal.toString(),
          type: "single_line_text_field",
        },
      ],
    };

    const result = await callAdminGraphQL(metafieldMutation, variables);
    const userErrors =
      result.data?.metafieldsSet?.userErrors ||
      result.body?.data?.metafieldsSet?.userErrors ||
      [];

    if (userErrors.length > 0) {
      console.error("Metafield update userErrors:", userErrors);
      throw new Error(JSON.stringify(userErrors));
    }

    console.log(
      `✅ METAFIELD UPDATED for product ${productId}: ${currentTotal} + ${newDonationAmount} = ${updatedTotal}`
    );
    return updatedTotal;
  } catch (error) {
    console.error(
      `❌ Error updating donation total for product ${productId}:`,
      error
    );
    throw error;
  }
}

/**
 * Gets the current donation total from the product's metafield
 */
export async function getCurrentDonationTotal(productId) {
  try {
    const query = `
      query getProductMetafield($id: ID!) {
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

    const result = await callAdminGraphQL(query, variables);
    const metafieldValue =
      result.data?.product?.metafield?.value ||
      result.body?.data?.product?.metafield?.value;

    const parsed = metafieldValue ? parseFloat(metafieldValue) : 0;
    if (Number.isNaN(parsed)) return 0;
    return parsed;
  } catch (error) {
    console.error(
      `❌ Error getting current donation total for product ${productId}:`,
      error
    );
    return 0;
  }
}
