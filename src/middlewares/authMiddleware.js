import { verifyToken } from '../utils/jwtUtils.js';
import UserModel from '../models/userModel.js';
import { asyncHandler } from './errorHandler.js';

const protect = asyncHandler(async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      token = req.headers.authorization.split(' ')[1];

      const decoded = verifyToken(token);
      
      if (!decoded?.id) {
        return res.status(401).json({ error: 'Not authorized, token failed' });
      }

      const dbUser = await UserModel.findById(decoded.id);
      if (!dbUser || !dbUser.is_active) {
        return res.status(401).json({ error: 'Not authorized, account unavailable' });
      }

      req.user = {
        id: dbUser.id,
        name: dbUser.name,
        email: dbUser.email,
        role: dbUser.role,
        is_verified: !!dbUser.is_verified,
      };
      next();
    } catch (error) {
      return res.status(401).json({ error: 'Not authorized, token failed' });
    }
  } else {
    return res.status(401).json({ error: 'Not authorized, no token provided' });
  }
});

export { protect };
