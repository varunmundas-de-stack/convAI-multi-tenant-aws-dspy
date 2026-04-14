// Cube.js configuration — multi-tenant CPG + cold chain
// Tenant isolation: schema prefix injected via COMPILE_CONTEXT in YAML models

const { FileRepository } = require("@cubejs-backend/server-core");

const SCHEMA_MAP = {
  nestle: "cpg_nestle",
  unilever: "cpg_unilever",
  itc: "cpg_itc",
};

module.exports = {
  // PostgreSQL as the primary OLAP backend
  dbType: "postgres",

  // Dynamic model directory based on tenant domain
  repositoryFactory: ({ securityContext }) => {
    const domain = securityContext?.domain || "cpg";
    return new FileRepository(`model/${domain}`);
  },

  // Inject tenant schema into security context so YAML models can use it
  extendContext: ({ securityContext }) => {
    const clientId = securityContext?.clientId;
    const schema = SCHEMA_MAP[clientId] || "public";
    return {
      securityContext: {
        ...securityContext,
        schema,
      },
    };
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
