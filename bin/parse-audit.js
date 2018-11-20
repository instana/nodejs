#!/usr/bin/env node
'use strict';

/*
 * A command line tool that expects the output of `npm audit --json` on stdin
 * and terminates with a non-zero exit when there are vulnerabilities in
 * production dependencies (that is, in non-dev dependencies).
 *
 * This exists mainly because `npm audit` does not honor the --only=prod flag (while `npm audit --fix` does).
 */

process.stdin.setEncoding('utf8');

let raw = '';

process.stdin.on('readable', () => {
  const chunk = process.stdin.read();
  if (chunk != null) {
    raw += chunk;
  }
});

process.stdin.on('end', () => {
  try {
    const auditReport = JSON.parse(raw);
    if (!auditReport.advisories) {
      process.stderr.write('Incoming JSON has no advisories field.\n');
      printHelpAndExit();
    }
    const nonDevFindings = Object.keys(auditReport.advisories)
      .map(k => auditReport.advisories[k].findings)
      .filter(findings => findings.filter(finding => !finding.dev).length >= 1);
    if (nonDevFindings.length > 0) {
      if (nonDevFindings.length === 1) {
        process.stdout.write('I have found a vulnerability:\n\n');
      } else {
        process.stdout.write(`I have found ${nonDevFindings.length} vulnerabilities.\n\n`);
      }
      nonDevFindings.forEach(finding => {
        process.stdout.write(JSON.stringify(finding, null, 2));
        process.stdout.write('\n');
      });
      process.exit(1);
    }
    process.stderr.write('npm audit found no prod vulnerabilities, everything is peachy.\n');
    process.exit(0);
  } catch (e) {
    process.stderr.write(`Could not parse input. Parsing error: ${e.message}\n`);
    printHelpAndExit();
  }
});

function printHelpAndExit() {
  process.stderr.write(
    'parse-audit expects the output of ' +
      'npm audit --json to be piped into it via stdin. If you did something ' +
      'different, you did it wrong :-)\n\n'
  );
  process.exit(1);
}
