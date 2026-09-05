import { Request, Response, NextFunction } from 'express';
import { config } from '../config.js';

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  // If no API key configured or configured to 'any', pass through
  if (!config.apiKey || config.apiKey === 'any') {
    return next();
  }

  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({
      error: {
        message: 'Missing Authorization header. Please provide Bearer token.',
        type: 'invalid_request_error',
        param: null,
        code: 'missing_api_key'
      }
    });
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return res.status(401).json({
      error: {
        message: 'Invalid Authorization header format. Expected "Bearer <token>"',
        type: 'invalid_request_error',
        param: null,
        code: 'invalid_api_key'
      }
    });
  }

  const token = parts[1].trim();

  // If apiKey is 'any', any non-empty token is accepted
  if (config.apiKey === 'any' && token.length > 0) {
    return next();
  }

  // Exact match
  if (token === config.apiKey) {
    return next();
  }

  return res.status(401).json({
    error: {
      message: 'Incorrect API key provided.',
      type: 'invalid_request_error',
      param: null,
      code: 'invalid_api_key'
    }
  });
}
