import svelte from 'rollup-plugin-svelte';
import resolve from 'rollup-plugin-node-resolve';
import replace from 'rollup-plugin-replace';
import pkg from './package.json';

const mode = process.env.NODE_ENV;

const name = pkg.name
  .replace(/^(@\S+\/)?(svelte-)?(\S+)/, '$3')
  .replace(/^\w/, m => m.toUpperCase())
  .replace(/-\w/g, m => m[1].toUpperCase());

export default Object.values({
  client: {
    input: 'src/index.svelte',
    output: [{ file: 'build/client.js', format: 'iife', name }],
    plugins: [
      replace({
        'process.browser': false,
        'process.env.NODE_ENV': JSON.stringify(mode),
      }),
      svelte({ generate: 'dom', hydratable: true }),
      resolve(),
    ],
  },
  server: {
    input: 'src/index.svelte',
    output: [{ file: 'build/server.js', format: 'umd', name }],
    plugins: [svelte({ generate: 'ssr', hydratable: true }), resolve()],
  },
});
