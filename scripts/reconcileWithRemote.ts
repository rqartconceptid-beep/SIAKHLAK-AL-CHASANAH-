import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const LOCAL_DIR = process.cwd();
const REMOTE_DIR = 'C:/Users/manue/.gemini/antigravity/brain/8913bb96-d939-4657-ade8-4e82a632410a/scratch/remote_siakhlak';

const IGNORE_PATTERNS = [
  'node_modules',
  'dist',
  '.git',
  'firebase-debug.log',
  'firestore-debug.log',
  '.DS_Store'
];

function shouldIgnore(relPath: string): boolean {
  const normalized = relPath.replace(/\\/g, '/');
  return IGNORE_PATTERNS.some(pat => normalized === pat || normalized.startsWith(pat + '/'));
}

function getFileHash(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

function walkDir(dir: string, baseDir: string = dir): string[] {
  let results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    const relPath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
    if (shouldIgnore(relPath)) continue;
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      results = results.concat(walkDir(fullPath, baseDir));
    } else {
      results.push(relPath);
    }
  }
  return results;
}

async function main() {
  console.log('================================================================');
  console.log('SIAKHLAK — GITHUB RECONCILIATION ENGINE');
  console.log('================================================================');
  console.log('Local Workspace :', LOCAL_DIR);
  console.log('Remote Workspace:', REMOTE_DIR);

  const localFiles = walkDir(LOCAL_DIR);
  const remoteFiles = walkDir(REMOTE_DIR);

  const localSet = new Set(localFiles);
  const remoteSet = new Set(remoteFiles);

  const onlyLocal: string[] = [];
  const onlyRemote: string[] = [];
  const modified: string[] = [];
  const unchanged: string[] = [];

  for (const file of localFiles) {
    if (!remoteSet.has(file)) {
      onlyLocal.push(file);
    } else {
      const localHash = getFileHash(path.join(LOCAL_DIR, file));
      const remoteHash = getFileHash(path.join(REMOTE_DIR, file));
      if (localHash !== remoteHash) {
        modified.push(file);
      } else {
        unchanged.push(file);
      }
    }
  }

  for (const file of remoteFiles) {
    if (!localSet.has(file)) {
      onlyRemote.push(file);
    }
  }

  console.log(`\n--- SUMMARY STATS ---`);
  console.log(`Total Local Files : ${localFiles.length}`);
  console.log(`Total Remote Files: ${remoteFiles.length}`);
  console.log(`Unchanged Files   : ${unchanged.length}`);
  console.log(`Modified Files    : ${modified.length}`);
  console.log(`Files Only Local  : ${onlyLocal.length}`);
  console.log(`Files Only Remote : ${onlyRemote.length}`);

  console.log(`\n--- MODIFIED FILES (${modified.length}) ---`);
  modified.sort().forEach(f => {
    const localSize = fs.statSync(path.join(LOCAL_DIR, f)).size;
    const remoteSize = fs.statSync(path.join(REMOTE_DIR, f)).size;
    console.log(`  [MODIFIED] ${f} (local: ${localSize} bytes, remote: ${remoteSize} bytes)`);
  });

  console.log(`\n--- ONLY LOCAL FILES (${onlyLocal.length}) ---`);
  onlyLocal.sort().forEach(f => console.log('  [LOCAL ONLY]', f));

  console.log(`\n--- ONLY REMOTE FILES (${onlyRemote.length}) ---`);
  onlyRemote.sort().forEach(f => console.log('  [REMOTE ONLY]', f));

  // Security scan for secrets in local files
  console.log(`\n--- SECURITY AUDIT SCAN ---`);
  const SECRET_PATTERNS = [
    { name: 'Private Key', regex: /-----BEGIN[ A-Z0-9_-]*PRIVATE KEY-----/i },
    { name: 'Hardcoded Secret Key', regex: /secret[_-]?key\s*[:=]\s*['"][a-zA-Z0-9_\-]{16,}['"]/i },
    { name: 'Hardcoded Bearer Token', regex: /Bearer\s+[a-zA-Z0-9_\-\.]{30,}/i }
  ];

  let potentialSecrets = 0;
  for (const file of localFiles) {
    // Skip binary files and test reports/fixtures
    if (file.endsWith('.docx') || file.endsWith('.png') || file.endsWith('.ico') || file.endsWith('.jpg') || file.endsWith('.log')) {
      continue;
    }
    const fullPath = path.join(LOCAL_DIR, file);
    const content = fs.readFileSync(fullPath, 'utf8');
    for (const sec of SECRET_PATTERNS) {
      if (sec.regex.test(content)) {
        console.log(`  [SECURITY NOTICE] Pattern "${sec.name}" matched in: ${file}`);
        potentialSecrets++;
      }
    }
  }
  console.log(`Total Security Findings: ${potentialSecrets}`);

  console.log('\n================================================================');
  console.log('RECONCILIATION DATA GENERATION COMPLETE');
  console.log('================================================================');
}

main().catch(console.error);
