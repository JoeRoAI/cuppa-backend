# Cuppa Backend API

A Node.js/Express.js backend API for the Cuppa coffee discovery application.

## Tech Stack

- **Framework**: Node.js with Express.js
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: JWT (JSON Web Tokens)
- **Language**: TypeScript
- **E-commerce Integration**: Shopify API

## Features

- User authentication and authorization
- Coffee bean data management
- User preferences and ratings
- Search and discovery functionality
- E-commerce integration via Shopify

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- MongoDB (local or Atlas)

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file in the root directory with the following variables:
   ```
   PORT=5000
   NODE_ENV=development
   MONGODB_URI=mongodb://localhost:27017/cuppa
   JWT_SECRET=your_jwt_secret_here
   JWT_EXPIRES_IN=30d
   SHOPIFY_API_KEY=your_shopify_api_key_here
   SHOPIFY_API_SECRET=your_shopify_api_secret_here
   SHOPIFY_STORE_URL=your_shopify_store_url_here
   ```
4. Start the development server:
   ```bash
   npm run dev
   ```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login and get token
- `GET /api/auth/me` - Get current user info

### Coffee
- `GET /api/coffee` - Get all coffee beans
- `GET /api/coffee/:id` - Get a specific coffee bean
- `POST /api/coffee` - Add a new coffee bean (admin/roaster only)
- `PUT /api/coffee/:id` - Update a coffee bean (admin/roaster only)
- `DELETE /api/coffee/:id` - Delete a coffee bean (admin only)
- `GET /api/coffee/search` - Search coffee beans by name, origin, etc.
- `GET /api/coffee/barcode/:upc` - Get coffee by barcode UPC

### Users
- `GET /api/users/me/preferences` - Get user preferences
- `PUT /api/users/me/preferences` - Update user preferences
- `POST /api/users/me/ratings` - Add a coffee rating
- `GET /api/users/me/ratings` - Get user rating history
- `POST /api/users/me/saved` - Save a coffee to favorites
- `DELETE /api/users/me/saved/:id` - Remove a coffee from favorites

## Project Structure

```
cuppa-backend/
├── src/
│   ├── controllers/    # Request handlers
│   ├── models/         # Mongoose models
│   ├── routes/         # API routes
│   ├── middleware/     # Custom middleware
│   ├── config/         # Configuration files
│   ├── utils/          # Utility functions
│   └── index.ts        # Main server file
├── .env                # Environment variables
├── package.json        # Dependencies and scripts
└── tsconfig.json       # TypeScript configuration
```

## Development Status

This project is currently in initial development phase. 