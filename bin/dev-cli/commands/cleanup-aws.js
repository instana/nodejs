/*
 * (c) Copyright IBM Corp. 2026
 */

/* eslint-disable no-await-in-loop */

'use strict';

const readline = require('readline');
const AWS = require('aws-sdk');
const { getCredentials } = require('../aws-services/aws-credentials');
const services = require('../aws-services');

// Used when the account's enabled regions cannot be determined via EC2:DescribeRegions.
const FALLBACK_REGIONS = [
  'us-east-1',
  'us-east-2',
  'us-west-1',
  'us-west-2',
  'af-south-1',
  'ap-east-1',
  'ap-south-1',
  'ap-south-2',
  'ap-southeast-1',
  'ap-southeast-2',
  'ap-southeast-3',
  'ap-southeast-4',
  'ap-northeast-1',
  'ap-northeast-2',
  'ap-northeast-3',
  'ca-central-1',
  'eu-central-1',
  'eu-central-2',
  'eu-west-1',
  'eu-west-2',
  'eu-west-3',
  'eu-north-1',
  'eu-south-1',
  'eu-south-2',
  'il-central-1',
  'me-central-1',
  'me-south-1',
  'sa-east-1'
];

exports.command = 'cleanup-aws';
exports.describe =
  'Find the AWS resources of a service (default: lambda) created by you and delete them after confirmation';

exports.builder = yargs =>
  yargs
    .option('service', {
      type: 'string',
      choices: Object.keys(services),
      default: 'lambda',
      describe: 'The AWS service to clean up'
    })
    .option('prefix', {
      type: 'string',
      describe: 'Only consider resources whose name starts with this prefix'
    })
    .option('regions', {
      type: 'array',
      describe: 'Only scan these regions (default: all enabled regions of the account)'
    })
    .option('dry-run', {
      type: 'boolean',
      default: false,
      describe: 'Only list the resources, never delete anything'
    });

exports.handler = async argv => {
  try {
    await run(argv);
  } catch (err) {
    console.error(`\nError: ${err.message}`);
    process.exitCode = 1;
  }
};

async function run(argv) {
  const service = services[argv.service];
  const credentials = getCredentials();
  const sts = new AWS.STS({ credentials });
  const identity = await sts.getCallerIdentity().promise();
  console.log(`\nAuthenticated as ${identity.Arn} (account ${identity.Account})`);

  const regions = argv.regions && argv.regions.length ? argv.regions.map(String) : await getRegions(credentials);
  console.log(`Scanning ${regions.length} region(s) for ${service.label}s created by ${identity.Arn}...`);
  console.log('(creator is determined via CloudTrail, which only covers the last 90 days)\n');

  let scanned = 0;
  const results = await Promise.all(
    regions.map(async region => {
      const result = { region, resources: [] };
      try {
        result.resources = await service.list(credentials, region, { prefix: argv.prefix, callerArn: identity.Arn });
      } catch (err) {
        result.error = err.message;
      }
      scanned++;
      const status = result.error ? `ERROR (${result.error})` : `${result.resources.length} found`;
      console.log(`  [${scanned}/${regions.length}] ${region}: ${status}`);
      return result;
    })
  );
  const found = results.filter(r => r.resources.length > 0);

  if (found.length === 0) {
    console.log(`No ${service.label}s found. Nothing to do.`);
    return;
  }

  let total = 0;
  found.forEach(({ region, resources }) => {
    console.log(`${region} (${resources.length})`);
    resources.forEach(r => console.log(`  - ${r.id}  [${r.details}]`));
    total += resources.length;
  });
  console.log(`\nTotal: ${total} ${service.label}(s) in ${found.length} region(s).`);

  if (argv.dryRun) {
    console.log('Dry run, nothing deleted.');
    return;
  }

  const proceed = await confirm(
    `Delete these ${total} ${service.label}(s) created by you in account ${identity.Account}?`
  );
  if (!proceed) {
    console.log('Aborted. Nothing deleted.');
    return;
  }
  // Second, harder confirmation to avoid accidental deletion.
  const typed = await ask(`Type the account id (${identity.Account}) to confirm: `);
  if (typed !== identity.Account) {
    console.log('Account id does not match. Aborted. Nothing deleted.');
    return;
  }

  let deleted = 0;
  let failed = 0;
  for (let i = 0; i < found.length; i++) {
    const { region, resources } = found[i];
    for (let j = 0; j < resources.length; j++) {
      const resource = resources[j];
      try {
        await service.remove(credentials, region, resource);
        console.log(`  deleted ${region}/${resource.id}`);
        deleted++;
      } catch (err) {
        console.error(`  FAILED  ${region}/${resource.id}: ${err.message}`);
        failed++;
      }
    }
  }
  console.log(`\nDone. Deleted ${deleted}, failed ${failed}.`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

function ask(question) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function confirm(question) {
  const answer = await ask(`${question} [y/N] `);
  return /^y(es)?$/i.test(answer);
}

async function getRegions(credentials) {
  try {
    const ec2 = new AWS.EC2({ credentials, region: 'us-east-1' });
    const response = await ec2.describeRegions().promise();
    return response.Regions.map(r => r.RegionName).sort();
  } catch (err) {
    console.warn(`Could not determine enabled regions (${err.message}), using built-in region list.`);
    return FALLBACK_REGIONS;
  }
}
