import { Router, Response } from 'express';
import { Species } from '../models/Species';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

router.get('/', authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const { page = 1, limit = 20, search, phylum, class: className } = req.query;
    
    const filter: any = {};
    if (search) {
      filter.$or = [
        { scientificName: { $regex: search, $options: 'i' } },
        { commonName: { $regex: search, $options: 'i' } },
      ];
    }
    if (phylum) filter.phylum = phylum;
    if (className) filter.class = className;

    const species = await Species.find(filter)
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit))
      .sort({ scientificName: 1 });

    const total = await Species.countDocuments(filter);

    res.json({
      data: species,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const species = await Species.findById(req.params.id);
    if (!species) {
      return res.status(404).json({ error: 'Species not found' });
    }
    res.json(species);
  } catch (error) {
    next(error);
  }
});

router.post('/', authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const species = await Species.create(req.body);
    res.status(201).json(species);
  } catch (error) {
    next(error);
  }
});

export default router;
