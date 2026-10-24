// 中国語の文字列を集めて辞書 ja.json に取り込む。
// 既存の訳は残し、新しい原文だけ "" で追加する。null は「訳さない」の印。
// 文脈情報（出現箇所・バックエンドとの一致）は build/strings.json に書き出す（Git 管理外）。
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, listFiles, collect, rel, requireCleanSource } from './collect.mjs';

requireCleanSource();

const HERE = join(ROOT, 'scripts', 'i18n-ja');
const DICT = join(HERE, 'ja.json');

// Python 側に同じ文字列リテラルがあるものは、API の値として使われている可能性がある
function backendLiterals() {
  const set = new Set();
  const walk = dir => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith('.py')) {
        const text = readFileSync(path, 'utf8');
        for (const m of text.matchAll(/(["'])((?:(?!\1)[^\\\n]|\\.)*)\1/g)) set.add(m[2]);
      }
    }
  };
  for (const dir of ['src', 'migrations']) if (existsSync(join(ROOT, dir))) walk(join(ROOT, dir));
  return set;
}

const strings = new Map();
for (const path of listFiles()) {
  const { text, units } = collect(path);
  const lines = text.split(/\r?\n/);
  for (const u of units) {
    const entry = strings.get(u.key) ?? { kind: u.kind, at: [] };
    entry.at.push({ file: rel(path), line: u.line, code: lines[u.line - 1].trim().slice(0, 200) });
    strings.set(u.key, entry);
  }
}

const backend = backendLiterals();
const dict = existsSync(DICT) ? JSON.parse(readFileSync(DICT, 'utf8')) : {};
const merged = {};
const report = {};
for (const key of [...strings.keys()].sort()) {
  merged[key] = key in dict ? dict[key] : '';
  const e = strings.get(key);
  report[key] = { ...e, backend: backend.has(key) };
}
const stale = Object.keys(dict).filter(k => !strings.has(k));

writeFileSync(DICT, JSON.stringify(merged, null, 2) + '\n');
mkdirSync(join(HERE, 'build'), { recursive: true });
writeFileSync(join(HERE, 'build', 'strings.json'), JSON.stringify(report, null, 2) + '\n');

const values = Object.values(merged);
console.log(`原文 ${values.length} 件（未訳 ${values.filter(v => v === '').length}、訳さない ${values.filter(v => v === null).length}）`);
console.log(`バックエンドにも同じ文字列がある: ${Object.values(report).filter(r => r.backend).length} 件`);
if (stale.length) console.log(`ソースから消えた原文（辞書から削除）: ${stale.length} 件`);
