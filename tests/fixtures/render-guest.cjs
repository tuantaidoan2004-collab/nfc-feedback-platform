/* eslint-disable @typescript-eslint/no-require-imports -- isolated CommonJS SSR loader for real React, outside Playwright JSX */
// Run React SSR outside Playwright's JSX transform (which creates __pw_type elements).
// This process never opens sockets or invokes effects; only local source is compiled.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = process.cwd();
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8').replace(/(['"])@\//g, `$1${root}/`);
  const output = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  module._compile(output, filename);
};
require.extensions['.css'] = () => {};
// next/font only works inside Next's compiler; here every font is a class name that sets nothing.
const Module = require('node:module'), load = Module._load;
Module._load = function (request, ...rest) {
  if (request === 'next/font/google') return new Proxy({}, { get: () => () => ({ variable: 'fixture-font', className: 'fixture-font' }) });
  return load.call(this, request, ...rest);
};
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
// The guest page as the server sends it (components/canvas/render.tsx): { config, googleUrl } on stdin.
const CanvasPage = require(path.join(root, 'components/canvas/render.tsx')).default;
const { config, googleUrl } = JSON.parse(fs.readFileSync(0, 'utf8'));
process.stdout.write(renderToStaticMarkup(React.createElement(CanvasPage, { doc: config.doc, mode: 'live', slug: 'fixture', googleUrl })));
