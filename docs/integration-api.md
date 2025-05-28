# Integration API Documentation

This document provides detailed information about the Integration API, which connects Coffee products with other entities such as Suppliers, Collections, and Ratings.

## Overview

The Integration API serves as a bridge between different data entities in the Cuppa system, enabling:

- Relationships between Coffee products and Suppliers
- Management of user Collections containing Coffee products
- Access to Coffee Ratings and related metadata
- Personalized Coffee recommendations based on user preferences

The API follows RESTful principles and supports both mock data and MongoDB database backends.

## API Endpoints

### Supplier-Coffee Relationships

#### Get Coffee Products by Supplier

Retrieve all coffee products associated with a specific supplier.

**Endpoint:** `GET /api/integration/supplier/:id/coffees`

**URL Parameters:**
- `id` (required): The ID of the supplier

**Query Parameters:**
- `page`: Page number for pagination (default: 1)
- `limit`: Number of items per page (default: 10)

**Example Response:**
```json
{
  "success": true,
  "count": 15,
  "page": 1,
  "totalPages": 2,
  "data": [
    {
      "_id": "60d21b4667d0d8992e610c85",
      "name": "Ethiopian Yirgacheffe",
      "origin": {
        "country": "Ethiopia",
        "region": "Yirgacheffe"
      },
      "roastLevel": "medium",
      // other coffee fields
    },
    // more coffee objects
  ]
}
```

#### Get Supplier Details with Coffee Count

Retrieve supplier information along with the count of associated coffee products.

**Endpoint:** `GET /api/integration/supplier/:id/details`

**URL Parameters:**
- `id` (required): The ID of the supplier

**Example Response:**
```json
{
  "success": true,
  "data": {
    "_id": "60d21b4667d0d8992e610c86",
    "name": "Specialty Coffee Roasters",
    "description": "Artisanal coffee roaster specializing in single-origin beans",
    "location": {
      "country": "United States",
      "city": "Portland"
    },
    "coffeeCount": 12
  }
}
```

#### Associate Coffee with Supplier

Link a coffee product to a supplier. Requires admin privileges.

**Endpoint:** `PUT /api/integration/coffee/:coffeeId/supplier/:supplierId`

**URL Parameters:**
- `coffeeId` (required): The ID of the coffee product
- `supplierId` (required): The ID of the supplier

**Authentication:** Required (Admin role)

**Example Response:**
```json
{
  "success": true,
  "message": "Coffee associated with supplier successfully",
  "data": {
    "coffee": {
      "_id": "60d21b4667d0d8992e610c85",
      "name": "Ethiopian Yirgacheffe"
    },
    "supplier": {
      "_id": "60d21b4667d0d8992e610c86",
      "name": "Specialty Coffee Roasters"
    }
  }
}
```

### Collection Management

#### Get Coffees in Collection

Retrieve all coffee products in a specific collection. Access to private collections is restricted to their owners.

**Endpoint:** `GET /api/integration/collection/:id/coffees`

**URL Parameters:**
- `id` (required): The ID of the collection

**Query Parameters:**
- `page`: Page number for pagination (default: 1)
- `limit`: Number of items per page (default: 10)

**Authentication:** Required for private collections

**Example Response:**
```json
{
  "success": true,
  "count": 8,
  "page": 1,
  "totalPages": 1,
  "data": [
    {
      "_id": "60d21b4667d0d8992e610c85",
      "name": "Ethiopian Yirgacheffe",
      "roastLevel": "medium",
      // other coffee fields
    },
    // more coffee objects
  ]
}
```

#### Add Coffee to Collection

Add a coffee product to a user's collection. Users can only modify their own collections.

**Endpoint:** `PUT /api/integration/collection/:collectionId/coffee/:coffeeId`

**URL Parameters:**
- `collectionId` (required): The ID of the collection
- `coffeeId` (required): The ID of the coffee product

**Authentication:** Required

**Example Response:**
```json
{
  "success": true,
  "message": "Coffee added to collection successfully",
  "data": {
    "collection": {
      "_id": "60d21b4667d0d8992e610c87",
      "name": "My Favorite Light Roasts"
    },
    "coffee": {
      "_id": "60d21b4667d0d8992e610c85",
      "name": "Ethiopian Yirgacheffe"
    }
  }
}
```

### Coffee-Related Data

#### Get Coffee Ratings

Retrieve all ratings for a specific coffee product.

**Endpoint:** `GET /api/integration/coffee/:id/ratings`

**URL Parameters:**
- `id` (required): The ID of the coffee product

**Query Parameters:**
- `page`: Page number for pagination (default: 1)
- `limit`: Number of items per page (default: 10)

**Example Response:**
```json
{
  "success": true,
  "count": 24,
  "page": 1,
  "totalPages": 3,
  "data": [
    {
      "_id": "60d21b4667d0d8992e610c88",
      "userId": {
        "_id": "60d21b4667d0d8992e610c89",
        "name": "Jane Doe"
      },
      "overall": 4.5,
      "aroma": 4,
      "flavor": 5,
      "aftertaste": 4,
      "comment": "Bright and fruity with notes of blueberry.",
      "createdAt": "2023-05-20T14:30:00.000Z"
    },
    // more rating objects
  ]
}
```

#### Get Collections Containing Coffee

Retrieve all public collections that include a specific coffee product.

**Endpoint:** `GET /api/integration/coffee/:id/collections`

**URL Parameters:**
- `id` (required): The ID of the coffee product

**Query Parameters:**
- `page`: Page number for pagination (default: 1)
- `limit`: Number of items per page (default: 10)

**Example Response:**
```json
{
  "success": true,
  "count": 5,
  "page": 1,
  "totalPages": 1,
  "data": [
    {
      "_id": "60d21b4667d0d8992e610c87",
      "name": "Fruity Coffees",
      "description": "Coffee with pronounced fruit notes",
      "userId": {
        "_id": "60d21b4667d0d8992e610c89",
        "name": "Jane Doe"
      },
      "tags": ["fruity", "bright", "acidic"],
      "upvotes": 12
    },
    // more collection objects
  ]
}
```

#### Get Full Coffee Details

Retrieve a coffee product with all related data (supplier, ratings, collection count).

**Endpoint:** `GET /api/integration/coffee/:id/full`

**URL Parameters:**
- `id` (required): The ID of the coffee product

**Example Response:**
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
    "supplierId": {
      "_id": "60d21b4667d0d8992e610c86",
      "name": "Specialty Coffee Roasters",
      "location": {
        "country": "United States"
      }
    },
    "detailedRatings": [
      {
        "_id": "60d21b4667d0d8992e610c88",
        "userId": {
          "_id": "60d21b4667d0d8992e610c89",
          "name": "Jane Doe"
        },
        "overall": 4.5,
        "comment": "Bright and fruity with notes of blueberry."
      },
      // more rating objects
    ],
    "collectionCount": 5,
    // other coffee fields
  }
}
```

### Recommendations

#### Get Recommended Coffees

Retrieve coffee recommendations based on user preferences.

**Endpoint:** `GET /api/integration/recommendations`

**Authentication:** Required

**Example Response:**
```json
{
  "success": true,
  "count": 5,
  "data": [
    {
      "_id": "60d21b4667d0d8992e610c85",
      "name": "Ethiopian Yirgacheffe",
      "roastLevel": "medium",
      "avgRating": 4.7,
      // other coffee fields
    },
    // more coffee objects
  ]
}
```

## Error Responses

All API endpoints follow a consistent error format:

```json
{
  "success": false,
  "message": "Error message description",
  "error": "Detailed error information (development environments only)"
}
```

Common error codes:
- `400 Bad Request`: Invalid input parameters
- `401 Unauthorized`: Authentication required
- `403 Forbidden`: Not authorized to access the resource
- `404 Not Found`: Resource not found
- `500 Internal Server Error`: Server-side error

## Authentication

Many endpoints require authentication using JWT tokens. Include the token in the Authorization header:

```
Authorization: Bearer <token>
```

Admin-only routes require the user to have the "admin" role.

## Database Support

The Integration API supports both MongoDB and an in-memory mock database for development and testing. The behavior is determined by the `usingMockDatabase` configuration. 