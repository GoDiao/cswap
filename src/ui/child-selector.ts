/**
 * Child process selector — runs independently with full stdin access.
 * Custom full-screen TUI with arrow-key navigation.
 *
 * Args: <dataFile> <resultFile>
 */
import { readFileSync, writeFileSync } from 'fs';

const [dataFile, resultFile] = process.argv.slice(2);
const raw = JSON.parse(readFileSync(dataFile, 'utf-8')) as {
  providers: {
    name: string;
    envVars: Record<string, string>;
    settingsConfig: Record<string, unknown>;
    lastUsed: number | null;
  }[];
};

const data = raw.providers;

// ── ANSI ───────────────────────────────────────────────────
const ESC = '\x1b';
const R = `${ESC}[0m`;
const B = `${ESC}[1m`;
const D = `${ESC}[2m`;
const clear = `${ESC}[2J${ESC}[H`;
const hideCursor = `${ESC}[?25l`;
const showCursor = `${ESC}[?25h`;
const saveCursor = `${ESC}7`;
const restoreCursor = `${ESC}8`;

// 256-color palette (Claude Code inspired)
const C = {
  orange:  `${ESC}[38;5;208m`,
  amber:   `${ESC}[38;5;214m`,
  dorange: `${ESC}[38;5;130m`,
  green:   `${ESC}[38;5;114m`,
  red:     `${ESC}[38;5;203m`,
  white:   `${ESC}[38;5;255m`,
  gray:    `${ESC}[38;5;243m`,
  dgray:   `${ESC}[38;5;240m`,
  lgray:   `${ESC}[38;5;250m`,
  bg:      `${ESC}[48;5;235m`,  // subtle dark bg for selected row
  reset:   R,
};

// ── String width (CJK aware) ───────────────────────────────
function strWidth(s: string): number {
  let w = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    w += (
      (c >= 0x1100 && c <= 0x115f) || (c >= 0x2e80 && c <= 0x303e) ||
      (c >= 0x3040 && c <= 0x33bf) || (c >= 0x3400 && c <= 0x4dbf) ||
      (c >= 0x4e00 && c <= 0xa4cf) || (c >= 0xac00 && c <= 0xd7a3) ||
      (c >= 0xf900 && c <= 0xfaff) || (c >= 0xfe30 && c <= 0xfe6f) ||
      (c >= 0xff01 && c <= 0xff60) || (c >= 0xffe0 && c <= 0xffe6) ||
      (c >= 0x20000 && c <= 0x2fa1f)
    ) ? 2 : 1;
  }
  return w;
}

function truncStr(s: string, max: number): string {
  if (strWidth(s) <= max) return s;
  let w = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.codePointAt(i)!;
    w += (
      (c >= 0x1100 && c <= 0x115f) || (c >= 0x2e80 && c <= 0x303e) ||
      (c >= 0x3040 && c <= 0x33bf) || (c >= 0x3400 && c <= 0x4dbf) ||
      (c >= 0x4e00 && c <= 0xa4cf) || (c >= 0xac00 && c <= 0xd7a3) ||
      (c >= 0xf900 && c <= 0xfaff) || (c >= 0xfe30 && c <= 0xfe6f) ||
      (c >= 0xff01 && c <= 0xff60) || (c >= 0xffe0 && c <= 0xffe6) ||
      (c >= 0x20000 && c <= 0x2fa1f)
    ) ? 2 : 1;
    if (w > max) return s.slice(0, i) + '…';
  }
  return s;
}

function padR(s: string, width: number): string {
  return s + ' '.repeat(Math.max(0, width - strWidth(s)));
}

function padL(s: string, width: number): string {
  const diff = width - strWidth(s);
  return diff > 0 ? ' '.repeat(diff) + s : s;
}

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

// ── Formatters ─────────────────────────────────────────────
function timeAgo(ts: number | null): string {
  if (!ts) return 'new';
  const diff = Date.now() - ts;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  return `${Math.floor(day / 30)}mo ago`;
}

function shortUrl(url: string): string {
  return url.replace('https://', '').replace('http://', '');
}

// Available width for each column (INNER_W = 58)
// Row 1: " N NAME(18) MODEL(18) LAST(10) " → 50 visible
// Row 2: "     URL...                      " → max 52 for URL
const URL_W = 46;
const MODEL_W = 20;

// ── Layout constants ───────────────────────────────────────
const BOX_W = 60;
const INNER_W = BOX_W - 2;
const BORDER = { tl: '╭', tr: '╮', bl: '╰', br: '╯', h: '─', v: '│' };

// ── Render helpers ─────────────────────────────────────────
function boxLine(left: string, mid: string, right: string, fill: string, contentW: number): string {
  const pad = Math.max(0, INNER_W - contentW);
  return `${C.dgray}${left}${R}${mid}${fill.repeat(pad)}${C.dgray}${right}${R}`;
}

function hLine(left: string, right: string): string {
  return `${C.dgray}${left}${BORDER.h.repeat(INNER_W)}${right}${R}`;
}

function emptyRow(): string {
  return `${C.dgray}${BORDER.v}${R}${' '.repeat(INNER_W)}${C.dgray}${BORDER.v}${R}`;
}

// ── Full-screen render ─────────────────────────────────────
function render(cursor: number) {
  const lines: string[] = [];

  // Header
  lines.push('');
  lines.push(`  ${B}${C.orange}◆${R}  ${B}${C.white}cswap${R}  ${C.dgray}—${R}  ${C.gray}Claude Code Provider Switcher${R}`);
  lines.push('');

  // Box top
  lines.push(`  ${hLine(BORDER.tl, BORDER.tr)}`);

  // Header row: column labels
  const hdrNum = padR('', 2);
  const hdrName = padR('PROVIDER', 18);
  const hdrModel = padR('MODEL', MODEL_W);
  const hdrInfo = padR('LAST', 10);
  const hdrInner = `  ${hdrNum} ${hdrName} ${hdrModel} ${hdrInfo} `;
  lines.push(`  ${C.dgray}${BORDER.v}${R}${D}${C.lgray}${hdrInner}${R}${padR('', Math.max(0, INNER_W - strWidth(stripAnsi(hdrInner))))}${C.dgray}${BORDER.v}${R}`);

  // Separator
  lines.push(`  ${C.dgray}├${'─'.repeat(INNER_W)}┤${R}`);

  // Provider rows
  for (let i = 0; i < data.length; i++) {
    const p = data[i];
    const selected = i === cursor;

    const model = truncStr(p.envVars.ANTHROPIC_MODEL || '—', MODEL_W);
    const url = truncStr(shortUrl(p.envVars.ANTHROPIC_BASE_URL || '—'), URL_W);
    const last = timeAgo(p.lastUsed);

    // Row 1: num + name + model + last used
    const num = selected ? `${B}${C.orange}${padL(String(i + 1), 2)}${R}` : `${D}${C.gray}${padL(String(i + 1), 2)}${R}`;
    const name = selected ? `${B}${C.white}${padR(p.name, 18)}${R}` : `${C.lgray}${padR(p.name, 18)}${R}`;
    const modelStr = selected ? `${C.amber}${padR(model, MODEL_W)}${R}` : `${C.dgray}${padR(model, MODEL_W)}${R}`;
    const lastStr = selected ? `${C.gray}${padR(last, 10)}${R}` : `${C.dgray}${padR(last, 10)}${R}`;

    const row1 = ` ${num} ${name} ${modelStr} ${lastStr} `;
    const row1W = strWidth(stripAnsi(row1));
    const pad1 = Math.max(0, INNER_W - row1W);

    // Row 2: URL (indented)
    const urlStr = selected ? `${C.gray}${url}${R}` : `${C.dgray}${url}${R}`;
    const row2inner = `     ${urlStr}`;
    const row2W = strWidth(stripAnsi(row2inner));
    const pad2 = Math.max(0, INNER_W - row2W);

    // Cursor indicator
    const cursor1 = selected ? `${B}${C.orange}│${R}` : `${C.dgray}${BORDER.v}${R}`;
    const cursor2 = selected ? `${B}${C.orange}│${R}` : `${C.dgray}${BORDER.v}${R}`;

    // Background highlight
    const bg = selected ? `${C.bg}` : '';

    if (selected) {
      lines.push(`${bg}  ${cursor1}${R}${bg}${row1}${' '.repeat(pad1)}${R}${cursor1}`);
      lines.push(`${bg}  ${cursor2}${R}${bg}${row2inner}${' '.repeat(pad2)}${R}${cursor2}`);
    } else {
      lines.push(`  ${cursor1}${row1}${' '.repeat(pad1)}${cursor1}`);
      lines.push(`  ${cursor2}${row2inner}${' '.repeat(pad2)}${cursor2}`);
    }

    // Row separator (except last)
    if (i < data.length - 1) {
      lines.push(`  ${C.dgray}│${'·'.repeat(INNER_W)}│${R}`);
    }
  }

  // Separator before actions
  lines.push(`  ${C.dgray}├${'─'.repeat(INNER_W)}┤${R}`);

  // Quick add row
  const qaSelected = cursor === data.length;
  const qaCursor = qaSelected ? `${B}${C.orange}│${R}` : `${C.dgray}${BORDER.v}${R}`;
  const qaIcon = qaSelected ? `${B}${C.orange}＋${R}` : `${C.amber}＋${R}`;
  const qaLabel = qaSelected ? `${B}${C.amber}Quick add${R}` : `${C.amber}Quick add${R}`;
  const qaDesc = qaSelected ? `${C.gray}add a new provider${R}` : `${C.dgray}add a new provider${R}`;
  const qaRow = ` ${qaIcon} ${qaLabel}  ${qaDesc} `;
  const qaRowW = strWidth(stripAnsi(qaRow));
  const qaPad = Math.max(0, INNER_W - qaRowW);

  if (qaSelected) {
    lines.push(`${C.bg}  ${qaCursor}${R}${C.bg}${qaRow}${' '.repeat(qaPad)}${R}${qaCursor}`);
  } else {
    lines.push(`  ${qaCursor}${qaRow}${' '.repeat(qaPad)}${qaCursor}`);
  }

  // Box bottom
  lines.push(`  ${hLine(BORDER.bl, BORDER.br)}`);

  // Footer
  lines.push('');
  lines.push(`  ${D}${C.gray}↑↓${R} ${C.gray}navigate${R}${C.dgray}  ·  ${R}${D}${C.gray}⏎${R} ${C.gray}select${R}${C.dgray}  ·  ${R}${D}${C.gray}q${R} ${C.gray}quit${R}`);
  lines.push('');

  // Write full screen
  process.stdout.write(clear + lines.join('\n') + '\n');
}

// ── Input handling ─────────────────────────────────────────
function enableRawMode() {
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
  process.stdin.resume();
  process.stdin.setEncoding('utf-8');
}

function disableRawMode() {
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false);
  }
  process.stdin.pause();
}

async function navigate(): Promise<number> {
  return new Promise((resolve) => {
    let cursor = 0;
    const max = data.length; // index of Quick add

    enableRawMode();
    process.stdout.write(hideCursor);
    render(cursor);

    const onData = (ch: string) => {
      // Arrow keys: ESC [ A/B
      if (ch === '\x1b[A') {
        cursor = (cursor - 1 + (max + 1)) % (max + 1);
        render(cursor);
      } else if (ch === '\x1b[B') {
        cursor = (cursor + 1) % (max + 1);
        render(cursor);
      } else if (ch === '\r' || ch === '\n') {
        cleanup();
        resolve(cursor);
      } else if (ch === 'q' || ch === '\x03') { // q or Ctrl+C
        cleanup();
        process.exit(0);
      }
    };

    function cleanup() {
      process.stdin.removeListener('data', onData);
      disableRawMode();
      process.stdout.write(showCursor);
    }

    process.stdin.on('data', onData);
  });
}

// ── Quick Add (input-based) ────────────────────────────────
import { input, select } from '@inquirer/prompts';

const sharedTheme = {
  prefix: { idle: `${D}${C.gray}›${R}`, done: `${B}${C.green}◆${R}` },
  style: {
    message: (s: string) => `${B}${C.lgray}${s}${R}`,
    answer: (s: string) => `${B}${C.white}${s}${R}`,
    defaultAnswer: (s: string) => `${D}${C.gray}(${s})${R}`,
    help: (s: string) => `${D}${C.gray}${s}${R}`,
    error: (s: string) => `${C.red}${s}${R}`,
    highlight: (s: string) => `${C.orange}${s}${R}`,
  },
};

const selectTheme = {
  ...sharedTheme,
  icon: { cursor: `${B}${C.orange}◆${R}` },
  style: {
    ...sharedTheme.style,
    highlight: (s: string) => `${B}${C.orange}${s}${R}`,
    description: (s: string) => `${D}${C.gray}${s}${R}`,
  },
};

async function quickAdd(): Promise<{ name: string; env: Record<string, string> } | null> {
  process.stdout.write('\n');
  console.log(`  ${B}${C.orange}◆${R}  ${B}${C.white}Quick Add Provider${R}`);
  console.log(`  ${C.dgray}${'─'.repeat(36)}${R}`);
  console.log('');

  const name = await input({ message: 'Name:', theme: sharedTheme });
  if (!name.trim()) return null;

  const url = await input({ message: 'Base URL:', theme: sharedTheme });
  if (!url.trim()) return null;

  const key = await input({ message: 'API Key:', theme: sharedTheme });
  if (!key.trim()) return null;

  const model = await input({ message: 'Model:', theme: sharedTheme });
  if (!model.trim()) return null;

  console.log('');

  const customize = await select({
    message: 'Configure per-role models?',
    choices: [
      { name: 'No, use the same model for everything', value: false },
      { name: 'Yes, set Sonnet / Opus / Haiku / Reasoning separately', value: true },
    ],
    theme: selectTheme,
  });

  let sonnet = model, opus = model, haiku = model, reason = model;

  if (customize) {
    console.log('');
    sonnet = (await input({ message: 'Sonnet model:', default: model, theme: sharedTheme })).trim() || model;
    opus = (await input({ message: 'Opus model:', default: model, theme: sharedTheme })).trim() || model;
    haiku = (await input({ message: 'Haiku model:', default: model, theme: sharedTheme })).trim() || model;
    reason = (await input({ message: 'Reasoning model:', default: model, theme: sharedTheme })).trim() || model;
  }

  return {
    name: name.trim(),
    env: {
      ANTHROPIC_AUTH_TOKEN: key.trim(),
      ANTHROPIC_BASE_URL: url.trim(),
      ANTHROPIC_MODEL: model,
      ANTHROPIC_DEFAULT_SONNET_MODEL: sonnet,
      ANTHROPIC_DEFAULT_OPUS_MODEL: opus,
      ANTHROPIC_DEFAULT_HAIKU_MODEL: haiku,
      ANTHROPIC_REASONING_MODEL: reason,
    },
  };
}

// ── Main ───────────────────────────────────────────────────
async function main() {
  const cursor = await navigate();

  if (cursor === data.length) {
    // Quick add
    const provider = await quickAdd();
    if (!provider) {
      process.exit(1);
    }
    console.log('');
    console.log(`  ${B}${C.green}◆${R} ${B}${C.white}${provider.name}${R} ${C.dgray}added${R}`);
    console.log('');
    writeFileSync(resultFile, JSON.stringify({ type: 'new', provider }));
  } else {
    const selected = data[cursor];
    // Show selection confirmation
    process.stdout.write('\n');
    console.log(`  ${B}${C.green}◆${R} ${B}${C.white}${selected.name}${R}`);
    console.log('');
    writeFileSync(resultFile, JSON.stringify({ type: 'existing', index: cursor }));
  }
}

main().catch((err) => {
  if (err.name === 'ExitPromptError') {
    process.exit(0);
  }
  console.error(err);
  process.exit(1);
});
