import { Request, Response, NextFunction } from 'express';
import { initializeOAuth, completeOAuth, storeAccessToken } from '../services/shopify.service';
import crypto from 'crypto';
import config from '../config/config';
import { IUser } from '../models/user.model';
import logger from '../utils/logger';
import JwtService from '../utils/jwt.service';

/**
 * @desc    Initialize OAuth process with Shopify
 * @route   GET /api/shopify/auth/oauth
 * @access  Private/Admin
 */
export const startOAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Define the redirect URI for OAuth completion
    const host = req.get('host') || 'localhost:5001';
    const protocol = req.protocol || 'http';
    const redirectUri = `${protocol}://${host}/api/shopify/auth/callback`;

    // Initialize OAuth and get authorization URL
    const authUrl = await initializeOAuth(redirectUri);

    if (!authUrl) {
      res.status(500).json({
        success: false,
        message: 'Failed to initialize Shopify OAuth flow',
      });
      return;
    }

    // Return the authorization URL for the client to redirect to
    res.status(200).json({
      success: true,
      data: {
        authUrl,
      },
    });
  } catch (error: any) {
    logger.error(`Error starting Shopify OAuth: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Server error starting Shopify OAuth',
      error: error.message,
    });
  }
};

/**
 * @desc    Handle OAuth callback from Shopify
 * @route   GET /api/shopify/auth/callback
 * @access  Private
 */
export const handleOAuthCallback = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { shop, code, state } = req.query;

    if (!shop || !code || !state) {
      res.status(400).json({
        success: false,
        message: 'Missing required parameters',
      });
      return;
    }

    // Complete the OAuth process
    const success = await completeOAuth(shop.toString(), code.toString(), state.toString());

    if (!success) {
      res.status(400).json({
        success: false,
        message: 'OAuth completion failed',
      });
      return;
    }

    // Redirect to admin dashboard or return success
    if (req.headers.accept?.includes('application/json')) {
      res.status(200).json({
        success: true,
        message: 'Shopify OAuth completed successfully',
      });
    } else {
      // Redirect to admin dashboard with success parameter
      res.redirect('/admin/settings?shopify=connected');
    }
  } catch (error: any) {
    logger.error(`Error handling Shopify OAuth callback: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Server error handling Shopify OAuth callback',
      error: error.message,
    });
  }
};

/**
 * @desc    Generate Multipass token for customer login
 * @route   POST /api/shopify/auth/multipass
 * @access  Private
 */
export const generateMultipassToken = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const user = req.user as IUser;
    const { return_to } = req.body;

    // Check if Shopify integration is enabled
    if (!config.SHOPIFY_API_SECRET || !config.SHOPIFY_STORE_URL) {
      res.status(500).json({
        success: false,
        message: 'Shopify integration is not properly configured',
      });
      return;
    }

    // Create customer data JSON
    const customerData: Record<string, any> = {
      email: user.email,
      created_at: new Date().toISOString(),
      first_name: user.firstName || '',
      last_name: user.lastName || '',
      remote_ip: req.ip,
      return_to: return_to || `${config.SHOPIFY_STORE_URL}/account`,
    };

    // Multipass encryption
    // Generate a 16-byte initialization vector
    const iv = crypto.randomBytes(16);
    
    // Create encryption key from Shopify secret
    const multipassSecret = Buffer.from(config.SHOPIFY_API_SECRET, 'utf-8');
    const encryptionKey = crypto.createHash('sha256').update(multipassSecret).digest();
    
    // Encrypt the customer data JSON
    const cipher = crypto.createCipheriv('aes-256-cbc', encryptionKey, iv);
    const jsonData = JSON.stringify(customerData);
    let encrypted = cipher.update(jsonData, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    
    // Compute the signature for the encrypted data with the IV
    const signature = crypto
      .createHmac('sha256', encryptionKey)
      .update(iv.toString('base64') + encrypted)
      .digest('base64');
    
    // Combine the Base64-encoded IV and the encrypted data, separated by a hyphen
    const token = iv.toString('base64') + '-' + encrypted;
    
    // URL-encode the token
    const multipassToken = encodeURIComponent(token);
    
    // Get shop domain from store URL
    const shopDomain = new URL(config.SHOPIFY_STORE_URL).hostname;
    
    // Generate the redirect URL
    const redirectUrl = `https://${shopDomain}/account/login/multipass/${multipassToken}`;

    // Return the multipass login URL
    res.status(200).json({
      success: true,
      data: {
        multipassUrl: redirectUrl,
      },
    });
  } catch (error: any) {
    logger.error(`Error generating Multipass token: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Server error generating Multipass token',
      error: error.message,
    });
  }
};

/**
 * @desc    Get Shopify connection status
 * @route   GET /api/shopify/auth/status
 * @access  Private/Admin
 */
export const getConnectionStatus = async (
  req: Request, 
  res: Response, 
  next: NextFunction
): Promise<void> => {
  try {
    // Check if Shopify API credentials are configured
    const isConfigured = Boolean(
      config.SHOPIFY_API_KEY && 
      config.SHOPIFY_API_SECRET && 
      config.SHOPIFY_STORE_URL
    );

    res.status(200).json({
      success: true,
      data: {
        isConfigured,
        storeUrl: config.SHOPIFY_STORE_URL || null,
      },
    });
  } catch (error: any) {
    logger.error(`Error checking Shopify connection status: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Server error checking Shopify connection status',
      error: error.message,
    });
  }
};

/**
 * @desc    Manually set Shopify access token (for non-OAuth flows)
 * @route   POST /api/shopify/auth/token
 * @access  Private/Admin
 */
export const setAccessToken = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { shop, accessToken } = req.body;

    if (!shop || !accessToken) {
      res.status(400).json({
        success: false,
        message: 'Missing required parameters (shop, accessToken)',
      });
      return;
    }

    // Store the access token securely
    await storeAccessToken(shop, accessToken);

    res.status(200).json({
      success: true,
      message: 'Shopify access token stored successfully',
    });
  } catch (error: any) {
    logger.error(`Error setting Shopify access token: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Server error setting Shopify access token',
      error: error.message,
    });
  }
}; 