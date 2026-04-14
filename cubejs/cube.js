// Cube.js configuration — multi-tenant CPG + cold chain
// Tenant schema isolation: cpg_{{ clientId }} prefix in YAML models via COMPILE_CONTEXT

const { FileRepository } = require("@cubejs-backend/server-core");

module.exports = {
  // PostgreSQL as the primary OLAP backend
  dbType: "postgres",

  // Dynamic model directory based on tenant domain
  repositoryFactory: ({ securityContext }) => {
    const domain = securityContext?.domain || "cpg";
    return new FileRepository(`model/${domain}`);
  },

  // Per-tenant cache key so Cube compiles separate schema per tenant
  contextToAppId: ({ securityContext }) => {
    return `APP_${securityContext?.clientId || "default"}`;
  },

  // Schema pre-aggregations cache
  preAggregationsSchema: "cube_pre_agg",

  // CORS — FastAPI backend is the only caller
  http: {
    cors: {
      origin: "*",
    },
  },

  // Dev mode: enable Cube.js playground
  devServer: process.env.NODE_ENV !== "production",
};
