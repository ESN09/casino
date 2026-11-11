// Construit un unique fichier HTML autonome (JS + CSS intégrés) dans dist-standalone/.
// Utile pour partager une démo sans serveur : il suffit d'ouvrir le fichier.
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const out = await build({
  entryPoints: ['src/main.tsx'],
  bundle: true,
  minify: true,
  write: false,
  outdir: 'dist-standalone',
  format: 'iife',
  target: 'es2022',
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
  loader: { '.css': 'css' },
  logLevel: 'info',
});
const js = out.outputFiles.find((f) => f.path.endsWith('.js')).text;
const css = out.outputFiles.find((f) => f.path.endsWith('.css'))?.text ?? '';
const html = readFileSync('index.html', 'utf8')
  .replace('<script type="module" src="/src/main.tsx"></script>', () => `<script>${js.replace(/<\/script/g, '<\\/script')}</script>`)
  .replace('</head>', () => `<style>${css}</style>\n  </head>`);
mkdirSync('dist-standalone', { recursive: true });
writeFileSync('dist-standalone/index.html', html);
console.log(`dist-standalone/index.html — ${(html.length / 1024).toFixed(0)} Ko`);
