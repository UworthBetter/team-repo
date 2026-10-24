import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const fixtures = [];
afterEach(() => fixtures.splice(0).forEach((dir) => {
  if (!dir.startsWith(join(tmpdir(), 'sizzle-scaffold-'))) throw new Error('Unexpected fixture path');
  rmSync(dir, { recursive: true, force: true });
}));

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'sizzle-scaffold-'));
  fixtures.push(dir);
  for (const path of ['scripts', 'content/kitchens', 'content/dishes', 'content/equipment']) mkdirSync(join(dir, path), { recursive: true });
  copyFileSync(new URL('../scripts/new-kitchen.mjs', import.meta.url), join(dir, 'scripts/new-kitchen.mjs'));
  writeFileSync(join(dir, 'content/route.json'), '{"nodes":[]}');
  const run = (...args) => execFileSync(process.execPath, [join(dir, 'scripts/new-kitchen.mjs'), ...args], { stdio: 'pipe' });
  return { dir, run };
}

describe('kitchen scaffold', () => {
  it('rejects a late destination collision before writing any other file', () => {
    const f = fixture();
    writeFileSync(join(f.dir, 'content/equipment/sample_key.json'), 'existing');
    expect(() => f.run('sample')).toThrow();
    expect(existsSync(join(f.dir, 'content/kitchens/sample.json'))).toBe(false);
    expect(existsSync(join(f.dir, 'content/dishes/sample_dish.json'))).toBe(false);
    expect(readFileSync(join(f.dir, 'content/route.json'), 'utf8')).toBe('{"nodes":[]}');
  });

  it('creates a complete kitchen and refuses to overwrite it', () => {
    const f = fixture();
    f.run('sample', '--name', '测试厨房');
    const kitchen = JSON.parse(readFileSync(join(f.dir, 'content/kitchens/sample.json'), 'utf8'));
    expect(kitchen.name).toBe('测试厨房');
    expect(existsSync(join(f.dir, 'content/dishes/sample_dish.json'))).toBe(true);
    expect(existsSync(join(f.dir, 'content/equipment/sample_key.json'))).toBe(true);
    expect(JSON.parse(readFileSync(join(f.dir, 'content/route.json'), 'utf8')).nodes).toHaveLength(1);
    expect(() => f.run('sample')).toThrow();
  });
});
