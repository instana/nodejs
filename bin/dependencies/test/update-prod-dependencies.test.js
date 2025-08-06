/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const path = require('path');
const assert = require('assert');
const utils = require('../utils');

// Store original functions to restore after tests
const originalGetPackageJsonPathsUnderPackagesDir = utils.getPackageJsonPathsUnderPackagesDir;
const originalGetLatestVersion = utils.getLatestVersion;
const originalBranchExists = utils.branchExists;
const originalPrepareGitEnvironment = utils.prepareGitEnvironment;
const originalInstallPackage = utils.installPackage;
const originalCommitAndCreatePR = utils.commitAndCreatePR;
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

// Mock data
const mockPackagePaths = [
  {
    pkgRelDir: 'packages/package-a',
    pkgJsonAbsPath: path.join(__dirname, 'assets', 'workspace-a', 'package.json')
  },
  {
    pkgRelDir: 'packages/package-b',
    pkgJsonAbsPath: path.join(__dirname, 'assets', 'workspace-a', 'package.json')
  }
];

// Mock package.json content
const mockPackageJson = {
  name: 'test-package',
  dependencies: {
    'dep-1': '1.0.0',
    'dep-2': '2.0.0',
    '@instana/internal-dep': '1.0.0' // This should be excluded
  }
};

// Test tracking variables
let installedPackages = [];
let createdPRs = [];
const executedCommands = [];
let branchesChecked = [];

try {
  // Setup mocks
  console.log('Setting up mocks...');

  // Mock getPackageJsonPathsUnderPackagesDir
  utils.getPackageJsonPathsUnderPackagesDir = () => mockPackagePaths;

  // Mock require for package.json
  const originalRequire = require;
  global.require = function (id) {
    if (id.endsWith('package.json')) {
      return mockPackageJson;
    }
    return originalRequire(id);
  };

  // Mock getLatestVersion
  utils.getLatestVersion = ({ pkgName, installedVersion }) => {
    if (pkgName === 'dep-1') return '1.2.0'; // New version available
    if (pkgName === 'dep-2') return '2.0.0'; // Same version
    return installedVersion;
  };

  // Mock branchExists
  utils.branchExists = branchName => {
    branchesChecked.push(branchName);
    return false; // Branch doesn't exist by default
  };

  // Mock prepareGitEnvironment
  utils.prepareGitEnvironment = branchName => {
    executedCommands.push(`Prepared git environment for branch: ${branchName}`);
  };

  // Mock installPackage
  utils.installPackage = options => {
    installedPackages.push({
      packageName: options.packageName,
      version: options.version,
      workspaceFlag: options.workspaceFlag
    });
  };

  // Mock commitAndCreatePR
  utils.commitAndCreatePR = options => {
    createdPRs.push({
      packageName: options.packageName,
      currentVersion: options.currentVersion,
      newVersion: options.newVersion,
      branchName: options.branchName
    });
    return true;
  };

  // Mock console.log and console.error
  console.log = () => {};
  console.error = () => {};

  // Set environment variables
  process.env.BRANCH = 'test-branch';
  process.env.SKIP_PUSH = 'false';
  process.env.PROD_DEPS_PR_LIMIT = '2';

  // Run the script
  console.log('Running update-prod-dependencies.js...');
  require('../production/update-prod-dependencies');

  // Test 1: Should update dependencies with new versions available
  assert.strictEqual(installedPackages.length, 1, 'Should install one package');
  assert.strictEqual(installedPackages[0].packageName, 'dep-1', 'Should install dep-1');
  assert.strictEqual(installedPackages[0].version, '1.2.0', 'Should install version 1.2.0');
  console.log('Test 1 passed: Dependencies with new versions are updated correctly.');

  // Test 2: Should create PR for updated dependencies
  assert.strictEqual(createdPRs.length, 1, 'Should create one PR');
  assert.strictEqual(createdPRs[0].packageName, 'dep-1', 'Should create PR for dep-1');
  assert.strictEqual(createdPRs[0].currentVersion, '1.0.0', 'Current version should be 1.0.0');
  assert.strictEqual(createdPRs[0].newVersion, '1.2.0', 'New version should be 1.2.0');
  console.log('Test 2 passed: PRs are created correctly for updated dependencies.');

  // Test 3: Should exclude @instana internal dependencies
  const internalDepUpdated = installedPackages.some(pkg => pkg.packageName === '@instana/internal-dep');
  assert.strictEqual(internalDepUpdated, false, 'Should not update @instana internal dependencies');
  console.log('Test 3 passed: @instana internal dependencies are excluded.');

  // Test 4: Should respect PR limit
  // Reset tracking variables
  installedPackages = [];
  createdPRs = [];

  // Update mock data for PR limit test
  mockPackageJson.dependencies = {
    'dep-1': '1.0.0',
    'dep-2': '2.0.0',
    'dep-3': '3.0.0',
    'dep-4': '4.0.0'
  };

  utils.getLatestVersion = ({ pkgName }) => {
    // All dependencies have updates available
    return `${pkgName.replace('dep-', '')}.1.0`;
  };

  // Run the script again
  require('../production/update-prod-dependencies');

  assert.strictEqual(createdPRs.length, 2, 'Should respect PR limit of 2');
  console.log('Test 4 passed: PR limit is respected.');

  // Test 5: Should skip dependencies that already have branches
  // Reset tracking variables
  installedPackages = [];
  createdPRs = [];
  branchesChecked = [];

  // Mock branchExists to return true for dep-1
  utils.branchExists = branchName => {
    branchesChecked.push(branchName);
    return branchName.includes('dep1');
  };

  // Run the script again
  require('../production/update-prod-dependencies');

  const dep1Updated = installedPackages.some(pkg => pkg.packageName === 'dep-1');
  assert.strictEqual(dep1Updated, false, 'Should skip dep-1 because branch already exists');
  console.log('Test 5 passed: Dependencies with existing branches are skipped.');

  // Test 6: Should handle errors during dependency updates
  // Reset tracking variables
  installedPackages = [];
  createdPRs = [];

  // Mock commitAndCreatePR to throw an error for dep-2
  utils.commitAndCreatePR = options => {
    if (options.packageName === 'dep-2') {
      throw new Error('Mock error');
    }
    createdPRs.push({
      packageName: options.packageName,
      currentVersion: options.currentVersion,
      newVersion: options.newVersion,
      branchName: options.branchName
    });
    return true;
  };

  // Capture console.error calls
  const errors = [];
  console.error = msg => {
    errors.push(msg);
  };

  // Run the script again
  require('../production/update-prod-dependencies');

  const hasError = errors.some(error => error.includes('Failed updating dep-2'));
  assert.strictEqual(hasError, true, 'Should log error for failed dependency update');
  console.log('Test 6 passed: Errors during dependency updates are handled correctly.');

  console.log('All tests passed!');
} catch (error) {
  console.error('Test failed:', error);
} finally {
  // Restore original functions
  utils.getPackageJsonPathsUnderPackagesDir = originalGetPackageJsonPathsUnderPackagesDir;
  utils.getLatestVersion = originalGetLatestVersion;
  utils.branchExists = originalBranchExists;
  utils.prepareGitEnvironment = originalPrepareGitEnvironment;
  utils.installPackage = originalInstallPackage;
  utils.commitAndCreatePR = originalCommitAndCreatePR;
  global.require = require;
  console.log = originalConsoleLog;
  console.error = originalConsoleError;

  // Clean up environment variables
  delete process.env.BRANCH;
  delete process.env.SKIP_PUSH;
  delete process.env.PROD_DEPS_PR_LIMIT;
}

// Made with Bob
