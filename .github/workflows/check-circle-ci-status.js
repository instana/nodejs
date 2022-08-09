#!/usr/bin/env node
/*
 * (c) Copyright IBM Corp. 2022
 */

/*
 * This script checks whether there are successful CircleCI builds for a given commit hash. It terminates with
 * exit code 0 if that is the case, or 1 otherwise.
 *
 * Required environment variables:
 * - CIRCLE_TOKEN: The CircleCI API token
 * - GITHUB_SHA: The commit hash to check
 * - GITHUB_REF: The fully qualified ref name (current branch)
 */

/*  eslint-disable no-console, no-await-in-loop */

'use strict';

const https = require('https');

const mainWorkflowLabel = 'build';
const legacyWorkflowLabel = 'legacy-nodejs-versions';

let circleToken;
let commitHash;

function init() {
  circleToken = process.env.CIRCLE_TOKEN;
  if (!circleToken) {
    console.error('Error: Please provide the CircleCI API token via the environment variable CIRCLE_TOKEN.');
    process.exit(1);
  }
  commitHash = process.env.GITHUB_SHA;
  if (!commitHash) {
    console.error('Error: Please provide the commit hash to check via the environment variable GITHUB_SHA.');
    process.exit(1);
  }
  if (!process.env.GITHUB_REF) {
    console.error('Error: GITHUB_REF is not set.');
    process.exit(1);
  }
  if (process.env.GITHUB_REF !== 'refs/heads/main') {
    console.error(
      'Error: This script must only be executed on the main branch. ' +
        `GITHUB_REF was ${process.env.GITHUB_REF}, expected refs/heads/main.`
    );
    process.exit(1);
  }
}

async function getStatus() {
  init();

  try {
    const pipelines = await executeHttpRequest('/api/v2/project/gh/instana/nodejs/pipeline?branch=main');
    const pipelineIdsForCommit = pipelines.items //
      .filter(pipeline => pipeline.vcs.revision === commitHash) //
      .map(pipeline => pipeline.id);
    console.log(`Found ${pipelineIdsForCommit.length} pipelines for commit ${commitHash}.`);

    const mainWorkflows = [];
    const legacyNodeJsVersionWorkflows = [];
    for (let i = 0; i < pipelineIdsForCommit.length; i++) {
      const pipelineId = pipelineIdsForCommit[i];
      const workflows = await executeHttpRequest(`/api/v2/pipeline/${pipelineId}/workflow`);
      workflows.items.forEach(workflow => {
        if (workflow.name === mainWorkflowLabel) {
          mainWorkflows.push(workflow);
        }
        if (workflow.name === legacyWorkflowLabel) {
          legacyNodeJsVersionWorkflows.push(workflow);
        }
      });
    }

    console.log(`Found ${mainWorkflows.length} main workflow(s) for commit ${commitHash}.`);
    console.log(`Found ${legacyNodeJsVersionWorkflows.length} legacy Node.js workflow(s) for commit ${commitHash}.`);

    const greenMainWorkflows = mainWorkflows.filter(workflow => workflow.status === 'success');
    const greenLegacyNodeJsVersionWorkflows = legacyNodeJsVersionWorkflows.filter(
      workflow => workflow.status === 'success'
    );

    console.log(`Found ${greenMainWorkflows.length} successful main workflow(s) for commit ${commitHash}.`);
    console.log(
      `Found ${greenLegacyNodeJsVersionWorkflows.length} successful legacy Node.js workflow(s) ` +
        `for commit ${commitHash}.`
    );

    if (greenMainWorkflows.length >= 1 && greenLegacyNodeJsVersionWorkflows.length >= 1) {
      console.log(
        '\n\nThere is at least one successful main workflow and one successful legacy Node.js workflow for ' +
          `commit ${commitHash}. This commit is eligible to be released.`
      );
      process.exit(0);
    } else if (greenMainWorkflows.length === 0) {
      console.error(
        `\n\nThere seems to be no successful main workflow for commit ${commitHash} yet. This commit is not eligible ` +
          'to be released.'
      );
      process.exit(1);
    } else {
      console.error(
        `There seems to be no successful legacy Node.js version workflow for commit ${commitHash} yet. This commit ` +
          'is not eligible to be released.'
      );
      process.exit(1);
    }
  } catch (e) {
    console.error('Error:', e);
    process.exit(1);
  }
}

function executeHttpRequest(requestPath) {
  return new Promise(function (resolve, reject) {
    const req = https.request(
      {
        hostname: 'circleci.com',
        path: requestPath,
        headers: {
          'Circle-Token': circleToken
        }
      },
      res => {
        if (res.statusCode < 200 || res.statusCode > 299) {
          return reject(new Error(`Unexpected status code ${res.statusCode} for request to ${requestPath}.`));
        }

        let responseBody = '';
        res.on('data', chunk => {
          responseBody += chunk;
        });
        res.on('end', () => {
          try {
            resolve(JSON.parse(responseBody));
          } catch (e) {
            reject(e);
          }
        });
      }
    );

    req.on('error', e => {
      reject(e);
    });

    req.end();
  });
}

getStatus();
