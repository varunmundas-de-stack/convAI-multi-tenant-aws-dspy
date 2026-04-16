"""
Seed realistic CPG sales data for all three tenant schemas.
Generates ~90,000 rows per tenant covering 2025-01-01 → 2026-02-28.

Usage:
  python database/seed/seed_data.py

Env var POSTGRES_DSN overrides the default localhost connection.
"""
import os, random, math
from datetime import date, timedelta
from collections import defaultdict
import psycopg2
from psycopg2.extras import execute_batch

POSTGRES_DSN = os.getenv(
    "POSTGRES_DSN",
    "postgresql://cpg_user:cpg_password@localhost:5432/cpg_analytics",
)

START_DATE = date(2025, 1, 1)
END_DATE   = date(2026, 4, 16)

random.seed(42)

# ─── Tenant catalogue ──────────────────────────────────────────────────────────

TENANTS = {
    "cpg_nestle": {
        "brands": {
            "Maggi":     ("Noodles",       "Instant Noodles",   ["Masala 70g", "Chicken 70g", "Pazzta 64g", "Atta 80g"]),
            "KitKat":    ("Confectionery", "Chocolate Bars",    ["2F 13g", "4F 37g", "Chunky 40g"]),
            "Nescafe":   ("Beverages",     "Instant Coffee",    ["Classic 50g", "Gold 100g", "Sunrise 200g"]),
            "Munch":     ("Confectionery", "Wafer Bars",        ["Regular 13g", "Rolypoly 26g"]),
            "Milkmaid":  ("Dairy",         "Condensed Milk",    ["400g", "1kg Tin"]),
        },
        "zones": [
            {"zsm_code": "ZSM001", "zone": "West",  "asm_codes": ["ASM001","ASM002"], "so_codes_per_asm": 3},
            {"zsm_code": "ZSM002", "zone": "South", "asm_codes": ["ASM003","ASM004"], "so_codes_per_asm": 3},
            {"zsm_code": "ZSM003", "zone": "North", "asm_codes": ["ASM005","ASM006"], "so_codes_per_asm": 3},
        ],
    },
    "cpg_unilever": {
        "brands": {
            "Dove":        ("Personal Care", "Soap",      ["Soap 100g", "Cream 400ml", "Shampoo 340ml"]),
            "Surf Excel":  ("Home Care",     "Detergent", ["Easy Wash 1kg", "Matic 1kg", "Liquid 1L"]),
            "Brooke Bond": ("Beverages",     "Tea",       ["Red Label 500g", "Taaza 500g", "3 Roses 500g"]),
            "Kissan":      ("Food",          "Spreads",   ["Ketchup 1kg", "Mixed Jam 500g", "Squash 750ml"]),
            "Lux":         ("Personal Care", "Soap",      ["Jasmine 100g", "Velvet 150g", "Purple 75g"]),
        },
        "zones": [
            {"zsm_code": "ZSM001", "zone": "West",  "asm_codes": ["ASM001","ASM002"], "so_codes_per_asm": 3},
            {"zsm_code": "ZSM002", "zone": "East",  "asm_codes": ["ASM003","ASM004"], "so_codes_per_asm": 3},
            {"zsm_code": "ZSM003", "zone": "South", "asm_codes": ["ASM005","ASM006"], "so_codes_per_asm": 3},
        ],
    },
    "cpg_itc": {
        "brands": {
            "Aashirvaad": ("Food",          "Atta",      ["5kg", "10kg", "Multigrain 5kg", "Select 5kg"]),
            "Sunfeast":   ("Biscuits",      "Biscuits",  ["Marie 75g", "Dark Fantasy 75g", "Farmlite 150g"]),
            "Bingo":      ("Snacks",        "Snacks",    ["Mad Angles 90g", "Tedhe Medhe 80g", "Tedhe Medhe 26g"]),
            "Classmate":  ("Stationery",    "Notebooks", ["Notebook 200pg", "Register 100pg"]),
            "Vivel":      ("Personal Care", "Soap",      ["Shea 75g", "Olive 125g", "Aloe 100g"]),
        },
        "zones": [
            {"zsm_code": "ZSM001", "zone": "North", "asm_codes": ["ASM001","ASM002"], "so_codes_per_asm": 3},
            {"zsm_code": "ZSM002", "zone": "West",  "asm_codes": ["ASM003","ASM004"], "so_codes_per_asm": 3},
            {"zsm_code": "ZSM003", "zone": "South", "asm_codes": ["ASM005","ASM006"], "so_codes_per_asm": 3},
        ],
    },
}

GEO_BY_ZONE = {
    "North": [
        ("Punjab",      "Ludhiana",    ["Gill Road", "Civil Lines", "Model Town"]),
        ("Punjab",      "Amritsar",    ["Lawrence Road", "Batala Road"]),
        ("Delhi",       "Central Delhi",["Connaught Place", "Karol Bagh"]),
    ],
    "West": [
        ("Maharashtra", "Mumbai",      ["Andheri", "Bandra", "Thane", "Borivali"]),
        ("Maharashtra", "Pune",        ["Kothrud", "Hadapsar", "Pimpri"]),
        ("Gujarat",     "Ahmedabad",   ["C G Road", "Satellite", "Maninagar"]),
    ],
    "South": [
        ("Karnataka",   "Bangalore",   ["Indiranagar", "Koramangala", "Whitefield"]),
        ("Tamil Nadu",  "Chennai",     ["T Nagar", "Anna Nagar", "Velachery"]),
        ("Telangana",   "Hyderabad",   ["Banjara Hills", "Kukatpally", "Secunderabad"]),
    ],
    "East": [
        ("West Bengal", "Kolkata",     ["Park Street", "Salt Lake", "Howrah"]),
        ("Odisha",      "Bhubaneswar", ["Saheed Nagar", "Kharvel Nagar"]),
    ],
}

CHANNELS   = ["General Trade", "Modern Trade", "E-Commerce", "Wholesale", "HoReCa"]
OUTLET_TYPES = ["Grocery Store", "Kirana", "Supermarket", "Convenience Store", "Online Outlet"]

# ─── Helpers ───────────────────────────────────────────────────────────────────

def date_range(start, end):
    d = start
    while d <= end:
        yield d
        d += timedelta(1)

def seasonal_multiplier(d: date) -> float:
    """Boost festive months, dip in summer."""
    boosts = {10: 1.4, 11: 1.5, 12: 1.6, 1: 1.2, 3: 0.9, 4: 0.8, 5: 0.85}
    return boosts.get(d.month, 1.0)

def build_date_dim(conn, schema):
    rows = []
    for d in date_range(START_DATE, END_DATE):
        dk = int(d.strftime("%Y%m%d"))
        q  = math.ceil(d.month / 3)
        wk = int(d.strftime("%W"))
        rows.append((dk, d, d.year, q, d.month,
                     d.strftime("%B"), wk,
                     f"W{wk:02d}-{d.year}",
                     d.isoweekday()))
    with conn.cursor() as cur:
        execute_batch(cur, f"""
            INSERT INTO {schema}.dim_date
              (date_key,full_date,year,quarter,month,month_name,week,week_label,day_of_week)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (date_key) DO NOTHING
        """, rows, page_size=500)
    conn.commit()
    print(f"  [{schema}] dim_date: {len(rows)} rows")
    return {r[1]: r[0] for r in rows}   # date → date_key

def build_product_dim(conn, schema, brands):
    rows = []
    sku_n = 1
    for brand, (cat, subcat, skus) in brands.items():
        for sku in skus:
            rows.append((f"SKU{sku_n:04d}", f"{brand} {sku}", brand, cat, subcat,
                         sku.split()[-1] if sku else ""))
            sku_n += 1
    with conn.cursor() as cur:
        execute_batch(cur, f"""
            INSERT INTO {schema}.dim_product (sku_code,sku_name,brand_name,category_name,sub_category,pack_size)
            VALUES (%s,%s,%s,%s,%s,%s)
        """, rows)
        cur.execute(f"SELECT product_key, brand_name, sku_name FROM {schema}.dim_product ORDER BY product_key")
        return cur.fetchall()   # list of (product_key, brand_name, sku_name)

def build_geo_dim(conn, schema, zones):
    rows = []
    geo_by_zone = {}
    for zone_info in zones:
        zone_name = zone_info["zone"]
        zone_geos = GEO_BY_ZONE.get(zone_name, GEO_BY_ZONE["West"])
        geo_by_zone[zone_name] = []
        for state, district, towns in zone_geos:
            for town in towns:
                rows.append((state, zone_name, district, town))
    with conn.cursor() as cur:
        execute_batch(cur, f"""
            INSERT INTO {schema}.dim_geography (state_name,zone_name,district_name,town_name)
            VALUES (%s,%s,%s,%s)
        """, rows)
        cur.execute(f"SELECT geography_key, zone_name FROM {schema}.dim_geography ORDER BY geography_key")
        all_geos = cur.fetchall()
    conn.commit()
    # group by zone
    by_zone = defaultdict(list)
    for gk, zn in all_geos:
        by_zone[zn].append(gk)
    return by_zone  # zone_name → [geography_key, ...]

def build_customer_dim(conn, schema, n=40):
    distributors = [f"Distributor {chr(65+i)}" for i in range(8)]
    rows = []
    for i in range(n):
        rows.append((
            random.choice(distributors),
            f"Retailer #{i+1:04d}",
            random.choice(OUTLET_TYPES),
        ))
    with conn.cursor() as cur:
        execute_batch(cur, f"""
            INSERT INTO {schema}.dim_customer (distributor_name,retailer_name,outlet_type)
            VALUES (%s,%s,%s)
        """, rows)
        cur.execute(f"SELECT customer_key FROM {schema}.dim_customer ORDER BY customer_key")
        return [r[0] for r in cur.fetchall()]

def build_channel_dim(conn, schema):
    with conn.cursor() as cur:
        for ch in CHANNELS:
            cur.execute(f"INSERT INTO {schema}.dim_channel (channel_name) VALUES (%s)", (ch,))
        cur.execute(f"SELECT channel_key FROM {schema}.dim_channel ORDER BY channel_key")
        return [r[0] for r in cur.fetchall()]

def build_hierarchy_dim(conn, schema, zones):
    """Returns list of (hierarchy_key, so_code, asm_code, zsm_code, nsm_code, zone_name)."""
    rows = []
    result = []
    for zinfo in zones:
        zsm, zone_name = zinfo["zsm_code"], zinfo["zone"]
        for asm in zinfo["asm_codes"]:
            for so_n in range(1, zinfo["so_codes_per_asm"] + 1):
                so = f"SO_{asm}_{so_n:02d}"
                rows.append((so, asm, zsm, "NSM001", zone_name, f"{zone_name} Region"))
    with conn.cursor() as cur:
        execute_batch(cur, f"""
            INSERT INTO {schema}.dim_sales_hierarchy
              (so_code,asm_code,zsm_code,nsm_code,zone_name,region_name)
            VALUES (%s,%s,%s,%s,%s,%s)
        """, rows)
        cur.execute(f"""
            SELECT hierarchy_key, so_code, asm_code, zsm_code, nsm_code, zone_name
            FROM {schema}.dim_sales_hierarchy ORDER BY hierarchy_key
        """)
        return cur.fetchall()

# ─── Fact generation ───────────────────────────────────────────────────────────

def build_facts(conn, schema, date_map, products, geo_by_zone, customers, channels, hierarchy):
    """Generate ~90k fact rows with realistic distributions."""
    inv_n  = 1
    batch  = []

    # We'll generate one invoice per (SO, week) per channel, with 5-15 line items
    # 18 SOs × ~60 weeks × 1 invoice × 8 avg lines ≈ 8,640 rows — too few
    # So: 18 SOs × 60 weeks × 3 invoices × 8 lines = 25,920 — still low
    # Approach: each SO generates 5 invoices per week, each with 1 line item per SKU subset
    # 18 SOs × 60 weeks × 5 inv × 17 avg products = 91,800 ✓

    all_dates = list(date_range(START_DATE, END_DATE))
    # Group dates by week
    weeks = defaultdict(list)
    for d in all_dates:
        weeks[d.isocalendar()[:2]].append(d)   # (year, week) → [dates]

    week_list = sorted(weeks.keys())

    for hk, so_code, asm_code, zsm_code, nsm_code, zone_name in hierarchy:
        zone_geos    = geo_by_zone.get(zone_name, list(geo_by_zone.values())[0])
        so_customers = random.sample(customers, min(8, len(customers)))
        so_channels  = channels[:3]  # GT, MT, EC

        for yw in week_list:
            week_dates = weeks[yw]
            # Base volume grows 1% per week with seasonal boost
            week_idx = week_list.index(yw)
            base_mult = (1 + 0.01 * week_idx) * seasonal_multiplier(week_dates[0])

            # 5 invoices per week for this SO
            for _ in range(5):
                inv_date = random.choice(week_dates)
                dk       = date_map[inv_date]
                cust_key = random.choice(so_customers)
                chan_key  = random.choice(so_channels)
                geo_key   = random.choice(zone_geos)

                # 2–6 line items per invoice (different SKUs)
                sampled_products = random.sample(products, random.randint(2, 6))
                for prod_key, brand_name, sku_name in sampled_products:
                    inv_num = f"INV{inv_n:08d}"
                    inv_n  += 1

                    # Price logic: branded = higher price, private = lower
                    base_price  = random.uniform(80, 1200) * base_mult
                    quantity    = round(random.uniform(2, 50), 2)
                    gross       = round(base_price * quantity, 2)
                    discount    = round(gross * random.uniform(0.05, 0.15), 2)
                    net         = round(gross - discount, 2)
                    margin      = round(net  * random.uniform(0.12, 0.28), 2)
                    return_val  = round(gross * random.uniform(0, 0.03), 2) if random.random() < 0.08 else 0.0

                    batch.append((
                        inv_num, inv_date, dk,
                        prod_key, geo_key, cust_key, chan_key, hk,
                        so_code, asm_code, zsm_code, nsm_code,
                        gross, discount, net, margin, return_val, quantity,
                    ))

                    if len(batch) >= 2000:
                        _flush(conn, schema, batch)
                        batch.clear()

    if batch:
        _flush(conn, schema, batch)
    conn.commit()

def _flush(conn, schema, batch):
    with conn.cursor() as cur:
        execute_batch(cur, f"""
            INSERT INTO {schema}.fact_secondary_sales (
              invoice_number, invoice_date, date_key,
              product_key, geography_key, customer_key, channel_key, sales_hierarchy_key,
              so_code, asm_code, zsm_code, nsm_code,
              gross_value, discount_amount, net_value, margin_amount, return_value, invoice_quantity
            ) VALUES (
              %s,%s,%s, %s,%s,%s,%s,%s, %s,%s,%s,%s, %s,%s,%s,%s,%s,%s
            )
        """, batch, page_size=500)
    conn.commit()

# ─── Main ──────────────────────────────────────────────────────────────────────

def seed_tenant(conn, schema, config):
    print(f"\n{'='*50}")
    print(f"  Seeding {schema}")
    print(f"{'='*50}")

    print("  Building dim_date …")
    date_map = build_date_dim(conn, schema)

    print("  Building dim_product …")
    products = build_product_dim(conn, schema, config["brands"])
    conn.commit()
    print(f"    → {len(products)} SKUs")

    print("  Building dim_geography …")
    geo_by_zone = build_geo_dim(conn, schema, config["zones"])
    print(f"    → {sum(len(v) for v in geo_by_zone.values())} geo rows")

    print("  Building dim_customer …")
    customers = build_customer_dim(conn, schema, n=40)
    conn.commit()

    print("  Building dim_channel …")
    channels = build_channel_dim(conn, schema)
    conn.commit()

    print("  Building dim_sales_hierarchy …")
    hierarchy = build_hierarchy_dim(conn, schema, config["zones"])
    conn.commit()
    print(f"    → {len(hierarchy)} SOs")

    print("  Generating fact_secondary_sales (this takes ~30s) …")
    build_facts(conn, schema, date_map, products, geo_by_zone, customers, channels, hierarchy)

    with conn.cursor() as cur:
        cur.execute(f"SELECT COUNT(*) FROM {schema}.fact_secondary_sales")
        cnt = cur.fetchone()[0]
    print(f"  ✓ {cnt:,} fact rows")


def main():
    print(f"Connecting to PostgreSQL …")
    conn = psycopg2.connect(POSTGRES_DSN)
    conn.autocommit = False

    for schema, config in TENANTS.items():
        seed_tenant(conn, schema, config)

    conn.close()
    print("\nAll tenants seeded successfully.")

if __name__ == "__main__":
    main()
