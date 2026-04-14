// Dimension cubes — shared across all CPG tenants
// Multi-tenant: schema prefix resolved from JWT clientId

const SCHEMA_MAP = {
  nestle: 'cpg_nestle',
  unilever: 'cpg_unilever',
  itc: 'cpg_itc',
};

const schema = SCHEMA_MAP[COMPILE_CONTEXT.securityContext?.clientId] || 'cpg_nestle';

cube('DimProduct', {
  sql_table: `${schema}.dim_product`,
  dimensions: {
    productKey: { sql: 'product_key', type: 'number', primaryKey: true },
    skuCode: { sql: 'sku_code', type: 'string' },
    skuName: { sql: 'sku_name', type: 'string', title: 'SKU Name' },
    brandName: { sql: 'brand_name', type: 'string', title: 'Brand' },
    categoryName: { sql: 'category_name', type: 'string', title: 'Category' },
    packSize: { sql: 'pack_size', type: 'string', title: 'Pack Size' },
  },
});

cube('DimGeography', {
  sql_table: `${schema}.dim_geography`,
  dimensions: {
    geographyKey: { sql: 'geography_key', type: 'number', primaryKey: true },
    stateName: { sql: 'state_name', type: 'string', title: 'State' },
    zoneName: { sql: 'zone_name', type: 'string', title: 'Zone' },
    districtName: { sql: 'district_name', type: 'string', title: 'District' },
    townName: { sql: 'town_name', type: 'string', title: 'Town' },
  },
});

cube('DimCustomer', {
  sql_table: `${schema}.dim_customer`,
  dimensions: {
    customerKey: { sql: 'customer_key', type: 'number', primaryKey: true },
    distributorName: { sql: 'distributor_name', type: 'string', title: 'Distributor' },
    retailerName: { sql: 'retailer_name', type: 'string', title: 'Retailer' },
    outletType: { sql: 'outlet_type', type: 'string', title: 'Outlet Type' },
  },
});

cube('DimChannel', {
  sql_table: `${schema}.dim_channel`,
  dimensions: {
    channelKey: { sql: 'channel_key', type: 'number', primaryKey: true },
    channelName: { sql: 'channel_name', type: 'string', title: 'Channel' },
  },
});

cube('DimSalesHierarchy', {
  sql_table: `${schema}.dim_sales_hierarchy`,
  dimensions: {
    hierarchyKey: { sql: 'hierarchy_key', type: 'number', primaryKey: true },
    soCode: { sql: 'so_code', type: 'string', title: 'SO Code' },
    asmCode: { sql: 'asm_code', type: 'string', title: 'ASM Code' },
    zsmCode: { sql: 'zsm_code', type: 'string', title: 'ZSM Code' },
    nsmCode: { sql: 'nsm_code', type: 'string', title: 'NSM Code' },
    zoneName: { sql: 'zone_name', type: 'string', title: 'Zone' },
    regionName: { sql: 'region_name', type: 'string', title: 'Region' },
  },
});

cube('DimDate', {
  sql_table: `${schema}.dim_date`,
  dimensions: {
    dateKey: { sql: 'date_key', type: 'number', primaryKey: true },
    year: { sql: 'year', type: 'number', title: 'Year' },
    quarter: { sql: 'quarter', type: 'number', title: 'Quarter' },
    monthLabel: { sql: 'month_name', type: 'string', title: 'Month' },
    weekLabel: { sql: 'week_label', type: 'string', title: 'Week' },
  },
});
