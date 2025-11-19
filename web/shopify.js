import dotenv from "dotenv";
dotenv.config();
import { shopifyApp } from "@shopify/shopify-app-express";
import { SQLiteSessionStorage } from "@shopify/shopify-app-session-storage-sqlite";
import { restResources } from "@shopify/shopify-api/rest/admin/2023-10";

const DB_PATH = `${process.cwd()}/database.sqlite`;

// The transactions with Shopify will always be marked as test transactions, unless NODE_ENV is production.
// See the ensureInstalledOnShop middleware to learn more about this
const isProd = process.env.NODE_ENV === "production";

const shopify = shopifyApp({
  api: {
    apiKey: process.env.SHOPIFY_API_KEY,
    apiSecretKey: process.env.SHOPIFY_API_SECRET || process.env.SHOPIFY_API_SECRET_KEY,
    scopes: process.env.SCOPES?.split(","),
    hostName: process.env.HOST?.replace(/https?:\/\//, ""),
    hostScheme: process.env.HOST?.split("://")[0] || "https",
    apiVersion: "2023-10",
    isEmbeddedApp: true,
    logger: {
      level: isProd ? "info" : "debug",
    },
    restResources,
  },
  auth: {
    path: "/api/auth",
    callbackPath: "/api/auth/callback",
  },
  webhooks: {
    path: "/api/webhooks",
  },
  sessionStorage: new SQLiteSessionStorage(DB_PATH),
});

export default shopify;
