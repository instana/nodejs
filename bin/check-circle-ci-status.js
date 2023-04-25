#!/usr/bin/env node
/*
 * (c) Copyright IBM Corp. 2022
 */

/*
 * This script checks whether there are successful CircleCI pipelines for a given commit hash. It terminates with exit
 * code 0 if that is the case, or 1 otherwise.
 *
 * It can be run in two modes, for two different use cases.
 * 1) Inside a Github action, to determine whether the current commit has a green CircleCI pipeline for both the
 *   normal build and the other-nodejs-versions build. This is the default mode when running the script without
 *   parameters or with the command check-for-release.
 *
 * 2) Inside CircleCI itself, to determine whether the currently running pipeline has already been built successfully
 *   for the current commit. This mode is invoked with the command check-for-successful-build-on-any-branch.
 */

/*  eslint-disable no-console, no-await-in-loop */

'use strict';

const https = require('https');
const path = require('path');

const mainWorkflowLabel = 'build';
const legacyWorkflowLabel = 'other-nodejs-versions';

function readBasicEnvironmentVariables() {
  const options = {};
  options.circleToken = process.env.CIRCLE_TOKEN;
  if (!options.circleToken) {
    console.error('Error: Please provide the CircleCI API token via the environment variable CIRCLE_TOKEN.');
    process.exit(1);
  }
  return options;
}

function readGithubActionEnvironmentVariablesForReleaseCheck() {
  const options = readBasicEnvironmentVariables();

  options.commitHash = process.env.GITHUB_SHA;
  if (!options.commitHash) {
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
  return options;
}

/**
 * This method checks if green builds exist:
 * - for _both_ workflows,* "build" and "other-nodejs-versions",
 * - for the given commit,
 * - on the _main_ branch.
 *
 * It is meant to be executed in a Github Action and expects certain environment variables to be set (CIRCLE_TOKEN,
 * GITHUB_SHA, GITHUB_REF).
 */
async function checkIfTheCurrentCommitCanBeReleased() {
  const options = readGithubActionEnvironmentVariablesForReleaseCheck();
  const circleToken = options.circleToken;
  const commitHash = options.commitHash;
  try {
    const pipelines = await executeHttpRequest('/api/v2/project/gh/instana/nodejs/pipeline?branch=main', circleToken);
    const pipelineIdsForCommit = pipelines.items //
      .filter(pipeline => pipeline.vcs.revision === commitHash) //
      .map(pipeline => pipeline.id);
    console.log(`Found ${pipelineIdsForCommit.length} pipelines for commit ${commitHash}.`);

    const mainWorkflows = [];
    const legacyNodeJsVersionWorkflows = [];
    for (let i = 0; i < pipelineIdsForCommit.length; i++) {
      const pipelineId = pipelineIdsForCommit[i];
      const workflows = await executeHttpRequest(`/api/v2/pipeline/${pipelineId}/workflow`, circleToken);
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

function readCircleCIEnvironmentVariablesForDuplicateBuildCheck() {
  const options = readBasicEnvironmentVariables();

  options.commitHash = process.env.CIRCLE_SHA1;
  if (!options.commitHash) {
    console.error('Error: Please provide the commit hash to check via the environment variable CIRCLE_SHA1.');
    process.exit(1);
  }

  options.workflowId = process.env.CIRCLE_WORKFLOW_ID;
  if (!options.workflowId) {
    console.error(
      'Error: Please provide the workflow ID of the workflow to check via the environment variable CIRCLE_WORKFLOW_ID.'
    );
    process.exit(1);
  }

  return options;
}

/**
 * This method checks if a green build exists:
 * - for the given workflow,
 * - for the given commit,
 * - on the any branch.
 */
async function checkIfCommitHasBeenBuiltSuccessfullyOnAnyBranchForAGivenWorkflow() {
  const options = readCircleCIEnvironmentVariablesForDuplicateBuildCheck();
  const { circleToken, workflowId, commitHash } = options;

  try {
    const workflowInfo = await executeHttpRequest(`/api/v2/workflow/${workflowId}`, circleToken);
    if (!workflowInfo) {
      console.error(`Error: No result when fetching workflow info for workflow ID: ${options.workflowId}.`);
      process.exit(1);
    }

    const workflowName = workflowInfo.name;
    console.log(`Found workflow name "${workflowName}."`);

    // In contrast to checkIfTheCurrentCommitCanBeReleased, we do not query for a specific branch (like main) here. The
    // response will contain pipelines for all branches (that have been built recently and that have a matching commit
    // hash).
    const maxPages = 3;
    const pipelineIdsForCommit = await fetchWithPagination(
      '/api/v2/project/gh/instana/nodejs/pipeline',
      options,
      0,
      maxPages
    );

    if (pipelineIdsForCommit.length === 0) {
      console.log(
        `Found no pipeline(s) for commit ${commitHash} after fetching ${maxPages} pages, this commit needs to be built.`
      );
      return process.exit(1);
    }

    console.log(
      `Found ${pipelineIdsForCommit.length} pipeline(s) for commit ${commitHash}, fetching pipeline workflow data.`
    );

    const matchingWorkflows = [];
    for (let i = 0; i < pipelineIdsForCommit.length; i++) {
      const pipelineId = pipelineIdsForCommit[i];
      const workflows = await executeHttpRequest(`/api/v2/pipeline/${pipelineId}/workflow`, circleToken);
      workflows.items.forEach(workflow => {
        if (workflow.name === workflowName) {
          matchingWorkflows.push(workflow);
        }
      });
    }

    console.log(
      `Found ${matchingWorkflows.length} workflow(s) for commit ${commitHash} for workflow "${workflowName}".`
    );

    const greenWorkflows = matchingWorkflows.filter(workflow => workflow.status === 'success');

    console.log(
      `Found ${greenWorkflows.length} successful workflow(s) for commit ${commitHash} for workflow "${workflowName}".`
    );

    if (greenWorkflows.length >= 1) {
      console.log(
        `\n\nThere is at least one successful workflow "${workflowName}" for commit ${commitHash}.\nThis workflow ` +
          `does not need to be built again for this commit.\nSuccessful builds:\n${greenWorkflows
            .map(
              w => `- https://app.circleci.com/pipelines/github/instana/nodejs/${w.pipeline_number}/workflows/${w.id}`
            )
            .join('\n')}`
      );
      process.exit(0);
    } else {
      console.error(
        `\n\nThere seems to be no successful workflow "${workflowName}" for commit ${commitHash} yet. Let's build ` +
          'this commit!'
      );
      process.exit(1);
    }
  } catch (e) {
    console.error('Error:', e);
    process.exit(1);
  }
}

async function fetchWithPagination(baseUrl, options, pagesFetched, maxPages, paginationToken) {
  const { circleToken, commitHash } = options;

  let apiUrl;
  if (paginationToken) {
    apiUrl = `${baseUrl}?page-token=${paginationToken}`;
  } else {
    apiUrl = baseUrl;
  }

  console.log(`Fetching pipelines, page ${pagesFetched}.`);
  const pipelines = await executeHttpRequest(apiUrl, circleToken);

  const pipelineIdsForCommit = pipelines.items //
    .filter(pipeline => pipeline.vcs.revision === commitHash) //
    .map(pipeline => pipeline.id);

  if (pipelineIdsForCommit.length === 0 && pagesFetched < maxPages) {
    return fetchWithPagination(baseUrl, options, pagesFetched + 1, maxPages, pipelines.next_page_token);
  } else {
    return pipelineIdsForCommit;
  }
}

function executeHttpRequest(requestPath, circleToken) {
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
          res.on('data', chunk => console.log(`CircleCI response body: ${chunk}`));
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

async function main() {
  const command = process.argv[2] || 'check-for-release';
  switch (command) {
    case 'check-for-release':
      // Checks if green builds exist:
      // - for _both_ workflows, "build" and "other-nodejs-versions",
      // - for the commit we are currently on,
      // - on the _main_ branch.
      return checkIfTheCurrentCommitCanBeReleased();
    case 'check-for-successful-build-on-any-branch':
      // Checks if a green build exists:
      // - for the given workflow,
      // - for the commit we are currently on,
      // - on the any branch.
      return checkIfCommitHasBeenBuiltSuccessfullyOnAnyBranchForAGivenWorkflow();
    default:
      console.error(`Unknown command: ${command}`);
      printHelpAndExit();
  }
}

function printHelpAndExit() {
  const scriptName = path.basename(process.argv[1]);
  console.log(
    `Usage:
- ${scriptName}
- ${scriptName} check-for-release
- ${scriptName} check-for-successful-build-on-any-branch
`
  );
  process.exit(1);
}

main();
