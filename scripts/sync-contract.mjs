/**
 * npm run sync:contract — vendors the LangGraph runtime's contract into contract/ (lever L12):
 *   - contract/schemas/: the models listed in api-models.json and every model they reference, taken
 *     from the runtime's generated/openapi.json components, or from generated/schemas/<group>/ for
 *     models the API does not name (the interrupt answers);
 *   - contract/openapi.json: the runtime's generated/openapi.json;
 *   - contract/SOURCE.json: the runtime commit ("-dirty" when its generated/ has uncommitted
 *     changes) and a SHA-256 per file.
 * Then npm run gen:api regenerates the types. CI reads only contract/, so it needs no access to the
 * private runtime repository; every contract change arrives as a reviewed diff.
 *
 * RUNTIME_SERVER_DIR points at the runtime repository (default: ../ZonicAgentRuntimeBackend_Python_LangGraph).
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const serverDir = path.resolve(root, process.env.RUNTIME_SERVER_DIR ?? '../ZonicAgentRuntimeBackend_Python_LangGraph');
const generatedDir = path.join(serverDir, 'generated');
const openapiFile = path.join(generatedDir, 'openapi.json');
const contractDir = path.join(root, 'contract');

if (!fs.existsSync(openapiFile)) {
  console.error(`No runtime contract at ${openapiFile}; run uv run python -m scripts.gen in the runtime repository.`);
  process.exit(1);
}

const openapiText = fs.readFileSync(openapiFile, 'utf8');
const published = { ...JSON.parse(openapiText).components.schemas };
// generated/schemas/index.json lists the standalone schemas by group: <group>/<Name>.schema.json.
const index = JSON.parse(fs.readFileSync(path.join(generatedDir, 'schemas', 'index.json'), 'utf8'));
for (const [group, names] of Object.entries(index))
  for (const name of names)
    published[name] ??= JSON.parse(
      fs.readFileSync(path.join(generatedDir, 'schemas', group, `${name}.schema.json`), 'utf8'),
    );

const { models } = JSON.parse(fs.readFileSync(path.join(root, 'api-models.json'), 'utf8'));
const wanted = new Set();
const visit = (name) => {
  if (wanted.has(name)) return;
  if (!published[name]) throw new Error(`api-models.json names ${name}, which the runtime does not publish`);
  wanted.add(name);
  JSON.stringify(published[name]).replace(/#\/components\/schemas\/(\w+)/g, (_, ref) => (visit(ref), ''));
};
models.forEach(visit);

const files = {};
const write = (relative, text) => {
  const normalized = text.replace(/\r\n/g, '\n');
  fs.mkdirSync(path.dirname(path.join(contractDir, relative)), { recursive: true });
  fs.writeFileSync(path.join(contractDir, relative), normalized);
  files[relative] = createHash('sha256').update(normalized).digest('hex');
};

fs.rmSync(path.join(contractDir, 'schemas'), { recursive: true, force: true });
for (const name of [...wanted].sort())
  write(`schemas/${name}.json`, `${JSON.stringify({ title: name, ...published[name] }, null, 2)}\n`);
write('openapi.json', openapiText);

const git = (...args) => execFileSync('git', ['-C', serverDir, ...args], { encoding: 'utf8' }).trim();
const dirty = git('status', '--porcelain', '--', 'generated') !== '';
const commit = `${git('rev-parse', '--short', 'HEAD')}${dirty ? '-dirty' : ''}`;
fs.writeFileSync(
  path.join(contractDir, 'SOURCE.json'),
  `${JSON.stringify({ server: 'ZonicAgentRuntimeBackend_Python_LangGraph', commit, files }, null, 2)}\n`,
);
console.log(`Vendored ${wanted.size} models and openapi.json at ${commit}; next: npm run gen:api`);
