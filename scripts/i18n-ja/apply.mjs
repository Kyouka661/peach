// 辞書 ja.json をフロントエンドのソースに当てて、中国語の文字列を日本語に置き換える。
// 作業ツリーのファイルを直接書き換える。元に戻すときは README の手順で git checkout する。
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, listFiles, collect, rel, requireCleanSource } from './collect.mjs';

requireCleanSource();

const load = name => JSON.parse(readFileSync(join(ROOT, 'scripts', 'i18n-ja', name), 'utf8'));
const dict = load('ja.json');
// 同じ原文でもファイルによって意味が違うもの（「关闭」が「閉じる」か「オフ」か など）。
// 「原文@キー名」はオブジェクトのそのキーの値だけに効く（サーバーに送る確認文字列など）
const overrides = load('overrides.json');
// web/index.html の属性値とテキスト（コメントの中は触らない）
const html = load('html.json');

// サーバーのデータ（タグ名）と照合する対応表なので、ファイルごと触らない
const SKIP_FILES = new Set(['frontend/src/core/tags.ts']);

// 文字列リテラル以外で直すところ
const EXTRA = [
  ['web/index.html', '<html lang="zh-CN">', '<html lang="ja">'],
  // 並べ替えと日付の表示を日本語の規則にする
  ...['frontend/src/react/components/data-table.tsx', 'frontend/src/react/follow-manage/alias-manager.tsx',
    'frontend/src/react/follow-manage/follow-manage.ts', 'frontend/src/react/index/index-data.ts',
    'frontend/src/react/scraping/scraping-page.tsx', 'frontend/src/react/taste/taste.ts']
    .map(file => [file, /'zh-CN'/g, "'ja-JP'"]),
  // 訳文をつなぐ区切りを日本語の読点にする
  ...['frontend/src/application/entity.js', 'frontend/src/react/data-cleanup/resource-sync.ts',
    'frontend/src/react/library-processing/library-processing-card.tsx', 'frontend/src/react/taste/charts.tsx',
    'frontend/src/react/follow-manage/alias-manager.tsx']
    .map(file => [file, /join\('[，；]'\)/g, "join('、')"]),
];

const ESCAPES = { '\\': '\\\\', '\n': '\\n', '\r': '\\r', '\t': '\\t' };

function escapeString(value, quote) {
  return value.replace(/[\\\n\r\t]/g, c => ESCAPES[c]).replaceAll(quote, '\\' + quote);
}

function render(unit, ja) {
  if (unit.kind === 'template') return ja;
  if (unit.kind === 'jsx') {
    if (/[{}<>]/.test(ja)) throw new Error(`JSX テキストに使えない文字があります: ${ja}`);
    return ja;
  }
  if (unit.jsxAttr) {
    if (ja.includes(unit.quote) || /[\n\r]/.test(ja)) throw new Error(`JSX 属性に入れられない文字があります: ${ja}`);
    return unit.quote + ja + unit.quote;
  }
  return unit.quote + escapeString(ja, unit.quote) + unit.quote;
}

// 途中で失敗したときに半端な状態を残さないよう、全部作ってから書き込む
let replaced = 0;
const writes = [];
const missing = new Map();
for (const path of listFiles()) {
  const file = rel(path);
  if (SKIP_FILES.has(file)) continue;
  const { text, units } = collect(path);
  const local = overrides[file] ?? {};
  let out = text;
  for (const u of [...units].sort((a, b) => b.start - a.start)) {
    const atProp = u.prop ? `${u.key}@${u.prop}` : null;
    const ja = atProp && atProp in local ? local[atProp] : u.key in local ? local[u.key] : dict[u.key];
    if (ja === null) continue;
    if (!ja) {
      if (file.startsWith('frontend/src/')) missing.set(u.key, `${file}:${u.line}`);
      continue;
    }
    out = out.slice(0, u.start) + render(u, ja) + out.slice(u.end);
    replaced++;
  }
  if (out !== text) writes.push([path, out]);
}

{
  const path = join(ROOT, 'web', 'index.html');
  const text = readFileSync(path, 'utf8');
  const out = text.split(/(<!--[\s\S]*?-->)/).map(part => part.startsWith('<!--') ? part
    : part.replace(/(="|>)([^"<>]+)("|<)/g, (m, open, value, close) =>
      (open === '="') === (close === '"') && html[value.trim()]
        ? open + value.replace(value.trim(), html[value.trim()]) + close : m)).join('');
  if (out !== text) writes.push([path, out]);
}

// EXTRA は上の置換結果に重ねる
const pending = new Map(writes);
for (const [file, from, to] of EXTRA) {
  const path = join(ROOT, file);
  const text = pending.get(path) ?? readFileSync(path, 'utf8');
  const out = text.replace(from, to);
  if (out === text && !text.includes(to)) console.warn(`置換対象が見つかりません: ${file}: ${from}`);
  pending.set(path, out);
}
let changedFiles = 0;
for (const [path, out] of pending) {
  if (out !== readFileSync(path, 'utf8')) { writeFileSync(path, out); changedFiles++; }
}

console.log(`${changedFiles} ファイル、${replaced} か所を置き換えました`);
if (missing.size) {
  console.log(`画面のソースに未訳の文字列が ${missing.size} 件あります（先頭 20 件）:`);
  for (const [key, at] of [...missing].slice(0, 20)) console.log(`  ${at}  ${JSON.stringify(key)}`);
}
