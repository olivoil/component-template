import svelte from 'rollup-plugin-svelte';
import resolve from 'rollup-plugin-node-resolve';
import commonjs from 'rollup-plugin-commonjs';
import replace from 'rollup-plugin-replace';
import postcss from 'rollup-plugin-postcss';
import pkg from './package.json';
import { terser } from 'rollup-plugin-terser';
import sveltePreprocessPostcss from 'svelte-preprocess-postcss';

const mode = process.env.NODE_ENV;
const production = mode === 'production';

const stylePreprocessor = sveltePreprocessPostcss({
  useConfigFile: true,
});

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
      svelte({
        preprocess: {
          style: stylePreprocessor,
        },
        dev: !production,
        generate: 'dom',
        hydratable: true,
        css: false,
      }),
      resolve(),
      commonjs(),
      production && terser(),
    ],
  },
  server: {
    input: 'src/index.svelte',
    output: [{ file: 'build/server.js', format: 'umd', name }],
    plugins: [
      svelte({
        preprocess: {
          style: stylePreprocessor,
        },
        dev: !production,
        generate: 'ssr',
        hydratable: true,
      }),
      postcss({
        extract: 'build/vendor.css',
      }),
      resolve(),
      commonjs(),
      production && terser(),
    ],
  },
});
