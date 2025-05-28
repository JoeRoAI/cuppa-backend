# Render Deployment Guide for Cuppa Backend

This guide will help you successfully deploy your Cuppa backend to Render and fix the current deployment issues.

## Current Issues Identified

1. **MongoDB Connection Error**: The app is trying to connect to `localhost:27017` which doesn't exist on Render
2. **Missing Environment Variables**: No production environment variables are configured
3. **Port Binding**: The app needs to bind to the correct port and host for Render

## Prerequisites

1. **MongoDB Atlas Account**: You need a cloud MongoDB database
2. **Render Account**: Free tier is sufficient for testing

## Step 1: Set Up MongoDB Atlas

1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Create a free cluster
3. Create a database user with read/write permissions
4. Whitelist all IP addresses (0.0.0.0/0) for Render deployment
5. Get your connection string (it should look like):
   ```
   mongodb+srv://username:password@cluster.mongodb.net/cuppa?retryWrites=true&w=majority
   ```

## Step 2: Configure Render Environment Variables

In your Render service dashboard, go to the **Environment** tab and add these variables:

### Required Variables
```bash
NODE_ENV=production
MONGODB_URI=mongodb+srv://your-username:your-password@your-cluster.mongodb.net/cuppa?retryWrites=true&w=majority
JWT_SECRET=your-super-secure-random-jwt-secret-here
```

### Optional Variables (add if you need these features)
```bash
# Shopify Integration
SHOPIFY_API_KEY=your-shopify-api-key
SHOPIFY_API_SECRET=your-shopify-api-secret
SHOPIFY_STORE_URL=your-store.myshopify.com

# OAuth Providers
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
FACEBOOK_APP_ID=your-facebook-app-id
FACEBOOK_APP_SECRET=your-facebook-app-secret

# Cloudinary (for image uploads)
CLOUDINARY_CLOUD_NAME=your-cloudinary-cloud-name
CLOUDINARY_API_KEY=your-cloudinary-api-key
CLOUDINARY_API_SECRET=your-cloudinary-api-secret
```

## Step 3: Render Service Configuration

Make sure your Render service is configured with:

- **Build Command**: `npm install`
- **Start Command**: `npm start`
- **Environment**: `Node`
- **Region**: Choose the closest to your users
- **Instance Type**: Free tier is fine for testing

## Step 4: Deploy

1. Push your updated code to GitHub
2. Trigger a new deployment in Render
3. Monitor the deployment logs

## Step 5: Verify Deployment

After deployment, test these endpoints:

1. **Health Check**: `https://your-app-name.onrender.com/health`
2. **Root Endpoint**: `https://your-app-name.onrender.com/`

You should see responses like:
```json
{
  "success": true,
  "status": "healthy",
  "timestamp": "2025-05-28T16:30:00.000Z",
  "uptime": 123.456,
  "env": "production",
  "port": 10000,
  "database": "mongodb"
}
```

## Troubleshooting

### MongoDB Connection Issues
- Verify your connection string is correct
- Ensure your MongoDB Atlas cluster allows connections from all IPs (0.0.0.0/0)
- Check that your database user has the correct permissions

### Port Issues
- Render automatically sets the PORT environment variable
- The app now binds to `0.0.0.0` in production mode
- Default port is 10000 if PORT is not set

### Environment Variables
- Double-check all required environment variables are set in Render
- Use the `render.env.example` file as a reference
- Generate a secure JWT secret using a random string generator

### Logs
- Check Render deployment logs for specific error messages
- Look for the configuration output at startup:
  ```
  🔧 Configuration loaded:
     NODE_ENV: production
     PORT: 10000
     MONGODB_URI: mongodb+srv://***:***@cluster.mongodb.net/cuppa
  ```

## Security Notes

1. **Never commit sensitive data** like API keys or database passwords to your repository
2. **Use strong, random JWT secrets** in production
3. **Regularly rotate your API keys** and database passwords
4. **Monitor your application logs** for security issues

## Performance Optimization

1. **Enable MongoDB connection pooling** (already configured)
2. **Use environment-specific CORS origins** for better security
3. **Consider using Redis** for session storage in production
4. **Monitor your database performance** in MongoDB Atlas

## Next Steps

After successful deployment:

1. Update your frontend to use the new backend URL
2. Test all API endpoints thoroughly
3. Set up monitoring and alerting
4. Configure custom domain if needed
5. Set up CI/CD pipeline for automatic deployments

## Support

If you encounter issues:

1. Check the Render deployment logs
2. Verify all environment variables are set correctly
3. Test your MongoDB connection string locally first
4. Ensure your GitHub repository is properly connected to Render 