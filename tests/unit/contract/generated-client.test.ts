import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const contractDir = path.resolve('contract');
const run = (env: Record<string, string> = {}) =>
  execFileSync(process.execPath, ['scripts/gen-api.mjs', '--check'], {
    env: { ...process.env, ...env },
    stdio: 'pipe',
    encoding: 'utf8',
  });

const temp: string[] = [];
afterEach(() => temp.splice(0).forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));

describe('generated API client', () => {
  it('[U-14] the committed types match the vendored server contract', () => {
    expect(run()).toContain('up to date');
  });

  it('every vendored contract file matches the hash recorded by sync:contract', () => {
    const source = JSON.parse(fs.readFileSync(path.join(contractDir, 'SOURCE.json'), 'utf8')) as {
      files: Record<string, string>;
    };
    expect(Object.keys(source.files)).toContain('schemas/ErrorEnvelope.json');
    for (const [file, sha256] of Object.entries(source.files))
      expect(
        createHash('sha256')
          .update(fs.readFileSync(path.join(contractDir, file)))
          .digest('hex'),
        file,
      ).toBe(sha256);
  });

  it('[U-14] a contract change makes the drift check fail', () => {
    const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-contract-'));
    temp.push(copy);
    fs.cpSync(contractDir, copy, { recursive: true });
    const file = path.join(copy, 'schemas', 'ErrorBody.json');
    const schema = JSON.parse(fs.readFileSync(file, 'utf8'));
    schema.properties.code = { type: 'integer' };
    fs.writeFileSync(file, JSON.stringify(schema));
    expect(() => run({ CONTRACT_DIR: copy })).toThrow(/out of date/);
  });
});
