import nodeResolve from 'rollup-plugin-node-resolve';
import typescript from 'rollup-plugin-typescript2';
import json from 'rollup-plugin-json';
import { terser } from 'rollup-plugin-terser';
import commonjs from 'rollup-plugin-commonjs';
import visualizer from 'rollup-plugin-visualizer';


const plugins = [
  nodeResolve(),
  commonjs({
    include: 'node_modules/**',
  }),
  // rollup-plugin-typescript2's default include ("*.ts+(|x)", "**/*.ts+(|x)")
  // uses extglob syntax that current @rollup/pluginutils (the currently
  // installable ^4.1.2, itself a dependency of this old, unmaintained
  // plugin) no longer supports: createFilter silently matches nothing,
  // so every .ts file falls through to the plain JS parser and rollup
  // chokes on the first decorator. Passing plain glob patterns (no .tsx
  // in this project) sidesteps the incompatibility.
  typescript({
    include: ['*.ts', '**/*.ts'],
    exclude: ['*.d.ts', '**/*.d.ts'],
  }),
  json(),
  visualizer(),
  terser(),
];

export default [
  {
    input: 'src/scheduler-card.ts',
    output: {
      dir: 'dist',
      format: 'iife',
      sourcemap: false,
    },
    plugins: [...plugins],
    context: 'window',
  },
];
