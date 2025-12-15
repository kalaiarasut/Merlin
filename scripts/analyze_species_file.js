const fs = require('fs');
const path = require('path');

const file = process.argv[2];
if (!file) {
  console.error('Usage: node analyze_species_file.js <path-to-json>');
  process.exit(1);
}
const resolved = path.resolve(file);
if (!fs.existsSync(resolved)) {
  console.error(`File not found: ${resolved}`);
  process.exit(1);
}
const data = JSON.parse(fs.readFileSync(resolved, 'utf-8'));
const unique = new Set();
for (const record of data) {
  if (record.scientificName) {
    unique.add(record.scientificName.trim().toLowerCase());
  }
}
console.log('Total records:', data.length);
console.log('Unique scientific names:', unique.size);
