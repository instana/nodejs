#!/usr/bin/env node
/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

/**
 * See README.md for instructions.
 */

'use strict';

const { readFile } = require('fs').promises;
const { join } = require('path');
const xml2js = require('xml2js');

module.exports = async function createTestSuiteDurationReport(filename, exitOnError) {
  if (!filename) {
    throw new Error('Missing mandatory argument: filename.');
  }

  let content;
  try {
    content = await readFile(filename);
  } catch (e) {
    console.error(`Could not open: ${filename}.`, e.message);
    console.error(`Usage: ${process.argv[1]} [filename]`);
    if (exitOnError) {
      process.exit(1);
    }
    return null;
  }

  try {
    const parser = new xml2js.Parser();
    const parsedResults = await parser.parseStringPromise(content);
    if (!parsedResults || !parsedResults.testsuite || !parsedResults.testsuite.$) {
      console.error(`The file ${filename} has no content or could not be parsed.`);
      console.error(`Usage: ${process.argv[1]} [filename]`);
      if (exitOnError) {
        process.exit(1);
      }
      return null;
    }
    const report = {};
    report['Number of Tests'] = parseInt(parsedResults.testsuite.$.tests, 10);
    report['Total Duration (in minutes)'] = formatSecondsToMinutes(parsedResults.testsuite.$.time);
    const aggregated = parsedResults.testsuite.testcase.reduce((accumulatedReport, currentTest) => {
      const test = currentTest.$.classname;
      const suiteName = test.split(' ')[0];
      if (!accumulatedReport[suiteName]) {
        accumulatedReport[suiteName] = {
          suite: suiteName,
          durationInSeconds: 0,
          'number of tests': 0
          // tests: []
        };
      }
      const duration = parseFloat(currentTest.$.time, 10);
      accumulatedReport[suiteName].durationInSeconds += duration;
      accumulatedReport[suiteName]['number of tests']++;
      // accumulatedReport[suiteName].tests.push(test);
      return accumulatedReport;
    }, {});
    const sorted = Object.values(aggregated).sort((suite1, suite2) => {
      if (suite1.durationInSeconds > suite2.durationInSeconds) {
        return 1;
      } else if (suite1.durationInSeconds === suite2.durationInSeconds) {
        return 0;
      } else {
        return -1;
      }
    });
    sorted.forEach(suite => {
      suite['duration (min:sec:millis)'] = formatSecondsToMinutes(suite.durationInSeconds);
      delete suite.durationInSeconds;
    });
    report.Breakdown = sorted;
    return report;
  } catch (e) {
    console.error(e);
    if (exitOnError) {
      process.exit(1);
      return null;
    }
  }
};

function formatSecondsToMinutes(timeInSeconds) {
  const minutes = Math.floor(timeInSeconds / 60);
  const remainingSeconds = timeInSeconds - minutes * 60;
  const seconds = Math.floor(remainingSeconds);
  const secondsFormatted = String(seconds).padStart(2, '0');
  const millisAsFractionOfSecond = remainingSeconds - seconds;
  const millisFormatted = String(Math.round(millisAsFractionOfSecond * 1000)).padStart(3, '0');
  return `${minutes}:${secondsFormatted}:${millisFormatted}`;
}

async function main() {
  // Trigger report creation if called directly via command line.
  let filename = process.argv[2];
  if (!filename) {
    filename = join(__dirname, '..', '..', 'test-results', 'collector', 'results.xml');
    console.error(`No file name provided, using default: ${filename}.`);
  }
  const report = await module.exports(filename, true);
  console.log(JSON.stringify(report, null, 2));
}

if (require.main === module) {
  main();
}
