import { Router, Response } from 'express';
import axios from 'axios';
import multer from 'multer';
import { authenticate, AuthRequest } from '../middleware/auth';
import { Species } from '../models/Species';
import mongoose from 'mongoose';
import logger from '../utils/logger';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

// Helper function to generate context-aware responses when AI service is unavailable
const generateLocalResponse = async (message: string): Promise<string> => {
  const lowerMessage = message.toLowerCase();
  
  // Try to provide data-driven responses
  try {
    if (lowerMessage.includes('species') || lowerMessage.includes('fish')) {
      const count = await Species.countDocuments();
      const recent = await Species.find().sort({ createdAt: -1 }).limit(5).lean();
      const speciesList = recent.map((s: any) => `• **${s.scientificName}** (${s.commonName || 'Common name not available'})`).join('\n');
      
      return `Based on our marine database, we have **${count} species** catalogued.\n\n**Recent additions:**\n${speciesList}\n\nWould you like me to search for specific species or generate a detailed report?`;
    }
    
    if (lowerMessage.includes('edna') || lowerMessage.includes('dna')) {
      const EdnaSample = mongoose.models.EdnaSample;
      if (EdnaSample) {
        const count = await EdnaSample.countDocuments();
        return `We have **${count} eDNA samples** in our database. eDNA analysis helps us detect species presence through environmental DNA traces in water samples.\n\nKey capabilities:\n• Species detection from water samples\n• Biodiversity assessment\n• Rare species monitoring\n• Invasive species early detection\n\nWould you like to explore the eDNA data or learn about specific findings?`;
      }
    }
    
    if (lowerMessage.includes('otolith')) {
      const Otolith = mongoose.models.Otolith;
      if (Otolith) {
        const count = await Otolith.countDocuments();
        return `Our otolith database contains **${count} records**. Otoliths (ear stones) are calcium carbonate structures in fish that help us determine:\n\n• Age estimation\n• Growth patterns\n• Species identification\n• Environmental history\n\nWould you like to analyze an otolith image or browse existing records?`;
      }
    }
    
    if (lowerMessage.includes('water') || lowerMessage.includes('temperature') || lowerMessage.includes('salinity') || lowerMessage.includes('ocean')) {
      return `Our oceanographic monitoring covers key parameters:\n\n📊 **Parameters tracked:**\n• Sea Surface Temperature (SST)\n• Salinity\n• Dissolved Oxygen\n• pH levels\n• Chlorophyll concentration\n\n📍 **Coverage areas:**\n• Arabian Sea\n• Bay of Bengal\n• Indian Ocean\n\nWould you like to see current conditions or historical trends?`;
    }
  } catch (err) {
    logger.error('Error generating local response:', err);
  }
  
  return `I understand you're asking about "${message.slice(0, 50)}...". Our marine database contains:\n\n• Species observations and biodiversity data\n• Oceanographic measurements\n• eDNA sequence analysis\n• Otolith morphometric records\n\nHow can I help you explore this data? You can ask about specific species, water quality trends, or request data analysis.`;
};

router.post('/chat', authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const { message, context } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    try {
      // Try to call AI service
      const response = await axios.post(`${AI_SERVICE_URL}/chat`, {
        message,
        context,
      }, { timeout: 10000 });

      res.json(response.data);
    } catch (aiError) {
      // Fallback to local response generation
      logger.warn('AI service unavailable, using local fallback');
      const localResponse = await generateLocalResponse(message);
      
      res.json({
        response: localResponse,
        confidence: 0.7,
        source: 'local-fallback'
      });
    }
  } catch (error) {
    next(error);
  }
});

// Fish classification endpoint - Fishial.AI powered
router.post('/classify-fish', authenticate, upload.single('image'), async (req: AuthRequest, res: Response, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Image file is required' });
    }

    logger.info(`Fish classification request received: ${req.file.originalname}, size: ${req.file.size}`);

    try {
      // Create form data to forward to AI service
      const FormData = require('form-data');
      const formData = new FormData();
      formData.append('image', req.file.buffer, {
        filename: req.file.originalname,
        contentType: req.file.mimetype,
      });

      const response = await axios.post(`${AI_SERVICE_URL}/classify-fish`, formData, {
        headers: formData.getHeaders(),
        timeout: 60000, // 60 second timeout for classification
      });

      logger.info(`Fish classification successful: ${response.data.species?.scientificName || 'unknown'}`);
      res.json(response.data);
    } catch (aiError: any) {
      logger.error('AI service error during fish classification:', aiError.message);
      
      // Provide fallback response when AI service is unavailable
      res.status(503).json({
        error: 'Fish classification service temporarily unavailable',
        message: 'The AI service is currently unavailable. Please try again later.',
        species: null,
        alternatives: [],
        model_version: 'unavailable'
      });
    }
  } catch (error) {
    next(error);
  }
});

export default router;
