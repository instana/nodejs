Test Suite Duration Breakdown
=============================

**Usage:**
- Download a xUnit test report from CircleCI: Go to any CircleCI build, to one particular Node.js version, then to the "Artifacts" tab, and download "test-results/collector/results.xml". (Would probably work with any other package besides collector as well but the collector package is by far the package that basically determines the duration of the whole CI job.)
- Put the downloaded results.xml file into test-results/collector/results.xml (the default location, also written to when running the tests locally) or in another location of your choice.
- Run `cd misc/test-durations && npm i`, then
- `node .` > output.json`, or
- `node . path/to/result.xml > output.json`.
- The resulting JSON will list all test suites with their cumulative duration in minutes. The test suites are sorted from fastest to slowest, so that the test suites that take longest are at the end of the resulting JSON report.

