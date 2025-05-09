import esbuild from 'esbuild';
import pkg from './package.json' assert { type: 'json' };

async function build() {
  /** @type {esbuild.BuildOptions} */
  const options = {
    entryPoints: ['./server.ts'],
    outfile: `./dist/server.out.js`,
    bundle: true,
    format: 'cjs',
    platform: 'node',
    minify: false,
    sourcemap: 'inline',
    sourcesContent: false,
    external: ['vscode', ...Object.keys(pkg.dependencies)]
  };

  await esbuild.build(options);
}

build().catch(err => {
  console.error(err);
  process.exit(1);
});
