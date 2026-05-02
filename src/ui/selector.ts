import { spawnSync } from 'child_process';
import { writeFileSync, readFileSync, unlinkSync, mkdtempSync, rmdirSync } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import type { Provider, HistoryEntry } from '../types.js';

/**
 * Interactive provider selection.
 * Runs the selection UI in a child process so the main process
 * never touches stdin, keeping it clean for the subsequent Claude spawn.
 */
export function selectProvider(providers: Provider[], history: HistoryEntry[] = []): Provider {
  const tmpDir = mkdtempSync(join(tmpdir(), 'cswap-'));
  const dataFile = join(tmpDir, 'providers.json');
  const resultFile = join(tmpDir, 'result.json');

  // Build last-used map from history
  const lastUsed = new Map<string, number>();
  for (const entry of history) {
    lastUsed.set(entry.name, entry.timestamp);
  }

  writeFileSync(
    dataFile,
    JSON.stringify({
      providers: providers.map((p) => ({
        name: p.name,
        envVars: p.envVars,
        settingsConfig: p.settingsConfig,
        lastUsed: lastUsed.get(p.name) || null,
      })),
    })
  );

  // Resolve child-selector.js relative to this compiled file
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const childScript = join(__dirname, 'child-selector.js');

  try {
    const result = spawnSync(process.execPath, [childScript, dataFile, resultFile], {
      stdio: 'inherit',
    });

    if (result.status !== 0) {
      process.exit(result.status || 1);
    }

    const resultData = JSON.parse(readFileSync(resultFile, 'utf-8'));

    if (resultData.type === 'new') {
      const provider = resultData.provider as { name: string; env: Record<string, string> };
      return {
        id: 99999,
        name: provider.name,
        displayName: provider.name,
        envVars: { ...provider.env },
        settingsConfig: { env: { ...provider.env } },
      };
    }

    return providers[resultData.index];
  } finally {
    try {
      unlinkSync(dataFile);
      unlinkSync(resultFile);
      rmdirSync(tmpDir);
    } catch {
      // ignore
    }
  }
}
