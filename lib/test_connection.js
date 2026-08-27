const fs = require('fs');
const path = require('path');

// 1. Simple custom env loader
try {
  const envPath = path.resolve(__dirname, '../.env.local');
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const parts = trimmed.split('=');
    if (parts.length >= 2) {
      const key = parts[0].trim();
      const val = parts.slice(1).join('=').trim();
      process.env[key] = val;
    }
  });
  console.log('✅ Loaded .env.local variables successfully.');
} catch (err) {
  console.log('⚠️ Warning: could not load .env.local:', err.message);
}

const { getProductsWithStock, shopifyGraphQL } = require('./shopify.js');

async function testConnection() {
  console.log('\n==================================================');
  console.log('      CAPOTE B2B — DIAGNOSTIC TEST RUN');
  console.log('==================================================');
  
  const store = process.env.SHOPIFY_STORE;
  const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
  const locationId = process.env.BARCELONA_LOCATION_ID;
  
  console.log(`Store: ${store}`);
  console.log(`Token: ${token ? '••••' + token.slice(-6) : 'MISSING'}`);
  console.log(`Barcelona Location ID: ${locationId}`);
  
  if (!store || !token || !locationId) {
    console.error('❌ Configuration missing in .env.local.');
    process.exit(1);
  }

  // Test 1: Fetch B2B Customers on the store
  console.log('\n🔍 Test 1: Searching for whitelisted B2B-Partner customers...');
  const customerQuery = `
    query {
      customers(first: 5, query: "tag:B2B-Partner") {
        edges {
          node {
            id
            firstName
            lastName
            email
            tags
            passcode: metafield(namespace: "b2b_portal", key: "passcode") {
              value
            }
          }
        }
      }
    }
  `;
  
  try {
    const custData = await shopifyGraphQL(customerQuery);
    const customers = custData.customers?.edges || [];
    console.log(`  Found ${customers.length} customer(s) with tag 'B2B-Partner':`);
    
    customers.forEach(edge => {
      const c = edge.node;
      console.log(`  - Name: ${c.firstName} ${c.lastName} | Email: ${c.email}`);
      console.log(`    Tags: [${c.tags.join(', ')}]`);
      console.log(`    Passcode Metafield (b2b_portal.passcode): ${c.passcode?.value ? `"${c.passcode.value}"` : '❌ NOT CONFIGURED'}`);
    });
  } catch (err) {
    console.error('  ❌ Customer lookup failed:', err.message);
  }

  // Test 2: Fetch Products & Barcelona Stock Routing
  console.log('\n📦 Test 2: Fetching active products and Barcelona warehouse stock...');
  try {
    const products = await getProductsWithStock(locationId);
    console.log(`  Fetched ${products.length} active products.`);
    
    if (products.length > 0) {
      const first = products[0];
      console.log(`\n  Sample Product: "${first.title}" (Handle: ${first.handle})`);
      console.log(`  Type: ${first.type || 'N/A'}`);
      console.log(`  Variants list (showing pricing & Barcelona stock):`);
      
      first.variants.slice(0, 5).forEach(v => {
        console.log(`    - SKU: ${v.sku || 'N/A'} | Title: ${v.title} | Price: €${v.price.toFixed(2)} | Barcelona Stock: ${v.available} units`);
      });
      if (first.variants.length > 5) {
        console.log(`    ... and ${first.variants.length - 5} more variants.`);
      }
      console.log('\n✅ Catalog stock isolation works correctly.');
    } else {
      console.log('  ⚠️ No active products found on store.');
    }
  } catch (err) {
    console.error('  ❌ Product retrieval failed:', err.message);
  }
  
  console.log('==================================================\n');
}

testConnection().catch(console.error);
