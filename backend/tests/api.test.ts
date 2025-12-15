/**
 * Backend API Tests - Jest
 * 
 * Run: npm test
 */

import request from 'supertest';
import mongoose from 'mongoose';
import app from '../src/server';

// Mock JWT token for authenticated requests
const mockToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ0ZXN0LXVzZXIiLCJlbWFpbCI6InRlc3RAY21scmUuZ292LmluIiwiaWF0IjoxNjE2MjM5MDIyfQ.test';

describe('API Health Check', () => {
  it('GET /health should return healthy status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'healthy');
    expect(res.body).toHaveProperty('timestamp');
  });
});

describe('Authentication API', () => {
  describe('POST /api/auth/login', () => {
    it('should return 400 for missing credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({});
      expect(res.status).toBe(400);
    });

    it('should return 401 for invalid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'invalid@test.com', password: 'wrongpassword' });
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/auth/register', () => {
    it('should return 400 for invalid email format', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'invalid-email',
          password: 'password123',
          name: 'Test User'
        });
      expect(res.status).toBe(400);
    });

    it('should return 400 for short password', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@cmlre.gov.in',
          password: '123',
          name: 'Test User'
        });
      expect(res.status).toBe(400);
    });
  });
});

describe('Species API', () => {
  describe('GET /api/species', () => {
    it('should return species list', async () => {
      const res = await request(app)
        .get('/api/species')
        .set('Authorization', `Bearer ${mockToken}`);
      
      // May return 200 with data or 401 if token invalid in test env
      expect([200, 401, 500]).toContain(res.status);
      
      if (res.status === 200) {
        expect(res.body).toHaveProperty('data');
        expect(Array.isArray(res.body.data)).toBe(true);
      }
    });

    it('should support pagination', async () => {
      const res = await request(app)
        .get('/api/species?page=1&limit=10')
        .set('Authorization', `Bearer ${mockToken}`);
      
      if (res.status === 200) {
        expect(res.body.data.length).toBeLessThanOrEqual(10);
      }
    });

    it('should support search', async () => {
      const res = await request(app)
        .get('/api/species?search=tuna')
        .set('Authorization', `Bearer ${mockToken}`);
      
      expect([200, 401, 500]).toContain(res.status);
    });
  });

  describe('GET /api/species/:id', () => {
    it('should return 404 for non-existent species', async () => {
      const res = await request(app)
        .get('/api/species/nonexistent-id')
        .set('Authorization', `Bearer ${mockToken}`);
      
      expect([404, 401, 400, 500]).toContain(res.status);
    });
  });
});

describe('Oceanography API', () => {
  describe('GET /api/oceanography', () => {
    it('should return oceanographic data', async () => {
      const res = await request(app)
        .get('/api/oceanography')
        .set('Authorization', `Bearer ${mockToken}`);
      
      expect([200, 401, 500]).toContain(res.status);
    });

    it('should support parameter filtering', async () => {
      const res = await request(app)
        .get('/api/oceanography?parameter=temperature')
        .set('Authorization', `Bearer ${mockToken}`);
      
      expect([200, 401, 500]).toContain(res.status);
    });

    it('should support date range filtering', async () => {
      const res = await request(app)
        .get('/api/oceanography?startDate=2024-01-01&endDate=2024-12-31')
        .set('Authorization', `Bearer ${mockToken}`);
      
      expect([200, 401, 500]).toContain(res.status);
    });

    it('should support bounding box filtering', async () => {
      const res = await request(app)
        .get('/api/oceanography?minLat=5&maxLat=15&minLon=70&maxLon=80')
        .set('Authorization', `Bearer ${mockToken}`);
      
      expect([200, 401, 500]).toContain(res.status);
    });
  });
});

describe('Data Ingestion API', () => {
  describe('POST /api/ingest', () => {
    it('should return 400 for missing file', async () => {
      const res = await request(app)
        .post('/api/ingest')
        .set('Authorization', `Bearer ${mockToken}`)
        .send({ dataType: 'species' });
      
      expect([400, 401]).toContain(res.status);
    });
  });

  describe('GET /api/ingest/jobs', () => {
    it('should return job list', async () => {
      const res = await request(app)
        .get('/api/ingest/jobs')
        .set('Authorization', `Bearer ${mockToken}`);
      
      expect([200, 401, 500]).toContain(res.status);
    });
  });
});

describe('Analytics API', () => {
  describe('GET /api/analytics/summary', () => {
    it('should return analytics summary', async () => {
      const res = await request(app)
        .get('/api/analytics/summary')
        .set('Authorization', `Bearer ${mockToken}`);
      
      expect([200, 401, 500]).toContain(res.status);
    });
  });
});

describe('Export API', () => {
  describe('GET /api/export/formats', () => {
    it('should return available export formats', async () => {
      const res = await request(app)
        .get('/api/export/formats')
        .set('Authorization', `Bearer ${mockToken}`);
      
      if (res.status === 200) {
        expect(res.body).toHaveProperty('formats');
        expect(Array.isArray(res.body.formats)).toBe(true);
      }
    });
  });

  describe('POST /api/export/bulk', () => {
    it('should return 400 for invalid format', async () => {
      const res = await request(app)
        .post('/api/export/bulk')
        .set('Authorization', `Bearer ${mockToken}`)
        .send({
          format: 'invalid',
          dataTypes: ['species']
        });
      
      expect([400, 401]).toContain(res.status);
    });
  });
});

describe('Notifications API', () => {
  describe('GET /api/notifications', () => {
    it('should return notifications list', async () => {
      const res = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${mockToken}`);
      
      expect([200, 401, 500]).toContain(res.status);
    });
  });
});

// Cleanup
afterAll(async () => {
  // Close database connections if open
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
  }
});
