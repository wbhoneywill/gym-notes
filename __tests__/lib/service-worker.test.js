import { readFile } from 'node:fs/promises';

describe('offline recorder service worker', () => {
  let source;
  beforeAll(async () => {
    source = await readFile(new URL('../../public/sw.js', import.meta.url), 'utf8');
  });

  it('never caches API responses', () => {
    expect(source).toContain("url.pathname.startsWith('/api/')");
    expect(source).toContain("!url.pathname.startsWith('/api/')");
  });

  it('caches only the training navigation shell', () => {
    expect(source).toContain("/^\\/train(?:\\/[^/]+)?$/");
    expect(source).toContain("CACHE_TRAINING_ROUTE");
    expect(source).toContain("/train/offline");
    expect(source).toContain("/^\\/train\\/[^/]+$/");
  });

  it('prepares already-loaded executable assets for the first cold launch', () => {
    expect(source).toContain('CACHE_LOADED_ASSETS');
    expect(source).toContain("url.pathname.includes('/npm/@clerk/')");
  });
});
