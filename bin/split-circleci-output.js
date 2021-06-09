#!/usr/bin/env node

const { appendFile, open, readFile } = require('fs/promises');
const { join } = require('path');

const prefixes = [
  '@instana/autoprofile',
  '@instana/aws-fargate',
  '@instana/aws-lambda-auto-wrap',
  '@instana/aws-lambda',
  '@instana/collector',
  '@instana/core',
  '@instana/google-cloud-run',
  'instana-nodejs-sensor',
  '@instana/metrics-util',
  '@instana/serverless',
  '@instana/shared-metrics'
];

const filename = process.argv[2];

if (!filename) {
  console.error(`Usage: ${process.argv[1]} <filename>`);
  process.exit(1);
}

console.error(`processing: ${filename}`);

async function splitFile() {
  let content;
  try {
    content = await readFile(filename);
  } catch (e) {
    console.error(`Could not open: ${filename}.`, e.message);
    process.exit(1);
  }

  const outputs = {};
  let outputFilename;
  try {
    for (let i = 0; i < prefixes.length; i++) {
      const prefix = prefixes[i];
      outputFilename = `${prefix}-${filename}`.replace('/', '-');
      console.error(`Creating ${outputFilename}.`);
      outputs[prefix] = await open(outputFilename, 'w+');
    }
    const restFilename = `rest-${filename}`;
    console.error(`Creating ${restFilename}.`);
    outputs['rest'] = await open(`${restFilename}`, 'w+');
  } catch (e) {
    console.error(`Could not open ${outputFilename} for writing.`, e.message);
    process.exit(1);
  }

  content
    .toString()
    .split(/\r\n|\n/)
    .forEach(async line => {
      let found = false;
      for (let i = 0; i < prefixes.length; i++) {
        const prefix = prefixes[i];
        if (line.startsWith(prefix)) {
          found = true;
          await outputs[prefix].appendFile(`${line.substring(prefix.length + 2)}\n`);
          break;
        }
      }
      if (!found) {
        await outputs['rest'].appendFile(`${line}\n`);
      }
    });

  console.error(`done processing: ${filename}`);
}

splitFile();
