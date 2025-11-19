// installation-handler.js - ES Module version for Shopify CLI

/**
 * Installation handler for Mission Global Giving Thermometer
 * Sets up required webhooks and metafield definitions
 */
export async function handleAppInstallation(session) {
  try {
    console.log(`Setting up Mission Global app for shop: ${session.shop}`);
    
    // 1. Register webhooks
    await registerRequiredWebhooks(session);
    
    // 2. Create metafield definitions for better data structure
    await createMetafieldDefinitions(session);
    
    console.log("App installation completed successfully");
    return true;
  } catch (error) {
    console.error("App installation failed:", error);
    throw error;
  }
}

export async function registerRequiredWebhooks(session) {
  const webhooksToRegister = [
    {
      topic: 'orders/paid',
      address: `${process.env.SHOPIFY_APP_URL}/api/webhooks/orders/paid`,
      format: 'json'
    }
  ];

  for (const webhookData of webhooksToRegister) {
    try {
      const client = new session.restClient();
      
      // Check if webhook already exists
      const existingWebhooks = await client.get({ path: 'webhooks' });
      const exists = existingWebhooks.body.webhooks.some(
        webhook => webhook.topic === webhookData.topic && webhook.address === webhookData.address
      );

      if (!exists) {
        const response = await client.post({
          path: 'webhooks',
          data: { webhook: webhookData }
        });
        console.log(`Registered webhook: ${webhookData.topic}`);
      } else {
        console.log(`Webhook already exists: ${webhookData.topic}`);
      }
    } catch (error) {
      console.error(`Failed to register webhook ${webhookData.topic}:`, error);
    }
  }
}

export async function createMetafieldDefinitions(session) {
  try {
    const metafieldDefinitionMutation = `
      mutation metafieldDefinitionCreate($definition: MetafieldDefinitionInput!) {
        metafieldDefinitionCreate(definition: $definition) {
          metafieldDefinition {
            id
            name
            namespace
            key
            type {
              name
            }
            ownerType
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const definition = {
      name: "Donation Total Value",
      namespace: "mission_global_integration",
      key: "donation_total_value",
      description: "Tracks the total donation amount raised for this product",
      type: "number_decimal",
      ownerType: "PRODUCT",
      access: {
        admin: "MERCHANT_READ_WRITE",
        storefront: "PUBLIC_READ"
      }
    };

    const client = new session.graphqlClient();
    const response = await client.query({
      data: {
        query: metafieldDefinitionMutation,
        variables: { definition }
      }
    });

    if (response.body.data.metafieldDefinitionCreate.userErrors.length > 0) {
      console.log("Metafield definition might already exist or other issue:", 
        response.body.data.metafieldDefinitionCreate.userErrors);
    } else {
      console.log("Metafield definition created successfully");
    }
  } catch (error) {
    console.error("Error creating metafield definition:", error);
  }
}

/**
 * Cleanup function for when app is uninstalled
 */
export async function handleAppUninstallation(session) {
  try {
    console.log(`Cleaning up Mission Global app for shop: ${session.shop}`);
    
    // The webhooks will be automatically deleted by Shopify when app is uninstalled
    // But you could add cleanup logic here if needed
    
    console.log("App cleanup completed");
  } catch (error) {
    console.error("App cleanup failed:", error);
  }
}