import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import os from 'os';
import type { Provider } from './types.js';

const CONFIG_PATH = path.join(os.homedir(), '.cswap.json');

interface CswapProvider {
  name: string;
  env: Record<string, string>;
  model?: string;
  extra?: Record<string, unknown>;
}

interface CswapConfig {
  providers: CswapProvider[];
}

function emptyConfig(): CswapConfig {
  return { providers: [] };
}

export async function loadConfig(): Promise<CswapConfig> {
  if (!existsSync(CONFIG_PATH)) {
    return emptyConfig();
  }

  const content = await readFile(CONFIG_PATH, 'utf-8');
  try {
    return JSON.parse(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid cswap config at ${CONFIG_PATH}: ${message}`);
  }
}

export async function saveConfig(config: CswapConfig): Promise<void> {
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

export function configToProviders(config: CswapConfig): Provider[] {
  return config.providers.map((p, i) => ({
    id: 10000 + i,
    name: p.name,
    displayName: p.name,
    envVars: { ...p.env },
    settingsConfig: {
      env: { ...p.env },
      ...(p.model ? { model: p.model } : {}),
      ...(p.extra || {}),
    },
  }));
}

export async function addProvider(
  name: string,
  env: Record<string, string>,
  model?: string
): Promise<void> {
  const config = await loadConfig();

  const existing = config.providers.findIndex(
    (p) => p.name.toLowerCase() === name.toLowerCase()
  );
  const entry: CswapProvider = { name, env };
  if (model) entry.model = model;

  if (existing >= 0) {
    config.providers[existing] = entry;
  } else {
    config.providers.push(entry);
  }

  await saveConfig(config);
}

export async function removeProvider(name: string): Promise<boolean> {
  const config = await loadConfig();
  const index = config.providers.findIndex(
    (p) => p.name.toLowerCase() === name.toLowerCase()
  );
  if (index < 0) return false;

  config.providers.splice(index, 1);
  await saveConfig(config);
  return true;
}

export async function importFromCcSwitch(providers: Provider[]): Promise<number> {
  const config = await loadConfig();
  const existingNames = new Set(
    config.providers.map((p) => p.name.toLowerCase())
  );

  let imported = 0;
  for (const p of providers) {
    if (existingNames.has(p.name.toLowerCase())) continue;

    const { env, ...rest } = p.settingsConfig as {
      env?: Record<string, string>;
      [key: string]: unknown;
    };
    const extra: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rest)) {
      if (k !== 'env' && k !== 'model') extra[k] = v;
    }

    const entry: CswapProvider = {
      name: p.name,
      env: { ...p.envVars },
    };
    const modelVal = (p.settingsConfig as Record<string, unknown>).model;
    if (typeof modelVal === 'string') entry.model = modelVal;
    if (Object.keys(extra).length > 0) entry.extra = extra;

    config.providers.push(entry);
    imported++;
  }

  if (imported > 0) await saveConfig(config);
  return imported;
}

export function getConfigPath(): string {
  return CONFIG_PATH;
}
