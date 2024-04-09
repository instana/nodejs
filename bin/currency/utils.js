/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const path = require('path');
const fs = require('fs');

module.exports.getRootDependencyVersion = name => {
  const pkgjson = require(path.join(__dirname, '..', '..', 'package.json'));
  return pkgjson.devDependencies[name] || pkgjson.optionalDependencies[name];
};

module.exports.getPackageName = name => {
  const dirs = fs.readdirSync(path.join(__dirname, '..', '..', 'packages'));
  let targetPkg;

  dirs.forEach(dir => {
    try {
      const subpkgjson = require(path.join(__dirname, '..', '..', 'packages', dir, 'package.json'));
      if (subpkgjson.devDependencies?.[name] || subpkgjson.optionalDependencies?.[name]) {
        targetPkg = `packages/${dir}`;
      }
    } catch (error) {
      return undefined;
    }
  });

  return targetPkg;
};

module.exports.getPackageDependencyVersion = name => {
  const dirs = fs.readdirSync(path.join(__dirname, '..', '..', 'packages'));

  return dirs
    .map(dir => {
      try {
        const subpkgjson = require(path.join(__dirname, '..', '..', 'packages', dir, 'package.json'));
        return subpkgjson.devDependencies?.[name] || subpkgjson.optionalDependencies?.[name];
      } catch (error) {
        return undefined;
      }
    })
    .find(version => version !== undefined);
};
