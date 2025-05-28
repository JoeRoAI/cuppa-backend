# Barcode Lookup API Documentation

This document provides detailed information about the barcode lookup functionality in the Cuppa API.

## Overview

The barcode lookup API allows clients to retrieve coffee product information using standard barcode values. This is particularly useful for:

- Point-of-sale (POS) systems
- Mobile apps with barcode scanning capabilities
- Inventory management systems
- Product verification systems

The API supports both single barcode lookups and bulk (multiple barcodes) lookups for efficient batch processing.

## API Endpoints

### Single Barcode Lookup

Retrieve a single coffee product by its barcode.

**Endpoint:** `GET /api/coffee/barcode/:code`

**URL Parameters:**
- `code` (required): The barcode value to lookup

**Example Request:**
```
GET /api/coffee/barcode/1234567890123
```

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "_id": "60d21b4667d0d8992e610c85",
    "name": "Ethiopian Yirgacheffe",
    "description": "A bright and fruity coffee with floral notes and citrus acidity",
    "origin": {
      "country": "Ethiopia",
      "region": "Yirgacheffe"
    },
    "roastLevel": "medium",
    "processingDetails": {
      "method": "washed"
    },
    "barcodes": ["1234567890123"],
    "sku": "ETH-YIR-001",
    "prices": [
      {
        "amount": 15.99,
        "currency": "USD",
        "size": "12oz",
        "unit": "oz"
      }
    ],
    "createdAt": "2023-05-18T14:30:00.000Z",
    "updatedAt": "2023-05-18T14:30:00.000Z"
  }
}
```

**Error Response (404 Not Found):**
```json
{
  "success": false,
  "message": "No coffee found with the provided barcode"
}
```

### Bulk Barcode Lookup

Lookup multiple coffee products by their barcodes in a single request.

**Endpoint:** `POST /api/coffee/barcode/bulk`

**Request Body:**
```json
{
  "barcodes": ["1234567890123", "1234567890124", "9876543210987"]
}
```

**Success Response (200 OK):**
```json
{
  "success": true,
  "count": 2,
  "data": [
    {
      "barcode": "1234567890123",
      "found": true,
      "data": {
        "_id": "60d21b4667d0d8992e610c85",
        "name": "Ethiopian Yirgacheffe",
        "description": "A bright and fruity coffee with floral notes and citrus acidity",
        "origin": {
          "country": "Ethiopia",
          "region": "Yirgacheffe"
        },
        "roastLevel": "medium",
        "barcodes": ["1234567890123"],
        "sku": "ETH-YIR-001"
        // other fields omitted for brevity
      }
    },
    {
      "barcode": "1234567890124",
      "found": true,
      "data": {
        "_id": "60d21c1f67d0d8992e610c86",
        "name": "Colombian Supremo",
        "description": "A balanced coffee with caramel sweetness and nutty undertones",
        "origin": {
          "country": "Colombia",
          "region": "Huila"
        },
        "roastLevel": "medium-dark",
        "barcodes": ["1234567890124"],
        "sku": "COL-SUP-001"
        // other fields omitted for brevity
      }
    },
    {
      "barcode": "9876543210987",
      "found": false,
      "data": null
    }
  ]
}
```

**Error Response (400 Bad Request):**
```json
{
  "success": false,
  "message": "Please provide an array of valid barcodes"
}
```

## Usage Notes

1. **Barcode Formats:** The API supports all standard barcode formats (UPC-A, EAN-13, etc.). Barcodes are stored as strings to preserve leading zeros.

2. **Multiple Barcodes:** A coffee product can have multiple associated barcodes (e.g., different package sizes may have different barcodes). Each barcode uniquely identifies a product.

3. **Performance:** 
   - Single barcode lookups are optimized for speed with indexed queries
   - Bulk lookups use a single database query to retrieve all matching products efficiently

4. **Caching:** For high-traffic environments, consider implementing client-side caching of frequently used barcode lookups to reduce API load.

## Testing the API

A test script is provided to validate the barcode lookup functionality:

```
node scripts/test-barcode-lookup.js
```

This script creates test coffee products with barcodes and performs both single and bulk lookups to verify the API is functioning correctly.

## Error Handling

The API follows standard HTTP status codes:
- 200: Successful request
- 400: Invalid request (e.g., missing or invalid parameters)
- 404: Barcode not found
- 500: Server error

All error responses include a descriptive message to help diagnose the issue. 