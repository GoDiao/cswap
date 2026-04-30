import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const node = process.execPath;

function distUrl(file) {
  return pathToFileURL(path.join(root, 'dist', file)).href;
}

async function tempHome() {
  const dir = await mkdtemp(path.join(tmpdir(), 'cswap-test-'));
  return dir;
}

function testEnv(home) {
  return {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    CC_SWITCH_DB_PATH: path.join(home, 'missing-cc-switch.db'),
  };
}

test('cswap list handles no providers without crashing', async () => {
  const home = await tempHome();
  const result = spawnSync(node, [path.join(root, 'dist/index.js'), 'list'], {
    cwd: root,
    env: testEnv(home),
    encoding: 'utf-8',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /No providers found/i);
});

test('addProvider rejects malformed config without overwriting it', async () => {
  const home = await tempHome();
  const configPath = path.join(home, '.cswap.json');
  await writeFile(configPath, '{ bad json', 'utf-8');

  const script = `
    import { addProvider } from ${JSON.stringify(distUrl('config.js'))};
    await addProvider('new-provider', { ANTHROPIC_API_KEY: 'key' });
  `;
  const result = spawnSync(node, ['--input-type=module', '-e', script], {
    cwd: root,
    env: testEnv(home),
    encoding: 'utf-8',
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /Invalid cswap config/i);
  assert.equal(await readFile(configPath, 'utf-8'), '{ bad json');
});

test('provider settings filenames stay distinct for colliding readable slugs', async () => {
  const home = await tempHome();
  const script = `
    import { createProviderSettings } from ${JSON.stringify(distUrl('settings.js'))};
    const first = await createProviderSettings('a/b', { ANTHROPIC_BASE_URL: 'https://one.example' });
    const second = await createProviderSettings('a_b', { ANTHROPIC_BASE_URL: 'https://two.example' });
    console.log(JSON.stringify({ first, second }));
  `;
  const result = spawnSync(node, ['--input-type=module', '-e', script], {
    cwd: root,
    env: testEnv(home),
    encoding: 'utf-8',
  });

  assert.equal(result.status, 0, result.stderr);
  const { first, second } = JSON.parse(result.stdout.trim());
  assert.notEqual(first, second);
  assert.ok(existsSync(first));
  assert.ok(existsSync(second));
});

test('provider settings filenames work for names without ascii slug characters', async () => {
  const home = await tempHome();
  const script = `
    import { createProviderSettings } from ${JSON.stringify(distUrl('settings.js'))};
    const settingsPath = await createProviderSettings('中文', { ANTHROPIC_BASE_URL: 'https://example.com' });
    console.log(settingsPath);
  `;
  const result = spawnSync(node, ['--input-type=module', '-e', script], {
    cwd: root,
    env: testEnv(home),
    encoding: 'utf-8',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(path.basename(result.stdout.trim()), /^ccsc-\.settings\.json$/);
});

test('history loader ignores malformed rows', async () => {
  const home = await tempHome();
  await writeFile(
    path.join(home, '.ccsc-history'),
    ['not-a-timestamp\tbad', '1700000000000\tgood', 'missing-tab'].join('\n'),
    'utf-8'
  );

  const script = `
    import { loadHistory } from ${JSON.stringify(distUrl('history.js'))};
    console.log(JSON.stringify(await loadHistory()));
  `;
  const result = spawnSync(node, ['--input-type=module', '-e', script], {
    cwd: root,
    env: testEnv(home),
    encoding: 'utf-8',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), [
    { name: 'good', timestamp: 1700000000000 },
  ]);
});

test('selector module exposes quick-add results directly without CommonJS require fallback', async () => {
  const selector = await import('../dist/ui/selector.js');
  assert.equal(typeof selector.readQuickAddResult, 'undefined');
});
