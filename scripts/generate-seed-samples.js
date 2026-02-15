/* eslint-disable no-console */
/**
 * Generate upload-ready seed datasets across supported formats and store them under:
 *   data_samples/seed/seed_data/
 *
 * Designed to match what the backend ingestion routes expect:
 * - species: records with scientificName, taxonomy, conservationStatus
 * - oceanography: parameter/value/unit/lat/lon/depth/timestamp/source/quality_flag
 * - fisheries: catch/effort and length records compatible with fisheries dataStorage
 * - edna: sequences in FASTA/FASTQ (handled by /api/edna/upload/sequence) + a tabular JSON/CSV for ingestion route
 * - geojson: FeatureCollection with Point geometries (lat/lon derived server-side)
 * - netcdf: CF-ish grid (can be expanded to oceanography points when uploaded as dataType=oceanography)
 * - pdf: simple text report PDF + a table-based PDF for table extraction
 * - zip: bundle of mixed files
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'data_samples', 'seed', 'seed_data');

function requireFromBackend(moduleName) {
  const backendRoot = path.join(ROOT, 'backend');
  const resolved = require.resolve(moduleName, { paths: [backendRoot] });
  return require(resolved);
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function writeText(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf-8');
}

function writeJson(filePath, obj) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), 'utf-8');
}

function toCsv(records) {
  if (!records.length) return '';
  const headers = Array.from(new Set(records.flatMap(r => Object.keys(r))));
  const escape = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    if (/[\n\r,\"]/g.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [headers.join(',')];
  for (const r of records) {
    lines.push(headers.map(h => escape(r[h])).join(','));
  }
  return lines.join('\n');
}

function randBetween(min, max) {
  return min + Math.random() * (max - min);
}

function isoDate(d) {
  return d.toISOString().split('T')[0];
}

function buildSpeciesRecords() {
  return [
    {
      scientificName: 'Thunnus albacares',
      commonName: 'Yellowfin tuna',
      taxonomicRank: 'species',
      kingdom: 'Animalia',
      phylum: 'Chordata',
      class: 'Actinopterygii',
      order: 'Scombriformes',
      family: 'Scombridae',
      genus: 'Thunnus',
      habitat: 'Pelagic, oceanic',
      conservationStatus: 'NT',
      distribution: 'Indian Ocean; Tropical and subtropical waters',
    },
    {
      scientificName: 'Sardinella longiceps',
      commonName: 'Indian oil sardine',
      taxonomicRank: 'species',
      kingdom: 'Animalia',
      phylum: 'Chordata',
      class: 'Actinopterygii',
      order: 'Clupeiformes',
      family: 'Clupeidae',
      genus: 'Sardinella',
      habitat: 'Coastal pelagic',
      conservationStatus: 'LC',
      distribution: 'Arabian Sea; Indian coasts',
    },
    {
      scientificName: 'Epinephelus malabaricus',
      commonName: 'Malabar grouper',
      taxonomicRank: 'species',
      kingdom: 'Animalia',
      phylum: 'Chordata',
      class: 'Actinopterygii',
      order: 'Perciformes',
      family: 'Serranidae',
      genus: 'Epinephelus',
      habitat: 'Reef-associated',
      conservationStatus: 'NT',
      distribution: 'Indian Ocean; Indo-West Pacific',
    },
  ];
}

function buildOceanographyRecords() {
  const baseDate = new Date('2024-01-01T09:00:00Z');
  const params = [
    { parameter: 'temperature', unit: 'degree_C', min: 24.5, max: 30.2 },
    { parameter: 'salinity', unit: 'PSU', min: 33.8, max: 36.2 },
    { parameter: 'chlorophyll', unit: 'mg m-3', min: 0.05, max: 1.2 },
    { parameter: 'dissolved_oxygen', unit: 'micromole kg-1', min: 150, max: 230 },
  ];

  const records = [];
  for (let i = 0; i < 120; i++) {
    const p = params[i % params.length];
    const lat = randBetween(5, 25);
    const lon = randBetween(65, 85);
    const depth = [0, 10, 25, 50, 100][i % 5];
    const ts = new Date(baseDate.getTime() + (i * 60 * 60 * 1000));

    records.push({
      parameter: p.parameter,
      value: Number(randBetween(p.min, p.max).toFixed(3)),
      unit: p.unit,
      latitude: Number(lat.toFixed(4)),
      longitude: Number(lon.toFixed(4)),
      depth,
      timestamp: ts.toISOString(),
      source: 'Seed Upload',
      quality_flag: 'good',
      region: 'Indian Ocean',
    });
  }
  return records;
}

function buildFisheriesCatchRecords() {
  const species = ['Thunnus albacares', 'Sardinella longiceps'];
  const records = [];
  for (let i = 0; i < 80; i++) {
    const d = new Date('2023-01-01T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + i * 7);

    records.push({
      id: `CATCH_${i + 1}`,
      date: isoDate(d),
      species: species[i % species.length],
      catch: Number(randBetween(120, 1800).toFixed(2)),
      effort: Number(randBetween(4, 18).toFixed(2)),
      effortUnit: 'hours',
      lat: Number(randBetween(7, 19).toFixed(4)),
      lon: Number(randBetween(72, 82).toFixed(4)),
      depth: Number(randBetween(10, 140).toFixed(1)),
      gearType: i % 2 === 0 ? 'Longline' : 'Gillnet',
      vesselId: `VSL_${(i % 5) + 1}`,
      area: i % 2 === 0 ? 'Arabian Sea' : 'Bay of Bengal',
    });
  }
  return records;
}

function buildFisheriesLengthRecords() {
  const species = ['Thunnus albacares', 'Epinephelus malabaricus'];
  const records = [];
  const maturity = ['immature', 'maturing', 'mature', 'spawning', 'spent'];
  const sex = ['M', 'F', 'U'];

  for (let i = 0; i < 120; i++) {
    const d = new Date('2023-06-01T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + i * 3);

    const L = randBetween(18, 165);
    records.push({
      id: `LEN_${i + 1}`,
      date: isoDate(d),
      species: species[i % species.length],
      length: Number(L.toFixed(1)),
      weight: Number((L * randBetween(0.002, 0.008)).toFixed(3)),
      sex: sex[i % sex.length],
      maturity: maturity[i % maturity.length],
      location: i % 2 === 0 ? 'Cochin' : 'Chennai',
      age: Number(randBetween(0.5, 8.5).toFixed(1)),
    });
  }
  return records;
}

function buildGeoJson() {
  const features = [];
  const ocean = buildOceanographyRecords().slice(0, 30);
  for (let i = 0; i < ocean.length; i++) {
    const r = ocean[i];
    features.push({
      type: 'Feature',
      id: `pt_${i + 1}`,
      geometry: { type: 'Point', coordinates: [r.longitude, r.latitude] },
      properties: {
        parameter: r.parameter,
        value: r.value,
        unit: r.unit,
        depth: r.depth,
        timestamp: r.timestamp,
        source: 'Seed GeoJSON',
        quality_flag: 'good',
      },
    });
  }

  return {
    type: 'FeatureCollection',
    name: 'seed_ocean_points',
    features,
  };
}

function buildEdnaTabularRecords() {
  return [
    {
      id: 'EDNA_001',
      sequence: 'ACGTTGCAACGTTGCAACGTTGCAACGTTGCA',
      detected_species: 'Sardinella longiceps',
      confidence: 0.92,
      method: 'SeedClassify',
      latitude: 10.1234,
      longitude: 76.5432,
      sampleDate: '2023-11-12',
      depth: 12,
      reads: 15342,
      region: 'Arabian Sea',
      primer: '515F/806R',
      marker: '16S',
    },
    {
      id: 'EDNA_002',
      sequence: 'GGGCAATTTGGGCAATTTGGGCAATTTGGGCAA',
      detected_species: 'Thunnus albacares',
      confidence: 0.88,
      method: 'SeedClassify',
      latitude: 15.4321,
      longitude: 73.1111,
      sampleDate: '2023-11-15',
      depth: 40,
      reads: 8842,
      region: 'Arabian Sea',
      primer: '515F/806R',
      marker: 'COI',
    },
  ];
}

function buildFasta() {
  return [
    '>EDNA_001 Sardinella_longiceps seed_read',
    'ACGTTGCAACGTTGCAACGTTGCAACGTTGCA',
    '>EDNA_002 Thunnus_albacares seed_read',
    'GGGCAATTTGGGCAATTTGGGCAATTTGGGCAA',
    '',
  ].join('\n');
}

function buildFastq() {
  // Minimal valid FASTQ with dummy qualities
  const seq1 = 'ACGTTGCAACGTTGCAACGTTGCAACGTTGCA';
  const seq2 = 'GGGCAATTTGGGCAATTTGGGCAATTTGGGCAA';
  const q1 = 'I'.repeat(seq1.length);
  const q2 = 'I'.repeat(seq2.length);
  return [
    '@EDNA_001 Sardinella_longiceps seed_read',
    seq1,
    '+',
    q1,
    '@EDNA_002 Thunnus_albacares seed_read',
    seq2,
    '+',
    q2,
    '',
  ].join('\n');
}

function buildPdfReportText() {
  return [
    'CMLRE Merlin Seed Report',
    '======================',
    '',
    'Survey: Indian Ocean Seed Cruise',
    'Date range: 2023-11-10 to 2023-11-20',
    'Region: Arabian Sea',
    '',
    'Highlights:',
    '- SST ranged 26.1–29.8 °C',
    '- Chlorophyll elevated near shelf break',
    '- eDNA detections included Sardinella longiceps and Thunnus albacares',
    '',
    'Methods:',
    '- CTD casts at 0–100m',
    '- Water filtration 0.22µm; Illumina sequencing',
    '- Taxonomy cross-check with WoRMS',
    '',
  ].join('\n');
}

async function generatePdf(outPath) {
  // Generate PDF via python reportlab to avoid adding a Node PDF dependency
  const { spawnSync } = require('child_process');
  const py = path.join(ROOT, 'ai-services', '.venv', 'Scripts', 'python.exe');
  const pipArgs = ['-m', 'pip'];

  const ensurePyImport = (importName, pipName) => {
    const check = spawnSync(py, ['-c', `import ${importName}`], { stdio: 'ignore' });
    if (check.status === 0) return;
    console.log(`Installing Python dependency into venv: ${pipName}...`);
    const install = spawnSync(py, [...pipArgs, 'install', pipName], { stdio: 'inherit' });
    if (install.status !== 0) {
      throw new Error(`Failed to install ${pipName} into ai-services venv`);
    }
  };

  ensurePyImport('reportlab', 'reportlab');
  const script = path.join(OUT_DIR, '_tmp_make_pdf.py');
  const txtPath = path.join(OUT_DIR, 'seed_report.txt');
  writeText(txtPath, buildPdfReportText());

  writeText(script, [
    'from reportlab.pdfgen import canvas',
    'from reportlab.lib.pagesizes import letter',
    '',
    `in_path = r'''${txtPath}'''`,
    `out_path = r'''${outPath}'''`,
    '',
    'with open(in_path, "r", encoding="utf-8") as f:',
    '    text = f.read()',
    '',
    'c = canvas.Canvas(out_path, pagesize=letter)',
    'width, height = letter',
    'y = height - 72',
    'for line in text.splitlines():',
    '    c.drawString(72, y, line[:120])',
    '    y -= 14',
    '    if y < 72:',
    '        c.showPage()',
    '        y = height - 72',
    'c.save()',
    'print("wrote", out_path)',
    '',
  ].join('\n'));

  const r = spawnSync(py, [script], { stdio: 'inherit' });
  if (r.status !== 0) {
    throw new Error('PDF generation failed; ensure ai-services venv exists with reportlab installed.');
  }

  fs.unlinkSync(script);
}

async function generatePdfTable(outPath, csvPath) {
  // Generate a PDF that contains a real table (for pdfplumber table extraction)
  const { spawnSync } = require('child_process');
  const py = path.join(ROOT, 'ai-services', '.venv', 'Scripts', 'python.exe');
  const pipArgs = ['-m', 'pip'];

  const ensurePyImport = (importName, pipName) => {
    const check = spawnSync(py, ['-c', `import ${importName}`], { stdio: 'ignore' });
    if (check.status === 0) return;
    console.log(`Installing Python dependency into venv: ${pipName}...`);
    const install = spawnSync(py, [...pipArgs, 'install', pipName], { stdio: 'inherit' });
    if (install.status !== 0) {
      throw new Error(`Failed to install ${pipName} into ai-services venv`);
    }
  };

  ensurePyImport('reportlab', 'reportlab');

  const script = path.join(OUT_DIR, '_tmp_make_pdf_table.py');
  writeText(script, [
    'import csv',
    'from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer',
    'from reportlab.lib.pagesizes import letter, landscape',
    'from reportlab.lib import colors',
    'from reportlab.lib.styles import getSampleStyleSheet',
    '',
    `csv_path = r'''${csvPath}'''`,
    `out_path = r'''${outPath}'''`,
    '',
    'styles = getSampleStyleSheet()',
    'doc = SimpleDocTemplate(out_path, pagesize=landscape(letter), leftMargin=24, rightMargin=24, topMargin=24, bottomMargin=24)',
    'story = []',
    'story.append(Paragraph("CMLRE Merlin Seed Oceanography Table", styles["Title"]))',
    'story.append(Spacer(1, 12))',
    '',
    'fields = ["parameter","value","unit","latitude","longitude","depth","timestamp","source","quality_flag"]',
    'data = [fields]',
    'with open(csv_path, "r", encoding="utf-8") as f:',
    '    reader = csv.DictReader(f)',
    '    for i, row in enumerate(reader):',
    '        if i >= 25:',
    '            break',
    '        rec = []',
    '        for k in fields:',
    '            v = row.get(k, "")',
    '            if v is None:',
    '                v = ""',
    '            v = str(v)',
    '            if len(v) > 32:',
    '                v = v[:29] + "..."',
    '            rec.append(v)',
    '        data.append(rec)',
    '',
    '# Column widths tuned for landscape letter',
    'col_widths = [80, 55, 70, 65, 70, 45, 130, 90, 75]',
    't = Table(data, colWidths=col_widths, repeatRows=1)',
    't.setStyle(TableStyle([',
    '    ("BACKGROUND", (0,0), (-1,0), colors.lightgrey),',
    '    ("TEXTCOLOR", (0,0), (-1,0), colors.black),',
    '    ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),',
    '    ("FONTSIZE", (0,0), (-1,-1), 8),',
    '    ("ALIGN", (0,0), (-1,0), "CENTER"),',
    '    ("GRID", (0,0), (-1,-1), 0.25, colors.grey),',
    '    ("VALIGN", (0,0), (-1,-1), "MIDDLE"),',
    ']))',
    'story.append(t)',
    'doc.build(story)',
    'print("wrote", out_path)',
    '',
  ].join('\n'));

  const r = spawnSync(py, [script], { stdio: 'inherit' });
  if (r.status !== 0) {
    throw new Error('PDF table generation failed; ensure ai-services venv exists with reportlab installed.');
  }

  fs.unlinkSync(script);
}

async function generateNetCdf(outPath) {
  // Create a small NetCDF file via python netCDF4
  const { spawnSync } = require('child_process');
  const py = path.join(ROOT, 'ai-services', '.venv', 'Scripts', 'python.exe');
  const pipArgs = ['-m', 'pip'];

  const ensurePyImport = (importName, pipName) => {
    const check = spawnSync(py, ['-c', `import ${importName}`], { stdio: 'ignore' });
    if (check.status === 0) return;
    console.log(`Installing Python dependency into venv: ${pipName}...`);
    const install = spawnSync(py, [...pipArgs, 'install', pipName], { stdio: 'inherit' });
    if (install.status !== 0) {
      throw new Error(`Failed to install ${pipName} into ai-services venv`);
    }
  };

  ensurePyImport('numpy', 'numpy');
  ensurePyImport('netCDF4', 'netCDF4');
  const script = path.join(OUT_DIR, '_tmp_make_nc.py');

  writeText(script, `import netCDF4\nimport numpy as np\n\nout_path = r'''${outPath}'''\n\nroot = netCDF4.Dataset(out_path, 'w', format='NETCDF4')\nroot.title = 'CMLRE Merlin Seed NetCDF'\nroot.institution = 'CMLRE'\nroot.source = 'seed generator'\nroot.history = 'created for upload tests'\nroot.Conventions = 'CF-1.8'\n\nroot.createDimension('time', 3)\nroot.createDimension('lat', 4)\nroot.createDimension('lon', 5)\n\ntime = root.createVariable('time', 'f8', ('time',))\nlat = root.createVariable('lat', 'f4', ('lat',))\nlon = root.createVariable('lon', 'f4', ('lon',))\n\ntime.units = 'days since 2024-01-01 00:00:00'\nlat.units = 'degrees_north'\nlon.units = 'degrees_east'\n\ntime[:] = np.array([0, 1, 2], dtype='float64')\nlat[:] = np.array([8, 10, 12, 14], dtype='float32')\nlon[:] = np.array([70, 72, 74, 76, 78], dtype='float32')\n\nsst = root.createVariable('analysed_sst', 'f4', ('time','lat','lon'), zlib=True)\nsst.units = 'degree_C'\nsst.standard_name = 'sea_surface_temperature'\n\ndata = 26 + np.random.rand(3,4,5).astype('float32') * 4\nsst[:] = data\n\nroot.close()\nprint('wrote', out_path)\n`);

  const r = spawnSync(py, [script], { stdio: 'inherit' });
  if (r.status !== 0) {
    throw new Error('NetCDF generation failed; ensure ai-services venv exists with netCDF4 installed.');
  }

  fs.unlinkSync(script);
}

async function generateZip(zipPath, files) {
  const archiver = requireFromBackend('archiver');
  ensureDir(path.dirname(zipPath));
  const output = fs.createWriteStream(zipPath);
  const archive = archiver('zip', { zlib: { level: 9 } });

  return new Promise((resolve, reject) => {
    output.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(output);

    for (const f of files) {
      archive.file(f.fullPath, { name: f.nameInZip });
    }

    archive.finalize();
  });
}

async function main() {
  ensureDir(OUT_DIR);

  // Species
  const species = buildSpeciesRecords();
  writeJson(path.join(OUT_DIR, 'species.seed.json'), species);
  writeText(path.join(OUT_DIR, 'species.seed.csv'), toCsv(species));

  // Oceanography
  const ocean = buildOceanographyRecords();
  writeJson(path.join(OUT_DIR, 'oceanography.seed.json'), ocean);
  writeText(path.join(OUT_DIR, 'oceanography.seed.csv'), toCsv(ocean));

  // Fisheries
  const catchRecords = buildFisheriesCatchRecords();
  const lengthRecords = buildFisheriesLengthRecords();
  writeJson(path.join(OUT_DIR, 'fisheries.catch.seed.json'), catchRecords);
  writeText(path.join(OUT_DIR, 'fisheries.catch.seed.csv'), toCsv(catchRecords));
  writeJson(path.join(OUT_DIR, 'fisheries.length.seed.json'), lengthRecords);
  writeText(path.join(OUT_DIR, 'fisheries.length.seed.csv'), toCsv(lengthRecords));

  // eDNA
  const edna = buildEdnaTabularRecords();
  writeJson(path.join(OUT_DIR, 'edna.seed.json'), edna);
  writeText(path.join(OUT_DIR, 'edna.seed.csv'), toCsv(edna));
  writeText(path.join(OUT_DIR, 'edna.seed.fasta'), buildFasta());
  writeText(path.join(OUT_DIR, 'edna.seed.fastq'), buildFastq());

  // GeoJSON
  const geojson = buildGeoJson();
  writeJson(path.join(OUT_DIR, 'ocean_points.seed.geojson'), geojson);

  // PDF + NetCDF via python venv
  const pdfPath = path.join(OUT_DIR, 'seed_report.pdf');
  const pdfTablePath = path.join(OUT_DIR, 'oceanography_table.seed.pdf');
  const ncPath = path.join(OUT_DIR, 'seed_ocean_grid.nc');
  await generatePdf(pdfPath);
  await generatePdfTable(pdfTablePath, path.join(OUT_DIR, 'oceanography.seed.csv'));
  await generateNetCdf(ncPath);

  // Excel versions (XLSX)
  const xlsx = requireFromBackend('xlsx');
  const wb1 = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb1, xlsx.utils.json_to_sheet(species), 'species');
  xlsx.writeFile(wb1, path.join(OUT_DIR, 'species.seed.xlsx'));

  const wb2 = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb2, xlsx.utils.json_to_sheet(ocean.slice(0, 5000)), 'oceanography');
  xlsx.writeFile(wb2, path.join(OUT_DIR, 'oceanography.seed.xlsx'));

  // ZIP bundle
  await generateZip(path.join(OUT_DIR, 'bundle_mixed.seed.zip'), [
    { fullPath: path.join(OUT_DIR, 'species.seed.csv'), nameInZip: 'species/species.seed.csv' },
    { fullPath: path.join(OUT_DIR, 'oceanography.seed.csv'), nameInZip: 'ocean/oceanography.seed.csv' },
    { fullPath: path.join(OUT_DIR, 'ocean_points.seed.geojson'), nameInZip: 'gis/ocean_points.seed.geojson' },
    { fullPath: path.join(OUT_DIR, 'seed_report.pdf'), nameInZip: 'reports/seed_report.pdf' },
    { fullPath: path.join(OUT_DIR, 'oceanography_table.seed.pdf'), nameInZip: 'reports/oceanography_table.seed.pdf' },
    { fullPath: path.join(OUT_DIR, 'seed_ocean_grid.nc'), nameInZip: 'ocean/seed_ocean_grid.nc' },
    { fullPath: path.join(OUT_DIR, 'fisheries.catch.seed.csv'), nameInZip: 'fisheries/fisheries.catch.seed.csv' },
    { fullPath: path.join(OUT_DIR, 'edna.seed.fasta'), nameInZip: 'edna/edna.seed.fasta' },
  ]);

  console.log('Seed samples written to:', OUT_DIR);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
