// Stock Hotel — bulk upload script
// Run from project root: node stock-upload/upload.js
// Requires Node 18+ (native fetch)

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL  = 'https://spjhqriqozgybdimcjea.supabase.co';
const SUPABASE_KEY  = process.argv[2]; // pass service_role key as first argument
if (!SUPABASE_KEY) {
  console.error('Usage: node stock-upload/upload.js <service_role_key>');
  process.exit(1);
}
const BUCKET       = 'vitrina-images';
const FOTOS_DIR    = path.join(__dirname, 'fotos');

const HEADERS = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
};

// Parse filename: "2bowlceramicapancasero-cocina.jpeg"
// → { quantity: 2, name: "Bowl cerámica pan casero", location: "cocina", filename: "2bowlceramicapancasero-cocina.jpeg" }
const NAME_MAP = {
  bolamantequilla:     'Bola de mantequilla',
  cafetera:            'Cafetera',
  cafeteradestilada:   'Cafetera destilada',
  caldera:             'Caldera',
  coladorgrande:       'Colador grande',
  coladorpeque:        'Colador pequeño',
  cucharillabarra:     'Cucharilla de barra',
  cucharon:            'Cucharón',
  cucharones:          'Cucharones',
  dispensador:         'Dispensador',
  espatula:            'Espátula',
  exprimidorlimon:     'Exprimidor de limón',
  frutero:             'Frutero',
  gramera:             'Gramera',
  licuadora:           'Licuadora',
  portacubiertos:      'Porta cubiertos',
  portapanmolde:       'Porta pan molde',
  quemador:            'Quemador',
  shaker:              'Shaker',
  bowlceramicapancasero: 'Bowl cerámica pan casero',
};

function parseFilename(filename) {
  const base = filename.replace('.jpeg', '');
  const match = base.match(/^(\d+)(.+)-(.+)$/);
  if (!match) return null;
  const [, qty, rawName, location] = match;
  return {
    quantity: parseInt(qty),
    name: NAME_MAP[rawName] ?? rawName,
    location,
    filename,
  };
}

async function uploadImage(filename) {
  const filePath = path.join(FOTOS_DIR, filename);
  const buffer = fs.readFileSync(filePath);
  const storagePath = filename; // store as-is in the bucket

  const res = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${storagePath}`,
    {
      method: 'POST',
      headers: {
        ...HEADERS,
        'Content-Type': 'image/jpeg',
        'x-upsert': 'true',
      },
      body: buffer,
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Storage upload failed for ${filename}: ${err}`);
  }
  return storagePath;
}

async function insertProduct(product) {
  const body = {
    name:            product.name,
    price:           0,
    quantity:        product.quantity,
    image_filename:  product.filename,
    location:        product.location,
    expiration_date: null,
    expiry_notes:    null,
  };

  const res = await fetch(`${SUPABASE_URL}/rest/v1/vitrina_products`, {
    method: 'POST',
    headers: {
      ...HEADERS,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`DB insert failed for ${product.name}: ${err}`);
  }
}

async function main() {
  const files = fs.readdirSync(FOTOS_DIR).filter(f => f.endsWith('.jpeg'));
  console.log(`Found ${files.length} photos\n`);

  for (const filename of files) {
    const product = parseFilename(filename);
    if (!product) {
      console.warn(`  ⚠ Skipping (bad format): ${filename}`);
      continue;
    }

    process.stdout.write(`  Uploading ${filename}...`);
    try {
      await uploadImage(filename);
      await insertProduct(product);
      console.log(` ✓  [qty:${product.quantity}] "${product.name}" → ${product.location}`);
    } catch (err) {
      console.log(` ✗`);
      console.error(`     ${err.message}`);
    }
  }

  console.log('\nDone!');
}

main();
