#!/usr/bin/env node
/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

/**
 * See README.md for instructions.
 */

'use strict';

const mkdirp = require('mkdirp');
const path = require('path');
const semver = require('semver');

if (semver.gte(process.versions.node, '10.0.0')) {
  createReport();
} else {
  console.error('This tool requires Node.js v10.0.0 or later.');
  // Exiting with exit code 0 for unsupported Node.js versions instead of 1 makes it a bit easier to integrate this
  // into CI, we can just run this tool for every version and it will result in a no-op in older Node.js versions.
  process.exit(0);
}

async function createReport() {
  const repoRootPath = path.join(__dirname, '..', '..');
  process.chdir(repoRootPath);
  const createTestSuiteDurationReport = require('./index');
  const fs = require('fs').promises;
  try {
    const packages = await fs.readdir('packages');
    console.log(packages);
    for (let pckIdx = 0; pckIdx < packages.length; pckIdx++) {
      const packageName = packages[pckIdx];
      const packageDirectory = await fs.stat(path.join(repoRootPath, 'packages', packageName));
      if (!packageDirectory.isDirectory()) {
        continue;
      }
      console.log(`Processing test suite duration breakdown for package ${packageName}.`);
      const testResultsFilePath = path.join(repoRootPath, 'test-results', packageName, 'results.xml');
      try {
        // Check if the results.xml file exists:
        await fs.stat(testResultsFilePath);
      } catch (err) {
        console.error(`No test results for package ${packageName}.`);
        continue;
      }
      try {
        const report = await createTestSuiteDurationReport(testResultsFilePath);
        if (report) {
          const breakdownDirectoryPath = path.join(repoRootPath, 'test-duration-breakdown', packageName);
          await mkdirp(breakdownDirectoryPath);
          const breakdownReportPath = path.join(breakdownDirectoryPath, 'report.json');
          fs.writeFile(breakdownReportPath, JSON.stringify(report, null, 2));
        } else {
          console.error(`No report for package ${packageName}.`);
        }
      } catch (err) {
        console.error(err);
      }
    }
    //
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
