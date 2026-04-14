// Cube.js configuration — multi-tenant CPG + cold chain
// Tenant isolation enforced via RLS filters injected by FastAPI backend JWT

const { FileRepository } = require("@cubejs-backend/server-core");

module.exports = {
  // PostgreSQL as the primary OLAP backend
  dbType: "postgres",

  // Dynamic schema path based on tenant domain (future: per-domain model directories)
  repositoryFactory: ({ securityContext }) => {
    const domain = securityContext?.domain || "cpg";
    return new FileRepository(`model/${domain}`);
  },

  // Schema pre-aggregations cache
  preAggregationsSchema: "cube_pre_agg",

  // Query context — injects clientId for row-level tenant separation at DB level
  queryRewrite(query, { securityContext }) {
    const clientId = securityContext?.clientId;
    const schemaMap = {
      nestle: "cpg_nestle",
      unilever: "cpg_unilever",
      itc: "cpg_itc",
    };
    if (clientId && schemaMap[clientId]) {
      // Set search_path so all unqualified table refs resolve to tenant schema
      query.queryOptions = {
        ...(query.queryOptions || {}),
        schemaSearchPath: schemaMap[clientId],
      };
    }
    return query;
  },

  // CORS — FastAPI backend is the only caller
  http: {
    cors: {
      origin: process.env.ALLOWED_ORIGIN || "http://localhost:5000",
    },
  },

  // Dev mode: enable Cube.js playground
  devServer: process.env.NODE_ENV !== "production",
};
