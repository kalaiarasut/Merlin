// MongoDB Initialization Script

db = db.getSiblingDB('cmlre_marine');

// Create collections with schemas
db.createCollection('species', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['scientificName', 'taxonomicRank', 'kingdom', 'phylum'],
      properties: {
        scientificName: { bsonType: 'string' },
        commonName: { bsonType: 'string' },
        taxonomicRank: { bsonType: 'string' },
        kingdom: { bsonType: 'string' },
        phylum: { bsonType: 'string' },
        class: { bsonType: 'string' },
        order: { bsonType: 'string' },
        family: { bsonType: 'string' },
        genus: { bsonType: 'string' }
      }
    }
  }
});

db.createCollection('otoliths');
db.createCollection('edna_detections');
db.createCollection('ingestion_jobs');
db.createCollection('users');

// Create indexes
db.species.createIndex({ scientificName: 'text', commonName: 'text' });
db.species.createIndex({ scientificName: 1 }, { unique: true });
db.species.createIndex({ phylum: 1, class: 1, order: 1, family: 1 });

db.otoliths.createIndex({ speciesId: 1 });
db.edna_detections.createIndex({ speciesId: 1 });
db.edna_detections.createIndex({ location: '2dsphere' });

db.ingestion_jobs.createIndex({ userId: 1, createdAt: -1 });
db.users.createIndex({ email: 1 }, { unique: true });

// Insert sample admin user
db.users.insertOne({
  email: 'admin@cmlre.gov.in',
  password: '$2a$10$xXxXxXxXxXxXxXxXxXxXxX',  // Hashed password
  name: 'CMLRE Administrator',
  role: 'admin',
  organization: 'CMLRE - Ministry of Earth Sciences',
  createdAt: new Date()
});

print('MongoDB initialization completed');
