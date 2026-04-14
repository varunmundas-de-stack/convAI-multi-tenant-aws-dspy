-- 002_cpg_schemas.sql
-- Three CPG tenant schemas: cpg_nestle, cpg_unilever, cpg_itc
-- Identical structure — tenant isolation via schema search_path set by Cube.js

DO $$ DECLARE schemas TEXT[] := ARRAY['cpg_nestle','cpg_unilever','cpg_itc'];
       s TEXT;
BEGIN
  FOREACH s IN ARRAY schemas LOOP
    EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', s);
  END LOOP;
END $$;

-- Helper macro — create all tables in a given schema
-- Called 3x below, once per tenant schema
CREATE OR REPLACE PROCEDURE create_cpg_tables(schema_name TEXT)
LANGUAGE plpgsql AS $$
BEGIN
  -- dim_date
  EXECUTE format($sql$
    CREATE TABLE IF NOT EXISTS %I.dim_date (
      date_key      INTEGER PRIMARY KEY,
      full_date     DATE NOT NULL,
      year          INTEGER,
      quarter       INTEGER,
      month         INTEGER,
      month_name    VARCHAR(20),
      week          INTEGER,
      week_label    VARCHAR(20),
      day_of_week   INTEGER
    )
  $sql$, schema_name);

  -- dim_product
  EXECUTE format($sql$
    CREATE TABLE IF NOT EXISTS %I.dim_product (
      product_key   SERIAL PRIMARY KEY,
      sku_code      VARCHAR(50),
      sku_name      VARCHAR(200),
      brand_name    VARCHAR(100),
      category_name VARCHAR(100),
      sub_category  VARCHAR(100),
      pack_size     VARCHAR(50)
    )
  $sql$, schema_name);

  -- dim_geography
  EXECUTE format($sql$
    CREATE TABLE IF NOT EXISTS %I.dim_geography (
      geography_key SERIAL PRIMARY KEY,
      state_name    VARCHAR(100),
      zone_name     VARCHAR(100),
      district_name VARCHAR(100),
      town_name     VARCHAR(100)
    )
  $sql$, schema_name);

  -- dim_customer
  EXECUTE format($sql$
    CREATE TABLE IF NOT EXISTS %I.dim_customer (
      customer_key      SERIAL PRIMARY KEY,
      distributor_name  VARCHAR(200),
      retailer_name     VARCHAR(200),
      outlet_type       VARCHAR(100)
    )
  $sql$, schema_name);

  -- dim_channel
  EXECUTE format($sql$
    CREATE TABLE IF NOT EXISTS %I.dim_channel (
      channel_key   SERIAL PRIMARY KEY,
      channel_name  VARCHAR(100)
    )
  $sql$, schema_name);

  -- dim_sales_hierarchy
  EXECUTE format($sql$
    CREATE TABLE IF NOT EXISTS %I.dim_sales_hierarchy (
      hierarchy_key SERIAL PRIMARY KEY,
      so_code       VARCHAR(50),
      asm_code      VARCHAR(50),
      zsm_code      VARCHAR(50),
      nsm_code      VARCHAR(50),
      zone_name     VARCHAR(100),
      region_name   VARCHAR(100)
    )
  $sql$, schema_name);

  -- fact_secondary_sales
  EXECUTE format($sql$
    CREATE TABLE IF NOT EXISTS %I.fact_secondary_sales (
      invoice_number      VARCHAR(50),
      invoice_date        DATE NOT NULL,
      date_key            INTEGER,
      product_key         INTEGER,
      geography_key       INTEGER,
      customer_key        INTEGER,
      channel_key         INTEGER,
      sales_hierarchy_key INTEGER,
      so_code             VARCHAR(50),
      asm_code            VARCHAR(50),
      zsm_code            VARCHAR(50),
      nsm_code            VARCHAR(50),
      gross_value         NUMERIC(14,2) DEFAULT 0,
      discount_amount     NUMERIC(14,2) DEFAULT 0,
      net_value           NUMERIC(14,2) DEFAULT 0,
      margin_amount       NUMERIC(14,2) DEFAULT 0,
      return_value        NUMERIC(14,2) DEFAULT 0,
      invoice_quantity    NUMERIC(12,3) DEFAULT 0
    )
  $sql$, schema_name);

  -- Indexes
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_date ON %I.fact_secondary_sales(invoice_date)',
    replace(schema_name,'.','_'), schema_name);
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_so ON %I.fact_secondary_sales(so_code)',
    replace(schema_name,'.','_'), schema_name);
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_asm ON %I.fact_secondary_sales(asm_code)',
    replace(schema_name,'.','_'), schema_name);

END $$;

-- Create tables for each tenant
CALL create_cpg_tables('cpg_nestle');
CALL create_cpg_tables('cpg_unilever');
CALL create_cpg_tables('cpg_itc');

-- Seed client records
INSERT INTO auth.clients (client_id, client_name, schema_name, domain) VALUES
  ('nestle',   'Nestlé India Limited',          'cpg_nestle',   'cpg'),
  ('unilever', 'Hindustan Unilever Limited',     'cpg_unilever', 'cpg'),
  ('itc',      'ITC Limited',                    'cpg_itc',      'cpg')
ON CONFLICT (client_id) DO NOTHING;
