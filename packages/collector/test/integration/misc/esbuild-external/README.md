# Notes

For `esbuild` you MUST define the NPM production dependencies in the `external` configuration, otherwise `esbuild` will bundle **all** production dependencies into
one dist file and it will no longer use `require` or `import`, because the code
is accessible in the dist file itself.

# Build

```sh
npm i
cp .env.template .env
npm run build
npm run package
```

Optionally, upload `dist/instana-test-esbuild-0.17.19.vsix` to VSCode and run the command "Run Instana Axios Demo".