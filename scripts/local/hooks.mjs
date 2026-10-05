// Lets plain Node run the project's TypeScript for the local seed: extension-less and `@/` imports resolve to .ts/.tsx
// files the way the bundler does. Used only by scripts/local.mjs; nothing in the app loads it.
import { registerHooks } from 'node:module';
import { statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = new URL('../../', import.meta.url);
const isFile = path => { try { return statSync(path).isFile(); } catch { return false; } };
registerHooks({
  resolve(specifier, context, next) {
    const base = specifier.startsWith('@/') ? new URL(specifier.slice(2), root)
      : specifier.startsWith('.') && context.parentURL?.startsWith('file:') ? new URL(specifier, context.parentURL) : null;
    if (base) for (const suffix of ['', '.ts', '.tsx', '/index.ts']) {
      const path = fileURLToPath(base) + suffix;
      if (isFile(path)) return next(pathToFileURL(path).href, context);
    }
    return next(specifier, context);
  },
});
