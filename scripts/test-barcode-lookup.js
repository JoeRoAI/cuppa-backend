/**
 * Test script for barcode lookup functionality
 * 
 * To run:
 * 1. Start the server: npm run dev
 * 2. In another terminal: node scripts/test-barcode-lookup.js
 */

const axios = require('axios');

const API_URL = 'http://localhost:5000/api';

// Test barcodes
const testBarcodes = [
  '1234567890123',
  '1234567890124',
  '1234567890125',
];

// Test data for creating coffees with barcodes
const testCoffees = [
  {
    name: 'Test Coffee 1',
    description: 'A test coffee product with barcode',
    origin: {
      country: 'Ethiopia',
      region: 'Yirgacheffe'
    },
    roastLevel: 'medium',
    processingDetails: {
      method: 'washed'
    },
    barcodes: [testBarcodes[0]],
    sku: 'TCOF-001',
    prices: [
      {
        amount: 15.99,
        size: '12oz',
        unit: 'oz'
      }
    ]
  },
  {
    name: 'Test Coffee 2',
    description: 'Another test coffee product with barcode',
    origin: {
      country: 'Colombia',
      region: 'Huila'
    },
    roastLevel: 'medium-dark',
    processingDetails: {
      method: 'natural'
    },
    barcodes: [testBarcodes[1]],
    sku: 'TCOF-002',
    prices: [
      {
        amount: 17.99,
        size: '12oz',
        unit: 'oz'
      }
    ]
  }
];

// Login as admin to get token
async function login() {
  try {
    const response = await axios.post(`${API_URL}/auth/login`, {
      email: 'admin@example.com',
      password: 'password123'
    });
    
    return response.data.token;
  } catch (error) {
    console.error('Login failed:', error.response ? error.response.data : error.message);
    return null;
  }
}

// Create test coffees
async function createTestCoffees(token) {
  for (const coffee of testCoffees) {
    try {
      await axios.post(`${API_URL}/coffee`, coffee, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      console.log(`Created coffee: ${coffee.name} with barcode: ${coffee.barcodes[0]}`);
    } catch (error) {
      console.error(`Failed to create coffee ${coffee.name}:`, 
        error.response ? error.response.data : error.message);
    }
  }
}

// Test single barcode lookup
async function testSingleBarcodeLookup() {
  for (const barcode of testBarcodes) {
    try {
      const response = await axios.get(`${API_URL}/coffee/barcode/${barcode}`);
      console.log(`\nBarcode lookup for ${barcode}:`);
      
      if (response.data.success) {
        console.log(`Found coffee: ${response.data.data.name}`);
      } else {
        console.log('No coffee found');
      }
    } catch (error) {
      if (error.response && error.response.status === 404) {
        console.log(`Barcode ${barcode} not found`);
      } else {
        console.error(`Error looking up barcode ${barcode}:`, 
          error.response ? error.response.data : error.message);
      }
    }
  }
}

// Test bulk barcode lookup
async function testBulkBarcodeLookup() {
  try {
    const response = await axios.post(`${API_URL}/coffee/barcode/bulk`, {
      barcodes: testBarcodes
    });
    
    console.log('\nBulk barcode lookup results:');
    console.log(`Total found: ${response.data.count} out of ${testBarcodes.length}`);
    
    response.data.data.forEach(result => {
      console.log(`Barcode ${result.barcode}: ${result.found ? `Found - ${result.data.name}` : 'Not found'}`);
    });
  } catch (error) {
    console.error('Error during bulk lookup:', error.response ? error.response.data : error.message);
  }
}

// Main test function
async function runTests() {
  console.log('Starting barcode lookup tests...');
  
  // Login as admin
  const token = await login();
  if (!token) {
    console.error('Cannot proceed without authentication');
    return;
  }
  
  // Create test coffee products with barcodes
  await createTestCoffees(token);
  
  // Wait a moment for data to be saved
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Test single barcode lookup
  await testSingleBarcodeLookup();
  
  // Test bulk barcode lookup
  await testBulkBarcodeLookup();
  
  console.log('\nBarcode lookup tests completed');
}

// Run the tests
runTests().catch(error => {
  console.error('Test script failed:', error);
}); 