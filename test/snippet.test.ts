import { describe, expect, it } from 'bun:test';
import { generateSnippet } from '../src/snippet';

describe('generateSnippet', () => {
  it('embeds the given URL into a fetch() call to /log', () => {
    const snippet = generateSnippet('http://localhost:54321');
    expect(snippet).toContain('http://localhost:54321/log');
    expect(snippet).toContain('fetch(');
  });

  it('includes the LABEL_HERE and YOUR_DATA placeholders', () => {
    const snippet = generateSnippet('http://localhost:1');
    expect(snippet).toContain('LABEL_HERE');
    expect(snippet).toContain('YOUR_DATA');
  });

  it('uses POST with application/json content type', () => {
    const snippet = generateSnippet('http://localhost:1');
    expect(snippet).toContain('"POST"');
    expect(snippet).toContain('"Content-Type": "application/json"');
  });

  it('produces syntactically valid JavaScript', () => {
    const snippet = generateSnippet('http://localhost:1');
    // Wrap in a no-op function so the placeholders don't trip the parser.
    const wrapped = `function _check(LABEL_HERE, YOUR_DATA) { return ${snippet}; }`;
    expect(() => new Function(wrapped)).not.toThrow();
  });
});
