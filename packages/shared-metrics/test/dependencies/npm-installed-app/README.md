This folder only contains a tar.gz of a small Node.js application. It is used in the test (../test.js) to simulate a scenario where the whole application is installed via npm. Such a deployment strategy roughly works like this:
1. On a build system, the application is published to a (private) npm registry as a whole (via `npm publish` or similar).
2. The application is deployed on the target system by running `npm install $applicationName`.

This is in contrast to the more usual Node.js deployment scenario where one would copy the source repository of the application and only install the _dependencies_ via `npm install`.

The tar.gz is used in the following way in the test `dependencies - should limit dependencies when the application is installed into node_modules`:

1. Create a temporary directory.
2. Run `npm install npm-installed-test-app-1.0.0.tgz` in that temporary directory.
3. Start the application, let the `dependencies` metric do its work, and verify that it has found the expected dependencies.

To make changes to the application under test, follow these steps:
1. `cd packages/shared-metrics/test/dependencies/npm-installed-app`.
2. Run `tar xf npm-installed-test-app-1.0.0.tgz`.
3. Perform the required edits in `package/app.js` and `package/package.json`.
4. Run the following command to build a new tar.gz file: `rm -f npm-installed-test-app-1.0.0.tgz && pushd package && npm pack && mv npm-installed-test-app-1.0.0.tgz .. && popd`
