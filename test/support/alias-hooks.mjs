// Resolves the app's "~/" alias and extensionless relative imports, as Vite does, so tests can
// import server modules and route actions under plain Node.

import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../app');

function withExtension(file) {
  if (existsSync(file) && !file.endsWith('/')) return file;
  for (const ext of ['.js', '.mjs']) if (existsSync(file + ext)) return file + ext;
  return null;
}

export async function resolve(specifier, context, next) {
  if (specifier.startsWith('~/')) {
    const file = withExtension(path.join(APP, specifier.slice(2)));
    if (file) return { url: pathToFileURL(file).href, shortCircuit: true };
  }
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL?.startsWith('file:')) {
    const file = withExtension(path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier));
    if (file) return { url: pathToFileURL(file).href, shortCircuit: true };
  }
  return next(specifier, context);
}
