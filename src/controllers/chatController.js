import Joi from 'joi';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import ChatModel from '../models/chatModel.js';
import LogModel from '../models/logModel.js';
import ProfessionModel from '../models/professionModel.js';
import { responseByAI } from '../services/geminiService.js';
import { asyncHandler } from '../middlewares/errorHandler.js';
import logger from '../utils/logger.js';

const chatResponseCache = new Map();
const CHAT_CACHE_TTL_MS = 60 * 60 * 1000;

// Validation schema
const chatMessageSchema = Joi.object({
  message: Joi.string().required(),
  personaRole: Joi.string().default('assistant'),
  sessionId: Joi.string().optional(),
  mode: Joi.string().valid('PROFESSIONAL', 'GF', 'BF', 'BHAKTI').default('PROFESSIONAL'),
  partnerName: Joi.string().max(120).allow('').optional(),
});

// @desc    Send a message to AI and get response
// @route   POST /api/chat/message
// @access  Private
const sendMessage = asyncHandler(async (req, res) => {
  const { message, personaRole, sessionId = uuidv4(), mode = 'PROFESSIONAL', partnerName = '' } = req.body;
  const userId = req.user.id;
  if (!req.user.is_verified) {
    const error = new Error('Please verify your email to use chat features.');
    error.statusCode = 403;
    throw error;
  }

  const profession = await ProfessionModel.findByKeyName(personaRole);
  if (!profession) {
    const error = new Error('Invalid profession selected.');
    error.statusCode = 400;
    throw error;
  }

  // Generate a cache key hash for the prompt scenario
  const cacheKey = `chat_cache:${crypto
    .createHash('sha256')
    .update(`${mode}_${profession.key_name}_${partnerName}_${message}`)
    .digest('hex')}`;

  let aiResponseText = null;

  const cachedResponse = chatResponseCache.get(cacheKey);
  if (cachedResponse && cachedResponse.expiresAt > Date.now()) {
    logger.info('Serving response from in-memory chat cache');
    aiResponseText = cachedResponse.value;
  } else if (cachedResponse) {
    chatResponseCache.delete(cacheKey);
  }

  // If not cached, call Gemini API
  if (!aiResponseText) {
    logger.info('Calling Gemini API');
    aiResponseText = await responseByAI(message, req.user, profession, mode, partnerName);

    chatResponseCache.set(cacheKey, {
      value: aiResponseText,
      expiresAt: Date.now() + CHAT_CACHE_TTL_MS,
    });
  }

  // Save conversation to Database
  const chatRecord = await ChatModel.saveChat({
    userId,
    professionId: profession.id,
    sessionId,
    personaRole: profession.key_name,
    userMessage: message,
    aiResponse: aiResponseText,
  });

  await LogModel.createLog(userId, 'CHAT_MESSAGE_SENT', {
    sessionId,
    personaRole,
    professionId: profession.id,
    mode,
  });

  res.status(200).json({
    success: true,
    data: {
      sessionId: chatRecord.session_id,
      persona: chatRecord.persona_role,
      professionLabel: profession.label,
      userMessage: chatRecord.user_message,
      aiResponse: chatRecord.ai_response,
      createdAt: chatRecord.created_at,
    },
  });
});

// @desc    Get Chat History
// @route   GET /api/chat/history
// @access  Private
const getHistory = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { sessionId } = req.query;

  let history;
  if (sessionId) {
    history = await ChatModel.getHistoryBySession(userId, sessionId);
  } else {
    history = await ChatModel.getHistoryByUser(userId);
  }

  res.status(200).json({
    success: true,
    count: history.length,
    data: history,
    meta: sessionId
      ? {
          sessionId,
          sessionTitle: history[0]?.user_message || null,
          canChat: false,
        }
      : {
          canChat: true,
        },
  });
});

// @desc    Get Session List
// @route   GET /api/chat/sessions
// @access  Private
const getSessions = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const sessions = await ChatModel.getSessionsByUser(userId);
  res.status(200).json({
    success: true,
    count: sessions.length,
    data: sessions,
  });
});

// @desc    Get available professions
// @route   GET /api/chat/professions
// @access  Public
const getProfessions = asyncHandler(async (req, res) => {
  const professions = await ProfessionModel.getAllActive();
  res.status(200).json({
    success: true,
    count: professions.length,
    data: professions.map((p) => ({
      id: p.id,
      keyName: p.key_name,
      label: p.label,
      icon: p.icon,
    })),
  });
});

export { sendMessage, getHistory, getSessions, getProfessions, chatMessageSchema };
