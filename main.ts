import { copyFileSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

function arg(name: string, fallback: string): string {
  const flag = `--${name}`;
  const args = process.argv.slice(2);
  const index = args.findIndex(value => value === flag || value.startsWith(`${flag}=`));
  if (index === -1) return fallback;
  const value = args[index] === flag ? args[index + 1] : args[index].slice(flag.length + 1);
  if (!value || value.startsWith('--')) throw new Error(`Expected a path after ${flag}`);
  return value;
}

function copyFiles(from: string, to: string): void {
  mkdirSync(to, { recursive: true });
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    if (entry.isFile() && !entry.name.startsWith('.')) {
      copyFileSync(join(from, entry.name), join(to, entry.name));
    }
  }
}

function main(): number {
  const input = arg('input', '/input');
  const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');
  const inputInfo = statSync(input, { throwIfNoEntry: false });
  const file = inputInfo?.isDirectory() || input === '/input' ? join(input, 'snapshot.json') : input;
  if (!statSync(file, { throwIfNoEntry: false })?.isFile()) {
    console.error(`token radar: no snapshot at ${file}. Pass --input <file|directory>.`);
    return 2;
  }

  const snapshot = parseSnapshot(readFileSync(file, 'utf8'));
  const { board, radar } = buildRadar(snapshot);
  const issue = boardIssue(board, snapshot);
  if (issue !== null) throw new Error(issue);

  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
  writeFileSync(join(out, 'data.js'), dataScript(radar));
  for (const directory of ['dashboard', 'screenshots']) {
    copyFiles(join(here, directory), join(out, directory));
  }
  writeFileSync(join(out, 'dossier.json'), buildDossier(out, { text_max_bytes: 65_536 }));
  console.log(`token radar: wrote ${board.length} ranked rows and dossier to ${out}`);
  return 0;
}

try {
  process.exitCode = main();
} catch (error) {
  console.error(`token radar: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
