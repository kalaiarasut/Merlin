import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from '../models/User';
import { authLimiter } from '../middleware/rateLimiter';
import { AppError } from '../middleware/errorHandler';
import { authenticate, AuthRequest, requireAdmin } from '../middleware/auth';

const router = Router();

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: User login
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 */
router.post('/login', authLimiter, async (req: Request, res: Response, next) => {
  try {
    const { email, password } = req.body;

    // For demo purposes, accept default credentials
    if (email === 'admin@cmlre.gov.in' && password === 'cmlre2024') {
      const user = {
        id: '1',
        email: 'admin@cmlre.gov.in',
        name: 'CMLRE Administrator',
        role: 'admin',
        organization: 'CMLRE - Ministry of Earth Sciences',
      };

      const token = (jwt as any).sign(
        user,
        process.env.JWT_SECRET || 'your_jwt_secret',
        { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
      ) as string;

      return res.json({ user, token });
    }

    // Check database for user
    const user = await User.findOne({ email });
    if (!user) {
      throw new AppError('Invalid credentials', 401);
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      throw new AppError('Invalid credentials', 401);
    }

    const payload = {
      id: String(user._id),
      email: user.email,
      name: user.name,
      role: user.role,
      organization: user.organization,
    };

    const token = (jwt as any).sign(
      payload,
      process.env.JWT_SECRET || 'your_jwt_secret',
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    ) as string;

    res.json({
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        organization: user.organization,
      },
      token,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/register', async (req: Request, res: Response, next) => {
  try {
    const { email, password, name, organization } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      throw new AppError('User already exists', 400);
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      email,
      password: hashedPassword,
      name,
      organization,
      role: 'researcher',
    });

    res.status(201).json({ message: 'User created successfully', userId: user._id });
  } catch (error) {
    next(error);
  }
});

// Get all users (Admin only)
router.get('/users', authenticate, requireAdmin, async (req: AuthRequest, res: Response, next) => {
  try {
    const { page = 1, limit = 20, search, role, status } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const query: any = {};
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (role) query.role = role;
    if (status) query.status = status;

    const [users, total] = await Promise.all([
      User.find(query)
        .select('-password')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      User.countDocuments(query)
    ]);

    res.json({
      users,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get single user
router.get('/users/:id', authenticate, requireAdmin, async (req: AuthRequest, res: Response, next) => {
  try {
    const user = await User.findById(req.params.id).select('-password').lean();
    
    if (!user) {
      throw new AppError('User not found', 404);
    }

    res.json(user);
  } catch (error) {
    next(error);
  }
});

// Update user (Admin only)
router.put('/users/:id', authenticate, requireAdmin, async (req: AuthRequest, res: Response, next) => {
  try {
    const { name, email, role, status, organization } = req.body;
    
    const user = await User.findById(req.params.id);
    if (!user) {
      throw new AppError('User not found', 404);
    }

    // Check if email is being changed to one that already exists
    if (email && email !== user.email) {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        throw new AppError('Email already in use', 400);
      }
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      { 
        name: name || user.name,
        email: email || user.email,
        role: role || user.role,
        status: status || user.status,
        organization: organization || user.organization
      },
      { new: true }
    ).select('-password');

    res.json(updatedUser);
  } catch (error) {
    next(error);
  }
});

// Delete user (Admin only)
router.delete('/users/:id', authenticate, requireAdmin, async (req: AuthRequest, res: Response, next) => {
  try {
    const user = await User.findById(req.params.id);
    
    if (!user) {
      throw new AppError('User not found', 404);
    }

    // Prevent deleting self
    if (String(user._id) === req.user?.id) {
      throw new AppError('Cannot delete your own account', 400);
    }

    await User.findByIdAndDelete(req.params.id);
    
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// Reset user password (Admin only)
router.post('/users/:id/reset-password', authenticate, requireAdmin, async (req: AuthRequest, res: Response, next) => {
  try {
    const { newPassword } = req.body;
    
    if (!newPassword || newPassword.length < 6) {
      throw new AppError('Password must be at least 6 characters', 400);
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      throw new AppError('User not found', 404);
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await User.findByIdAndUpdate(req.params.id, { password: hashedPassword });

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    next(error);
  }
});

// Get user statistics (Admin only)
router.get('/stats', authenticate, requireAdmin, async (req: AuthRequest, res: Response, next) => {
  try {
    const [
      totalUsers,
      activeUsers,
      adminUsers,
      researcherUsers
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ status: 'active' }),
      User.countDocuments({ role: 'admin' }),
      User.countDocuments({ role: 'researcher' })
    ]);

    const recentUsers = await User.find()
      .select('-password')
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    res.json({
      totalUsers,
      activeUsers,
      adminUsers,
      researcherUsers,
      recentUsers
    });
  } catch (error) {
    next(error);
  }
});

export default router;
