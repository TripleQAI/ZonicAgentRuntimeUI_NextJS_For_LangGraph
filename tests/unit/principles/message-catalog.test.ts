// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import en from '@messages/en.json';

const sources = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'generated' ? [] : sources(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });

const files = sources(path.resolve('src'));
const text = files.map((file) => fs.readFileSync(file, 'utf8')).join('\n');

/** Attributes whose value a user reads or hears. */
const TEXT_ATTRIBUTES = new Set(['aria-label', 'title', 'placeholder', 'alt', 'label', 'aria-placeholder']);
/** Words that are not translated (none: the brand's name and wordmark are in the catalog too). */
const ALLOWED = new Set<string>();

/** JSX text and text attributes written as literals instead of `t()` (design rule 6). */
function literalText(file: string): string[] {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node)) {
      const value = node.text.trim();
      if (/[A-Za-z]{2,}/.test(value) && !ALLOWED.has(value)) found.push(value);
    }
    if (ts.isJsxAttribute(node) && node.initializer && ts.isStringLiteral(node.initializer)) {
      const name = node.name.getText(source);
      const value = node.initializer.text;
      if (TEXT_ATTRIBUTES.has(name) && /[A-Za-z]{2,}/.test(value) && !ALLOWED.has(value)) found.push(`${name}="${value}"`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found.map((item) => `${path.relative(process.cwd(), file)}: ${item}`);
}

describe('message catalog', () => {
  it('[U-12] no component writes user-facing text as a literal; it comes from messages/en.json', () => {
    expect(files.filter((file) => file.endsWith('.tsx')).flatMap(literalText)).toEqual([]);
  });

  it('every catalog key is used (the type check rejects a key the catalog does not have)', () => {
    const named = new Set([...text.matchAll(/'([a-z]+(?:\.[A-Za-z]+)+)'/g)].map((match) => match[1]!));
    // `apiError.<CODE>` keys are looked up by the error's code (src/lib/errors.ts).
    const unused = Object.keys(en).filter((key) => !key.startsWith('apiError.') && !named.has(key));
    expect(unused).toEqual([]);
  });

  it('every message is non-empty and its placeholders are well formed', () => {
    for (const [key, message] of Object.entries(en)) {
      expect(message.trim(), key).not.toBe('');
      expect(message.replace(/\{\w+\}/g, ''), key).not.toMatch(/[{}]/);
    }
  });
});
