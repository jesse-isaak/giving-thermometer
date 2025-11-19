// webhook-handlers.js - ES Module version for Shopify CLI
import { GraphqlQueryError } from "@shopify/shopify-api";

/**
 * Handles order payment webhook to update donation totals
 */
export async function handleOrderPaid(session, orderData) {
  try {
    console.log(`Processing order ${orderData.id} for donation tracking`);
    
    // Group line items by product
    const productDonations = {};
    
    orderData.line_items.forEach(item => {
      const productId = item.product_id;
      const quantity = item.quantity;
      const donationAmount = quantity; // Since price is always $1, quantity = donation amount
      
      if (productDonations[productId]) {
        productDonations[productId] += donationAmount;
      } else {
        productDonations[productId] = donationAmount;
      }
    });

    // Update each product's donation total
    for (const [productId, donationAmount] of Object.entries(productDonations)) {
      await updateProductDonationTotal(session, productId, donationAmount);
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
export async function updateProductDonationTotal(session, productId, newDonationAmount) {
  try {
    // First, get the current donation total
    const currentTotal = await getCurrentDonationTotal(session, productId);
    const updatedTotal = currentTotal + newDonationAmount;
    
    // Update the metafield
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

    const client = new session.graphqlClient();
    const response = await client.query({
      data: {
        query: metafieldMutation,
        variables: variables,
      },
    });

    if (response.body.data.metafieldsSet.userErrors.length > 0) {
      throw new Error(`Metafield update failed: ${JSON.stringify(response.body.data.metafieldsSet.userErrors)}`);
    }

    console.log(`Updated donation total for product ${productId}: $${updatedTotal}`);
    return updatedTotal;
  } catch (error) {
    console.error(`Error updating donation total for product ${productId}:`, error);
    throw error;
  }
}

/**
 * Gets the current donation total from the product's metafield
 */
export async function getCurrentDonationTotal(session, productId) {
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

    const client = new session.graphqlClient();
    const response = await client.query({
      data: {
        query: query,
        variables: variables,
      },
    });

    const metafieldValue = response.body.data.product?.metafield?.value;
    return metafieldValue ? parseFloat(metafieldValue) : 0;
  } catch (error) {
    console.error(`Error getting current donation total for product ${productId}:`, error);
    return 0; // Default to 0 if there's an error
  }
}