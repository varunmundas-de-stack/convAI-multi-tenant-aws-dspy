// FactSecondarySales cube — CPG secondary sales fact table
// Multi-tenant: schema is determined by clientId in the JWT security context

const SCHEMA_MAP = {
  nestle: 'cpg_nestle',
  unilever: 'cpg_unilever',
  itc: 'cpg_itc',
};

const schema = SCHEMA_MAP[COMPILE_CONTEXT.securityContext?.clientId] || 'cpg_nestle';

cube('FactSecondarySales', {
  sql_table: `${schema}.fact_secondary_sales`,

  measures: {
    totalNetValue: {
      sql: 'net_value',
      type: 'sum',
      title: 'Total Net Sales Value (₹)',
      format: 'currency',
    },
    totalQuantity: {
      sql: 'invoice_quantity',
      type: 'sum',
      title: 'Total Volume (Units)',
    },
    grossSalesValue: {
      sql: 'gross_value',
      type: 'sum',
      title: 'Gross Sales Value (₹)',
      format: 'currency',
    },
    totalDiscount: {
      sql: 'discount_amount',
      type: 'sum',
      title: 'Total Discount (₹)',
      format: 'currency',
    },
    totalMargin: {
      sql: 'margin_amount',
      type: 'sum',
      title: 'Total Margin (₹)',
      format: 'currency',
    },
    invoiceCount: {
      sql: 'invoice_number',
      type: 'count_distinct',
      title: 'Invoice Count',
    },
    avgSellingPrice: {
      sql: `CASE WHEN SUM(invoice_quantity) > 0 THEN SUM(net_value) / SUM(invoice_quantity) ELSE 0 END`,
      type: 'number',
      title: 'Avg Selling Price (₹)',
      format: 'currency',
    },
    returnValue: {
      sql: 'return_value',
      type: 'sum',
      title: 'Return Value (₹)',
      format: 'currency',
    },
    activeOutlets: {
      sql: 'customer_key',
      type: 'count_distinct',
      title: 'Active Outlets',
    },
  },

  dimensions: {
    invoiceNumber: {
      sql: 'invoice_number',
      type: 'string',
      primaryKey: true,
    },
    invoiceDate: {
      sql: 'invoice_date',
      type: 'time',
      title: 'Invoice Date',
    },
    soCode: {
      sql: 'so_code',
      type: 'string',
      title: 'SO Code',
    },
    asmCode: {
      sql: 'asm_code',
      type: 'string',
      title: 'ASM Code',
    },
    zsmCode: {
      sql: 'zsm_code',
      type: 'string',
      title: 'ZSM Code',
    },
    nsmCode: {
      sql: 'nsm_code',
      type: 'string',
      title: 'NSM Code',
    },
  },

  joins: {
    DimProduct: {
      sql: `${CUBE}.product_key = ${DimProduct}.product_key`,
      relationship: 'many_to_one',
    },
    DimGeography: {
      sql: `${CUBE}.geography_key = ${DimGeography}.geography_key`,
      relationship: 'many_to_one',
    },
    DimCustomer: {
      sql: `${CUBE}.customer_key = ${DimCustomer}.customer_key`,
      relationship: 'many_to_one',
    },
    DimChannel: {
      sql: `${CUBE}.channel_key = ${DimChannel}.channel_key`,
      relationship: 'many_to_one',
    },
    DimSalesHierarchy: {
      sql: `${CUBE}.sales_hierarchy_key = ${DimSalesHierarchy}.hierarchy_key`,
      relationship: 'many_to_one',
    },
    DimDate: {
      sql: `${CUBE}.date_key = ${DimDate}.date_key`,
      relationship: 'many_to_one',
    },
  },
});
