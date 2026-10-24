// 文脈チェック用の資料を作る。置換後のコード行と「原文 → 訳」の組をファイルごとにまとめる。
// node scripts/i18n-ja/review.mjs units     … 置換前のソースから置換単位を build/units.json に保存
// node scripts/i18n-ja/review.mjs chunks N  … 置換後のソースを読み、build/review/ に N 個の資料を書く
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, listFiles, collect, rel, requireCleanSource } from './collect.mjs';

const HERE = join(ROOT, 'scripts', 'i18n-ja');
const BUILD = join(HERE, 'build');
const dict = JSON.parse(readFileSync(join(HERE, 'ja.json'), 'utf8'));

if (process.argv[2] === 'units') {
  requireCleanSource();
  const out = {};
  for (const path of listFiles()) {
    const file = rel(path);
    if (!file.startsWith('frontend/src/') || file === 'frontend/src/core/tags.ts') continue;
    const used = collect(path).units.filter(u => dict[u.key]);
    if (used.length) out[file] = used.map(u => ({ line: u.line, key: u.key }));
  }
  mkdirSync(BUILD, { recursive: true });
  writeFileSync(join(BUILD, 'units.json'), JSON.stringify(out));
  console.log(`${Object.keys(out).length} ファイル分の置換単位を保存しました`);
} else if (process.argv[2] === 'chunks') {
  const n = Number(process.argv[3] || 10);
  const units = JSON.parse(readFileSync(join(BUILD, 'units.json'), 'utf8'));
  const blocks = [];
  for (const [file, list] of Object.entries(units)) {
    const lines = readFileSync(join(ROOT, file), 'utf8').split(/\r?\n/);
    const byLine = new Map();
    for (const u of list) byLine.set(u.line, [...(byLine.get(u.line) ?? []), u]);
    let text = `=== ${file}\n`;
    for (const [line, us] of byLine) {
      text += `L${line}: ${lines[line - 1].trim().slice(0, 400)}\n`;
      for (const u of us) text += `    原文: ${JSON.stringify(u.key).slice(0, 300)}  →  訳: ${JSON.stringify(dict[u.key]).slice(0, 300)}\n`;
    }
    blocks.push(text);
  }
  const target = blocks.reduce((a, b) => a + b.length, 0) / n;
  mkdirSync(join(BUILD, 'review'), { recursive: true });
  let i = 1, buf = '';
  const flush = () => { writeFileSync(join(BUILD, 'review', `${String(i).padStart(2, '0')}.txt`), buf); i++; buf = ''; };
  for (const b of blocks) {
    buf += b + '\n';
    if (buf.length >= target && i < n) flush();
  }
  if (buf) flush();
  console.log(`build/review/ に ${i - 1} 個の資料を書きました`);
} else {
  console.log('使い方: node scripts/i18n-ja/review.mjs units | chunks <個数>');
}
