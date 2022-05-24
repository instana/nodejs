/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

/**
 * @fileoverview Rule to disallow unsafe require/import statements.
 * @author Bastian Krol
 */

'use strict';

/*
 * Note: The standard rules from the Eslint import plug-in are not enough for every case in this project because it will
 * be satisfied if the required module can be found somewhere, for example in the node_modules of the root package, or
 * as a dev dependency.
 * For our production code, that does not offer enough protection. Instead the required module needs to be in the
 * production dependencies of that particular package.
 */

const coreModules = require('module').builtinModules;
const dependenciesCache = {};

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

module.exports = {
  meta: {
    docs: {
      description: 'prevent unsafe require/import statements'
    },
    schema: []
  },

  create: function create(context) {
    const pkgUp = require('pkg-up');
    const readPkgUp = require('read-pkg-up');
    const path = require('path');

    function isRelative(name) {
      return /^\./.test(name);
    }

    function isCoreModule(name) {
      return coreModules.includes(name);
    }

    function isScopedPackage(name) {
      return /^@/.test(name);
    }

    const verifyRequireOrImport = (importPath, node) => {
      if (isRelative(importPath)) {
        // ignore relative imports, those are in the same node_modules tree, thus we can always load them
        return;
      }

      if (isCoreModule(importPath)) {
        // ignore core modules, those can always be loaded
        return;
      }

      let packageName;
      if (isScopedPackage(importPath)) {
        packageName = /^@[^/]*\/[^/]*/.exec(importPath)[0];
      } else {
        packageName = /^[^/]*/.exec(importPath)[0];
      }

      const sourceCodeFileName = context.getFilename();
      const sourceCodeDirectory = path.dirname(sourceCodeFileName);
      const packageJsonPath = pkgUp.sync({ cwd: sourceCodeDirectory });
      let productionDependencies = dependenciesCache[packageJsonPath];
      if (!productionDependencies) {
        // We have not figured out the production dependencies for this location yet, let's do that now and/ cache it
        // for other source files from the same location.
        const currentInstanaPackage = readPkgUp.sync({
          cwd: sourceCodeDirectory,
          normalize: false
        });

        productionDependencies = [];
        if (currentInstanaPackage.packageJson.dependencies) {
          productionDependencies = productionDependencies.concat(
            Object.keys(currentInstanaPackage.packageJson.dependencies)
          );
        }
        // Potential improvement: Only allow importing an optional dependency if it is enclosed in a try-catch. Would
        // probably make the rule a lot more complicated, though.
        if (currentInstanaPackage.packageJson.optionalDependencies) {
          productionDependencies = productionDependencies.concat(
            Object.keys(currentInstanaPackage.packageJson.optionalDependencies)
          );
        }

        dependenciesCache[packageJsonPath] = productionDependencies;
      }

      if (productionDependencies.includes(packageName)) {
        // This is a module that is declared in the package's production dependencies.
        return;
      }

      context.report(
        node,
        `Apparently this import or require statement tries to load a module from the package "${packageName}", which ` +
          'is neither a production dependency, nor a Node.js core module, nor an internal module import via a ' +
          'relative path.'
      );
    };

    return {
      ImportDeclaration: function processImportDeclaration(node) {
        if (node.importKind === 'type') {
          return;
        }
        verifyRequireOrImport(node.source.value, node);
      },

      CallExpression: function processCallExpression(node) {
        if (node.callee.name === 'require') {
          const [requirePath] = node.arguments;
          if (!requirePath || !requirePath.value) {
            return;
          }
          verifyRequireOrImport(requirePath.value, node);
        }
      }
    };
  }
};
