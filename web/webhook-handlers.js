// webhook-handlers.js - Production-ready metafield update handlers

import shopify from "./shopify.js";
import { GraphqlClient } from "@shopify/shopify-api";

/**
 * Handles order payment webhook to update donation totals
 */
export async function handleOrderPaid(orderData) {
  try {
    console.log(`Processing order ${orderData.id} for donation tracking`);

    // Group line items by product ID
    const productDonations = {};

    orderData.line_items.forEach(item => {
      const productId = item.product_id?.toString();
      const quantity = item.quantity;
      const donationAmount = quantity; // $1 per unit, quantity = donation amount

      if (productId) {
        productDonations[productId] = (productDonations[productId] || 0) + donationAmount;
      }
    });

    // Update product donation totals
    for (const [productId, donationAmount] of Object.entries(productDonations)) {
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
      mutation metafieldSet($metafields: [MetafieldsSetInput!]!) {
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
          type: "number_decimal"
        }
      ]
    };

    const client = new GraphqlClient({
      session: {
        shop: "pentecostal-assemblies-of-canada.myshopify.com",
        accessToken: process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN
      }
    });

    const response = await client.query({
      data: {
        query: metafieldMutation,
        variables
      }
    });

    if (response.body?.data?.metafieldsSet?.userErrors?.length > 0) {
      console.error("Metafield update failed:", response.body.data.metafieldsSet.userErrors);
      throw new Error(JSON.stringify(response.body.data.metafieldsSet.userErrors));
    }

    console.log(`✅ METAFIELD UPDATED for product ${productId}: ${currentTotal} + ${newDonationAmount} = ${updatedTotal}`);
    return updatedTotal;

  } catch (error) {
    console.error(`❌ Error updating donation total for product ${productId}:`, error);
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
      id: `gid://shopify/Product/${productId}`
    };

    const client = new GraphqlClient({
      session: {
        shop: "pentecostal-assemblies-of-canada.myshopify.com",
        accessToken: process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN
      }
    });

    const response = await client.query({ data: { query, variables } });
    const metafieldValue = response.body?.data?.product?.metafield?.value;

    return metafieldValue ? parseFloat(metafieldValue) : 0;
  } catch (error) {
    console.error(`❌ Error getting current donation total for product ${productId}:`, error);
    return 0;
  }
}
