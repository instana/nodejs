import esbuild from 'esbuild';
import pkg from './package.json' assert { type: 'json' };

async function build() {
  /** @type {esbuild.BuildOptions} */
  const options = {
    entryPoints: ['./extension.ts'],
    outfile: `./dist/extension.js`,
    bundle: true,
    format: 'cjs',
    platform: 'node',
    minify: false,
    define: {
      'process.env.NODE_OPTIONS': JSON.stringify('--require ./node_modules/@instana/serverless-collector/src/index.js'),
      'process.env.INSTANA_ENDPOINT': JSON.stringify(process.env.INSTANA_ENDPOINT),
      'process.env.INSTANA_AGENT_KEY': JSON.stringify(process.env.INSTANA_AGENT_KEY)
    },
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
