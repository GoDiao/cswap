#!/usr/bin/env node

import { spawn } from 'child_process';
import { Command } from 'commander';
import { isDbAvailable, getProviders, getAllProviders } from './db.js';
import { loadHistory, saveToHistory, sortByHistory } from './history.js';
import { createProviderSettings, clearAllCcscSettings } from './settings.js';
import {
  addProvider,
  removeProvider,
  importFromCcSwitch,
  loadConfig,
  getConfigPath,
} from './config.js';
import { selectProvider } from './ui/selector.js';
import type { Provider } from './types.js';

const program = new Command();

program
  .name('cswap')
  .description('Cross-platform CLI for CC Switch provider selection')
  .version('1.0.0')
  .option('--clear', 'Clear all CCSC-generated settings files')
  .option('--cli <name>', 'Specify CLI tool to use (overrides CC_CLI_PATH env)')
  .option('--provider <name>', 'Skip interactive UI and use specified provider directly')
  .allowUnknownOption()
  .allowExcessArguments()
  .passThroughOptions()
  .action(async (options) => {
    try {
      if (options.clear) {
        const removed = await clearAllCcscSettings();
        if (removed > 0) {
          console.log(`✓ Cleared ${removed} CCSC settings file(s)`);
        } else {
          console.log('No CCSC settings files found');
        }
        process.exit(0);
      }

      const cliOverride = options.cli;
      const providerName = options.provider;
      const rawArgs = process.argv.slice(2).filter(
        (arg) =>
          arg !== '--clear' &&
          !arg.startsWith('--cli') &&
          arg !== cliOverride &&
          !arg.startsWith('--provider') &&
          arg !== providerName
      );
      await main(rawArgs, cliOverride, providerName);
    } catch (error) {
      console.error(
        'Error:',
        error instanceof Error ? error.message : String(error)
      );
      process.exit(1);
    }
  });

// --- Management commands ---

program
  .command('add')
  .description('Add a provider to cswap config')
  .argument('<name>', 'Provider name')
  .option('--env <pairs...>', 'Environment variables in KEY=VALUE format')
  .option('--json <data>', 'Full config as JSON string')
  .action(async (name: string, options: { env?: string[]; json?: string }) => {
    try {
      let env: Record<string, string> = {};
      let model: string | undefined;

      if (options.json) {
        const parsed = JSON.parse(options.json);
        env = parsed.env || {};
        model = parsed.model;
      } else if (options.env) {
        for (const pair of options.env) {
          const eqIndex = pair.indexOf('=');
          if (eqIndex < 0) {
            console.error(`Invalid format: "${pair}". Use KEY=VALUE`);
            process.exit(1);
          }
          env[pair.slice(0, eqIndex)] = pair.slice(eqIndex + 1);
        }
      }

      await addProvider(name, env, model);
      console.log(`✓ Provider "${name}" saved to ${getConfigPath()}`);
      process.exit(0);
    } catch (error) {
      console.error(
        'Error:',
        error instanceof Error ? error.message : String(error)
      );
      process.exit(1);
    }
  });

program
  .command('remove')
  .description('Remove a provider from cswap config')
  .argument('<name>', 'Provider name')
  .action(async (name: string) => {
    const removed = await removeProvider(name);
    if (removed) {
      console.log(`✓ Provider "${name}" removed`);
    } else {
      console.error(`Provider "${name}" not found in cswap config`);
      process.exit(1);
    }
    process.exit(0);
  });

program
  .command('list')
  .description('List all available providers')
  .action(async () => {
    const providers = await getAllProviders();
    const config = await loadConfig();
    const configNames = new Set(
      config.providers.map((p) => p.name.toLowerCase())
    );

    if (providers.length === 0) {
      console.log('No providers found.');
      console.log('Add a provider: cswap add <name> --env ANTHROPIC_API_KEY=xxx');
      console.log('Or install CC Switch and import: cswap import');
      process.exit(0);
    }

    // CJK-aware string width
    const strWidth = (s: string): number => {
      let w = 0;
      for (const ch of s) {
        const c = ch.codePointAt(0)!;
        if (
          (c >= 0x1100 && c <= 0x115f) || (c >= 0x2e80 && c <= 0x303e) ||
          (c >= 0x3040 && c <= 0x33bf) || (c >= 0x3400 && c <= 0x4dbf) ||
          (c >= 0x4e00 && c <= 0xa4cf) || (c >= 0xac00 && c <= 0xd7a3) ||
          (c >= 0xf900 && c <= 0xfaff) || (c >= 0xfe30 && c <= 0xfe6f) ||
          (c >= 0xff01 && c <= 0xff60) || (c >= 0xffe0 && c <= 0xffe6) ||
          (c >= 0x20000 && c <= 0x2fa1f)
        ) w += 2;
        else w += 1;
      }
      return w;
    };
    const pad = (s: string, w: number) => s + ' '.repeat(Math.max(0, w - strWidth(s)));

    const numW = String(providers.length).length;
    const nameW = Math.max(...providers.map((p) => strWidth(p.name)));
    // Fixed format: "│  NN  NAME  VV vars  │" → inner = numW + nameW + 14
    const innerW = numW + nameW + 14;
    const line = '─'.repeat(innerW);

    console.log('');
    console.log(`  \x1b[1m\x1b[36mcswap\x1b[0m\x1b[2m  ─  Providers\x1b[0m`);
    console.log('');
    console.log(`\x1b[2m  ┌${line}┐\x1b[0m`);

    providers.forEach((p, i) => {
      const num = `\x1b[1m\x1b[32m${String(i + 1).padStart(numW)}\x1b[0m`;
      const name = `\x1b[1m${pad(p.name, nameW)}\x1b[0m`;
      const envKeys = Object.keys(p.envVars).filter((k) => p.envVars[k]);
      const vars = `\x1b[2m${String(envKeys.length).padStart(2)} vars\x1b[0m`;
      console.log(`\x1b[2m  │\x1b[0m  ${num}  ${name}  ${vars}  \x1b[2m│\x1b[0m`);
    });

    console.log(`\x1b[2m  └${line}┘\x1b[0m`);

    console.log('');
    process.exit(0);
  });

program
  .command('import')
  .description('Import all providers from CC Switch into cswap config')
  .action(async () => {
    if (!isDbAvailable()) {
      console.error('CC Switch database not found.');
      process.exit(1);
    }
    const ccProviders = getProviders();
    const imported = await importFromCcSwitch(ccProviders);
    if (imported > 0) {
      console.log(`✓ Imported ${imported} provider(s) to ${getConfigPath()}`);
    } else {
      console.log('All providers already exist in cswap config');
    }
    process.exit(0);
  });

// --- Main ---

program.parse();

async function main(
  claudeArgs: string[],
  cliOverride?: string,
  providerName?: string
): Promise<void> {
  const providers = await getAllProviders();

  if (providers.length === 0) {
    console.error('No providers found.');
    console.error('Add a provider: cswap add <name> --env ANTHROPIC_API_KEY=xxx');
    console.error('Or install CC Switch and import: cswap import');
    process.exit(1);
  }

  let selectedProvider: Provider;

  if (providerName) {
    const found = providers.find(
      (p) => p.name.toLowerCase() === providerName.toLowerCase()
    );
    if (!found) {
      console.error(`Provider "${providerName}" not found.`);
      console.error(
        'Available providers: ' + providers.map((p) => p.name).join(', ')
      );
      process.exit(1);
    }
    selectedProvider = found;
  } else {
    const history = await loadHistory();
    const sortedProviders = sortByHistory(providers, history);
    selectedProvider = selectProvider(sortedProviders);

    if (selectedProvider.id === 99999) {
      await addProvider(selectedProvider.name, selectedProvider.envVars);
    }
  }

  await saveToHistory(selectedProvider.name);

  const settingsPath = await createProviderSettings(
    selectedProvider.name,
    selectedProvider.envVars,
    selectedProvider.settingsConfig
  );

  const finalArgs = [`--settings=${settingsPath}`, ...claudeArgs];

  console.log(`\x1b[1m🚀 Starting Claude with provider: ${selectedProvider.name}\x1b[0m`);

  const claudeBin = cliOverride || process.env.CC_CLI_PATH || 'claude';

  const child = spawn(claudeBin, finalArgs, {
    stdio: 'inherit',
  });

  child.on('error', (err) => {
    console.error(`Failed to start ${claudeBin}:`, err.message);
    console.error('Please ensure Claude CLI is installed and in your PATH.');
    console.error(
      'You can set CC_CLI_PATH environment variable or use --cli option to specify a custom CLI.'
    );
    process.exit(1);
  });

  // Remove all stdin listeners and pause to prevent cswap from competing
  // with the child process for keyboard input.
  process.stdin.removeAllListeners();
  process.stdin.pause();

  child.on('exit', (code) => {
    process.exit(code || 0);
  });
}
