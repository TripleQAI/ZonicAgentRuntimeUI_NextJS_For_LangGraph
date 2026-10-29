// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const root = path.resolve('.');
const runtimeFile = path.join(root, 'src/lib/api/runtime.ts');
const schemaFile = path.join(root, 'src/lib/api/generated/schema.d.ts');
const modelsFile = path.join(root, 'src/lib/api/generated/models.ts');
/** The modules typed by the contract: the API calls, the event and part unions, the run store, the timeline. */
const checked = ['src/lib/api/runtime.ts', 'src/lib/api/types.ts', 'src/store/run.ts', 'src/lib/timeline.ts'].map((file) =>
  path.join(root, file),
);
const sourceDir = path.join(root, 'src');

/** Type-checks the API modules with one generated file's text replaced, as after a contract change. */
function diagnostics(file: string, edit: (text: string) => string = (text) => text): string[] {
  const config = ts.parseJsonConfigFileContent(
    ts.readConfigFile(path.join(root, 'tsconfig.json'), ts.sys.readFile).config,
    ts.sys,
    root,
  );
  const host = ts.createCompilerHost(config.options);
  const readFile = host.readFile.bind(host);
  host.readFile = (name) => {
    const text = readFile(name);
    return text !== undefined && path.resolve(name) === file ? edit(text) : text;
  };
  const program = ts.createProgram(checked, { ...config.options, noEmit: true, incremental: false }, host);
  return ts
    .getPreEmitDiagnostics(program)
    .filter((item) => item.file && path.resolve(item.file.fileName).startsWith(sourceDir) && !item.file.fileName.includes('generated'))
    .map((item) => ts.flattenDiagnosticMessageText(item.messageText, '\n'));
}

describe('generated API client drift', () => {
  it('[U-14] the API modules type-check against the vendored contract', () => {
    expect(diagnostics(schemaFile)).toEqual([]);
  });

  it('[U-14] a path the server renamed fails the type check', () => {
    const errors = diagnostics(schemaFile, (text) =>
      text.replace('"/v1/sessions/{sessionId}/messages": {', '"/v1/sessions/{sessionId}/history": {'),
    );
    expect(errors.join('\n')).toMatch(/\/v1\/sessions\/\{sessionId\}\/messages/);
  });

  it('[U-14] a changed event model fails the type check', () => {
    const errors = diagnostics(modelsFile, (text) =>
      text.replace(/export interface TextDeltaData \{[^}]*\}/, 'export interface TextDeltaData {\n  chunk: string;\n}'),
    );
    expect(errors.length).toBeGreaterThan(0);
  });

  it('every API path the UI calls is in the vendored OpenAPI document', () => {
    const openapi = JSON.parse(fs.readFileSync(path.join(root, 'contract/openapi.json'), 'utf8')) as {
      paths: Record<string, unknown>;
    };
    const source = fs.readFileSync(runtimeFile, 'utf8');
    const used = [...source.matchAll(/:\s*'(\/v1\/[^']+)'/g)].map((match) => match[1]!);
    expect(used.length).toBeGreaterThan(10);
    expect(used.filter((item) => !(item in openapi.paths))).toEqual([]);
  });
});
