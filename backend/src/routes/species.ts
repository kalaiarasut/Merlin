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
    if (className) filter.class = className;

    // Visibility Policy Enforcement: 
    // Researchers/Viewers only see validated data. Admins/Experts see everything.
    const isStaff = req.user?.role === 'admin' || req.user?.role === 'expert';
    if (!isStaff) {
      filter['validationStatus.status'] = { $in: ['auto-validated', 'expert-validated'] };
    }

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
    const isStaff = req.user?.role === 'admin' || req.user?.role === 'expert';
    const query: any = { _id: req.params.id };

    if (!isStaff) {
      query['validationStatus.status'] = { $in: ['auto-validated', 'expert-validated'] };
    }

    const species = await Species.findOne(query);
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

// Update species
router.put('/:id', authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const species = await Species.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    );
    if (!species) {
      return res.status(404).json({ error: 'Species not found' });
    }
    res.json(species);
  } catch (error) {
    next(error);
  }
});

// Delete species
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const species = await Species.findByIdAndDelete(req.params.id);
    if (!species) {
      return res.status(404).json({ error: 'Species not found' });
    }
    res.json({ message: 'Species deleted successfully', id: req.params.id });
  } catch (error) {
    next(error);
  }
});

export default router;
