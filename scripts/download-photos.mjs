import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const app = await readFile(path.join(root, 'src/App.jsx'), 'utf8');
const ids = [...new Set(app.match(/photo-\d{13,}/g) || [])];
const output = path.join(root, 'public', 'images', 'photos');
await mkdir(output, { recursive: true });

let downloaded = 0;
let reused = 0;
const failures = [];

async function download(id) {
  const destination = path.join(output, id + '.jpg');
  try {
    await access(destination);
    reused++;
    return;
  } catch {}

  const url = `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1600&q=82&fm=jpg`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const type = response.headers.get('content-type') || '';
      if (!type.includes('image/')) throw new Error(`Unexpected content type: ${type}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length < 5000) throw new Error('Image response was unexpectedly small');
      await writeFile(destination, bytes);
      downloaded++;
      return;
    } catch (error) {
      if (attempt === 3) failures.push(`${id}: ${error.message}`);
      else await new Promise(resolve => setTimeout(resolve, attempt * 1000));
    }
  }
}

console.log(`Preparing ${ids.length} unique destination photos…`);
for (let i = 0; i < ids.length; i += 5) {
  await Promise.all(ids.slice(i, i + 5).map(download));
}
console.log(`Photos ready. Downloaded: ${downloaded}; already present: ${reused}; total referenced: ${ids.length}.`);
if (failures.length) {
  console.error('Could not download these photos:\\n' + failures.join('\\n'));
  process.exitCode = 1;
}
