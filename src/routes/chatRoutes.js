import express from 'express';
import { sendMessage, getHistory, getSessions, getProfessions, chatMessageSchema } from '../controllers/chatController.js';
import { validate } from '../middlewares/validationMiddleware.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Public route: allow frontend to load available professions before auth.
router.get('/professions', getProfessions);

// Apply auth middleware to remaining chat routes.
router.use(protect);

router.post('/message', validate(chatMessageSchema), sendMessage);
router.get('/history', getHistory);
router.get('/sessions', getSessions);

export default router;
