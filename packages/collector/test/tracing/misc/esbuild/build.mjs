import esbuild from 'esbuild';

/*
const banner = `
  require('@instana/serverless-collector')
`;
*/

async function build() {
  /** @type {esbuild.BuildOptions} */
  const options = {
    entryPoints: ['./server.ts'],
    outfile: `./server.out.js`,
    bundle: true,
    format: 'cjs',
    platform: 'node',
    minify: false,
    // banner: { js: banner },
    sourcemap: 'inline',
    sourcesContent: false,
    packages: 'external'
  };

  await esbuild.build(options);
}

build().catch(err => {
  console.error(err);
  process.exit(1);
});
