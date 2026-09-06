import fs from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from './lib.mjs';
import { pageHtml } from '../site/page.mjs';

const dist = path.join(ROOT, 'dist');
const site = path.join(ROOT, 'site');
const assets = ['app.js', 'model.js', 'styles.css'];

await fs.rm(dist, { recursive: true, force: true });
await fs.mkdir(dist, { recursive: true });
await fs.cp(path.join(ROOT, 'content'), path.join(dist, 'content'), { recursive: true });

await Promise.all(
  assets.map((asset) => fs.copyFile(path.join(site, asset), path.join(dist, asset))),
);

await Promise.all([
  fs.writeFile(path.join(dist, 'index.html'), pageHtml('오늘의 QT', 'home'), 'utf8'),
  fs.writeFile(path.join(dist, 'archive.html'), pageHtml('QT 아카이브', 'archive'), 'utf8'),
  fs.writeFile(path.join(dist, '404.html'), pageHtml('QT', 'home'), 'utf8'),
  fs.writeFile(path.join(dist, '.nojekyll'), '', 'utf8'),
]);

console.log('Site built to dist/');
