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
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const Guest = require(path.join(root, 'components/shop-feedback-v2.tsx')).default;
const config = JSON.parse(fs.readFileSync(0, 'utf8'));
process.stdout.write(renderToStaticMarkup(React.createElement(Guest, {
  slug: 'fixture', name: config.name, googleUrl: config.googleUrl, pageConfig: config, heroUrl: null, heroKind: null,
})));
