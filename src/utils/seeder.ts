import mongoose from 'mongoose';
import { connectDB } from '../config/db';
import User from '../models/user.model';
import Coffee from '../models/coffee.model';
import config from '../config/config';

// Sample data
const sampleCoffee = [
  {
    name: 'Ethiopian Yirgacheffe',
    description: 'A bright and complex coffee with citrus and floral notes.',
    origin: {
      country: 'Ethiopia',
      region: 'Yirgacheffe',
      elevation: 1800,
      producer: 'Konga Cooperative',
    },
    roastLevel: 'light',
    processingDetails: {
      method: 'washed',
      details: 'Traditional washed processing with 72-hour fermentation',
    },
    flavorProfile: {
      flavorNotes: ['Citrus', 'Floral', 'Bergamot'],
      acidity: 8,
      sweetness: 7,
      body: 6,
      balance: 8,
    },
    sku: 'ETH-YIR-001',
    barcodes: ['123456789012'],
    images: ['https://example.com/ethiopian.jpg'],
    prices: [
      {
        amount: 18.99,
        currency: 'USD',
        size: '12',
        unit: 'oz',
      },
    ],
    categories: ['Single Origin', 'Light Roast'],
    tags: ['Ethiopian', 'Floral', 'Citrus'],
    isAvailable: true,
  },
  {
    name: 'Colombian Supremo',
    description: 'A balanced and smooth coffee with chocolate and caramel notes.',
    origin: {
      country: 'Colombia',
      region: 'Huila',
      elevation: 1600,
      producer: 'Finca El Paraiso',
    },
    roastLevel: 'medium',
    processingDetails: {
      method: 'washed',
      details: 'Fully washed with controlled fermentation',
    },
    flavorProfile: {
      flavorNotes: ['Chocolate', 'Caramel', 'Nutty'],
      acidity: 6,
      sweetness: 8,
      body: 7,
      balance: 8,
    },
    sku: 'COL-SUP-002',
    barcodes: ['123456789013'],
    images: ['https://example.com/colombian.jpg'],
    prices: [
      {
        amount: 16.99,
        currency: 'USD',
        size: '12',
        unit: 'oz',
      },
    ],
    categories: ['Single Origin', 'Medium Roast'],
    tags: ['Colombian', 'Chocolate', 'Balanced'],
    isAvailable: true,
  },
  {
    name: 'Sumatra Mandheling',
    description: 'A full-bodied and earthy coffee with spicy notes and low acidity.',
    origin: {
      country: 'Indonesia',
      region: 'Sumatra',
      elevation: 1200,
      producer: 'Mandailing Cooperative',
    },
    roastLevel: 'dark',
    processingDetails: {
      method: 'wet-hulled',
      details: 'Traditional Giling Basah wet-hulling process',
    },
    flavorProfile: {
      flavorNotes: ['Earthy', 'Spicy', 'Cedar'],
      acidity: 4,
      sweetness: 6,
      body: 9,
      balance: 7,
    },
    sku: 'IDN-MAN-003',
    barcodes: ['123456789014'],
    images: ['https://example.com/sumatra.jpg'],
    prices: [
      {
        amount: 17.99,
        currency: 'USD',
        size: '12',
        unit: 'oz',
      },
    ],
    categories: ['Single Origin', 'Dark Roast'],
    tags: ['Indonesian', 'Earthy', 'Full Body'],
    isAvailable: true,
  },
];

const sampleUsers = [
  {
    name: 'Admin User',
    email: 'admin@cuppa.com',
    password: 'admin123',
    role: 'admin',
    preferences: {
      roastLevel: ['medium', 'dark'],
      flavorProfile: ['Chocolate', 'Nutty', 'Caramel'],
      brewMethods: ['espresso', 'french press'],
    },
  },
  {
    name: 'Test User',
    email: 'user@cuppa.com',
    password: 'password123',
    role: 'user',
    preferences: {
      roastLevel: ['light', 'medium-light'],
      flavorProfile: ['Fruity', 'Floral', 'Citrus'],
      brewMethods: ['pour over', 'aeropress'],
    },
  },
  {
    name: 'Coffee Enthusiast',
    email: 'enthusiast@cuppa.com',
    password: 'coffee123',
    role: 'user',
    preferences: {
      roastLevel: ['medium', 'medium-dark'],
      flavorProfile: ['Balanced', 'Sweet', 'Complex'],
      brewMethods: ['espresso', 'pour over'],
    },
  },
];

// Import data into DB
const importData = async () => {
  try {
    await connectDB();

    console.log(`MongoDB environment: ${config.NODE_ENV}`);
    console.log(`MongoDB URI: ${config.MONGODB_URI}`);

    // Clear existing data
    await Coffee.deleteMany({});
    await User.deleteMany({});

    // Insert new data
    await Coffee.insertMany(sampleCoffee);
    await User.create(sampleUsers);

    console.log('Data imported successfully');
    process.exit();
  } catch (error: any) {
    console.error(`Error importing data: ${error.message}`);
    process.exit(1);
  }
};

// Delete all data from DB
const deleteData = async () => {
  try {
    await connectDB();

    await Coffee.deleteMany({});
    await User.deleteMany({});

    console.log('Data destroyed successfully');
    process.exit();
  } catch (error: any) {
    console.error(`Error destroying data: ${error.message}`);
    process.exit(1);
  }
};

// Process command line arguments
if (process.argv[2] === '-i') {
  importData();
} else if (process.argv[2] === '-d') {
  deleteData();
} else {
  console.log('Please use "-i" to import data or "-d" to delete data');
  process.exit();
}
