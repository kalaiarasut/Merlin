const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// Species schema
const speciesSchema = new mongoose.Schema({
  scientificName: { type: String, required: true, unique: true },
  commonName: String,
  taxonomicRank: { type: String, required: true },
  kingdom: { type: String, required: true },
  phylum: { type: String, required: true },
  class: { type: String, required: true },
  order: { type: String, required: true },
  family: { type: String, required: true },
  genus: { type: String, required: true },
  taxonId: String,
  aphiaId: String,
  description: String,
  habitat: String,
  distribution: [String],
  images: [String],
  conservationStatus: String,
}, { timestamps: true });

const Species = mongoose.model('Species', speciesSchema);

async function importData() {
  try {
    // Connect to MongoDB
    await mongoose.connect('mongodb://localhost:27017/cmlre_marine');
    console.log('✓ Connected to MongoDB');

    // Clear existing data
    await Species.deleteMany({});
    console.log('✓ Cleared existing species');

    // Read and parse JSON
    const filePath = path.join(__dirname, 'database/seeds/species.json');
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(fileContent);
    console.log(`✓ Loaded ${data.length} records from species.json`);

    // Insert data
    let inserted = 0;
    for (const record of data) {
      try {
        // Flatten distribution if it's nested
        let distribution = record.distribution || [];
        if (Array.isArray(distribution) && distribution.length > 0 && Array.isArray(distribution[0])) {
          distribution = distribution.flat();
        }

        await Species.findOneAndUpdate(
          { scientificName: record.scientificName },
          {
            scientificName: record.scientificName,
            commonName: record.commonName,
            taxonomicRank: record.taxonomicRank || 'species',
            kingdom: record.kingdom || 'Animalia',
            phylum: record.phylum || 'Chordata',
            class: record.class || 'Actinopterygii',
            order: record.order || 'Unknown',
            family: record.family || 'Unknown',
            genus: record.genus || record.scientificName?.split(' ')[0],
            habitat: record.habitat,
            conservationStatus: record.conservationStatus,
            distribution: distribution,
          },
          { upsert: true, new: true }
        );
        inserted++;
        if (inserted % 10 === 0) {
          console.log(`  ✓ Inserted ${inserted}/${data.length}`);
        }
      } catch (err) {
        console.warn(`⚠ Skipped: ${err.message}`);
      }
    }

    console.log(`✅ Successfully imported ${inserted} species`);
    const count = await Species.countDocuments();
    console.log(`✅ Total species in database: ${count}`);

    await mongoose.disconnect();
    console.log('✓ Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

importData();
