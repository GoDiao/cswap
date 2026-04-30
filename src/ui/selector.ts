import { spawnSync } from 'child_process';
import { writeFileSync, readFileSync, unlinkSync, mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type { Provider } from '../types.js';

/**
 * Interactive provider selection.
 * Runs the selection UI in a child process so the main process
 * never touches stdin, keeping it clean for the subsequent Claude spawn.
 */
export function selectProvider(providers: Provider[]): Provider | null {
  const tmpDir = mkdtempSync(join(tmpdir(), 'cswap-'));
  const dataFile = join(tmpDir, 'providers.json');
  const resultFile = join(tmpDir, 'result.json');

  writeFileSync(
    dataFile,
    JSON.stringify(
      providers.map((p) => ({
        name: p.name,
        envVars: p.envVars,
        settingsConfig: p.settingsConfig,
      }))
    )
  );

  const script = `
    const fs = require('fs');
    const readline = require('readline');
    const data = JSON.parse(fs.readFileSync('${dataFile.replace(/\\/g, '\\\\')}', 'utf-8'));

    const R = '\\x1b[0m';
    const B = '\\x1b[1m';
    const D = '\\x1b[2m';
    const cyan = '\\x1b[36m';
    const green = '\\x1b[32m';
    const white = '\\x1b[37m';
    const red = '\\x1b[31m';
    const yellow = '\\x1b[33m';

    function strWidth(s) {
      let w = 0;
      for (const ch of s) {
        const c = ch.codePointAt(0);
        if (
          (c >= 0x1100 && c <= 0x115f) || (c >= 0x2e80 && c <= 0x303e) ||
          (c >= 0x3040 && c <= 0x33bf) || (c >= 0x3400 && c <= 0x4dbf) ||
          (c >= 0x4e00 && c <= 0xa4cf) || (c >= 0xac00 && c <= 0xd7a3) ||
          (c >= 0xf900 && c <= 0xfaff) || (c >= 0xfe30 && c <= 0xfe6f) ||
          (c >= 0xff01 && c <= 0xff60) || (c >= 0xffe0 && c <= 0xffe6) ||
          (c >= 0x20000 && c <= 0x2fa1f)
        ) w += 2; else w += 1;
      }
      return w;
    }

    function pad(s, width) {
      return s + ' '.repeat(Math.max(0, width - strWidth(s)));
    }

    const numW = String(data.length).length;
    const nameW = Math.max(...data.map(p => strWidth(p.name)), 12);
    const innerW = numW + nameW + 14;
    const line = '─'.repeat(innerW);

    function renderList() {
      console.log('');
      console.log('  ' + B + cyan + 'cswap' + R + D + '  ─  Claude Code Provider Switcher' + R);
      console.log('');
      console.log(D + '  ┌' + line + '┐' + R);

      data.forEach((p, i) => {
        const num = B + green + String(i + 1).padStart(numW) + R;
        const name = B + white + pad(p.name, nameW) + R;
        const envKeys = Object.keys(p.envVars).filter(k => p.envVars[k]);
        const vars = D + String(envKeys.length).padStart(2) + ' vars' + R;
        console.log(D + '  │' + R + '  ' + num + '  ' + name + '  ' + vars + '  ' + D + '│' + R);
      });

      // Add new provider option
      const plus = B + yellow + '+'.padStart(numW) + R;
      const label = B + yellow + pad('Quick add', nameW) + R;
      console.log(D + '  │' + R + '  ' + plus + '  ' + label + '  ' + D + '        │' + R);

      console.log(D + '  └' + line + '┘' + R);
      console.log('');
      console.log(D + '  Type number or name to select  ·  + to add  ·  q to quit' + R);
      console.log('');
    }

    function quickAdd(rl, callback) {
      console.log('');
      console.log('  ' + B + yellow + '＋ Quick Add Provider' + R);
      console.log('');

      rl.question('  ' + D + 'Name' + R + '     ', (name) => {
        name = name.trim();
        if (!name) { console.log('  ' + red + 'Cancelled' + R); callback(null); return; }

        rl.question('  ' + D + 'URL' + R + '      ', (url) => {
          url = url.trim();
          if (!url) { console.log('  ' + red + 'Cancelled' + R); callback(null); return; }

          rl.question('  ' + D + 'Key' + R + '      ', (key) => {
            key = key.trim();
            if (!key) { console.log('  ' + red + 'Cancelled' + R); callback(null); return; }

            rl.question('  ' + D + 'Model' + R + '    ', (model) => {
              model = model.trim();
              if (!model) { console.log('  ' + red + 'Cancelled' + R); callback(null); return; }

              console.log(D + '            Leave blank to use the same model for all roles' + R);

              rl.question('  ' + D + 'Sonnet' + R + '   ', (sonnet) => {
                sonnet = sonnet.trim() || model;

                rl.question('  ' + D + 'Opus' + R + '     ', (opus) => {
                  opus = opus.trim() || model;

                  rl.question('  ' + D + 'Haiku' + R + '    ', (haiku) => {
                    haiku = haiku.trim() || model;

                    rl.question('  ' + D + 'Reason' + R + '   ', (reason) => {
                      reason = reason.trim() || model;

                      const provider = {
                        name: name,
                        env: {
                          ANTHROPIC_AUTH_TOKEN: key,
                          ANTHROPIC_BASE_URL: url,
                          ANTHROPIC_MODEL: model,
                          ANTHROPIC_DEFAULT_SONNET_MODEL: sonnet,
                          ANTHROPIC_DEFAULT_OPUS_MODEL: opus,
                          ANTHROPIC_DEFAULT_HAIKU_MODEL: haiku,
                          ANTHROPIC_REASONING_MODEL: reason,
                        }
                      };

                      fs.writeFileSync('${resultFile.replace(/\\/g, '\\\\')}', JSON.stringify({
                        type: 'new',
                        provider: provider
                      }));

                      console.log('');
                      console.log('  ' + B + green + '✓' + R + ' ' + B + name + R + ' ' + D + 'added' + R);
                      console.log('');
                      callback(provider);
                    });
                  });
                });
              });
            });
          });
        });
      });
    }

    renderList();

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    function prompt() {
      rl.question('  ' + B + cyan + '❯' + R + ' ', (answer) => {
        const input = answer.trim();

        if (input === 'q' || input === 'quit' || input === 'exit') {
          rl.close();
          process.exit(0);
        }

        if (input === '+') {
          quickAdd(rl, (result) => {
            if (result) {
              rl.close();
              process.exit(0);
            }
            prompt();
          });
          return;
        }

        const num = parseInt(input, 10);
        if (!isNaN(num) && num >= 1 && num <= data.length) {
          console.log('');
          console.log('  ' + B + green + '✓' + R + ' ' + B + data[num - 1].name + R);
          console.log('');
          fs.writeFileSync('${resultFile.replace(/\\/g, '\\\\')}', JSON.stringify({ type: 'existing', index: num - 1 }));
          rl.close();
          process.exit(0);
        }

        const lower = input.toLowerCase();
        const match = data.findIndex(p => p.name.toLowerCase().includes(lower));
        if (match >= 0) {
          console.log('');
          console.log('  ' + B + green + '✓' + R + ' ' + B + data[match].name + R);
          console.log('');
          fs.writeFileSync('${resultFile.replace(/\\/g, '\\\\')}', JSON.stringify({ type: 'existing', index: match }));
          rl.close();
          process.exit(0);
        }

        console.log('');
        console.log('  ' + B + red + '✗' + R + ' No provider matching "' + input + '"');
        console.log('');
        prompt();
      });
    }

    prompt();
  `;

  const scriptFile = join(tmpDir, 'select.cjs');
  writeFileSync(scriptFile, script);

  try {
    const result = spawnSync(process.execPath, [scriptFile], {
      stdio: 'inherit',
    });

    if (result.status !== 0) {
      process.exit(result.status || 1);
    }

    const resultData = JSON.parse(readFileSync(resultFile, 'utf-8'));

    if (resultData.type === 'new') {
      // Return a special marker so index.ts can handle the quick-add
      return null;
    }

    return providers[resultData.index];
  } finally {
    try {
      unlinkSync(scriptFile);
      unlinkSync(dataFile);
      unlinkSync(resultFile);
      require('fs').rmdirSync(tmpDir);
    } catch {
      // ignore
    }
  }
}

/**
 * Read the quick-add result from the temp file (if user chose +)
 */
export function readQuickAddResult(): { name: string; env: Record<string, string> } | null {
  // We need to find the most recent cswap temp dir
  const tmpBase = tmpdir();
  const fs = require('fs');
  const dirs = fs.readdirSync(tmpBase)
    .filter((d: string) => d.startsWith('cswap-'))
    .map((d: string) => ({
      name: d,
      time: fs.statSync(join(tmpBase, d)).mtimeMs,
    }))
    .sort((a: { time: number }, b: { time: number }) => b.time - a.time);

  if (dirs.length === 0) return null;

  const resultFile = join(tmpBase, dirs[0].name, 'result.json');
  if (!fs.existsSync(resultFile)) return null;

  try {
    const data = JSON.parse(fs.readFileSync(resultFile, 'utf-8'));
    if (data.type === 'new' && data.provider) {
      return data.provider;
    }
  } catch {
    // ignore
  }
  return null;
}
