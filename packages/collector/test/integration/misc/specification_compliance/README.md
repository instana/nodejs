Specification Compliance Tests for Node.js HTTP Tracing
=======================================================

This integration test suite is basically a duplicate of
https://github.ibm.com/instana/tracer-test-suite/tree/main/test-suite. The tests are driven by the file
[tracer_compliance_test_cases.json](./tracer_compliance_test_cases.json), which is in turn a
copy of https://github.ibm.com/instana/tracer-test-suite/blob/main/test-cases/tracer_compliance_test_cases.json. There
is no automation in place which keeps the copy here in sync with the source from the tracer-test-suite repository. If
the test cases in https://github.ibm.com/instana/tracer-test-suite are updated, they should to be udpated here as well.

The main purpose of the test cases is to verify that the Node.js tracer is in compliance with the internal Instana
tracer specification. Its main focus is: Given a set of incoming headers (X-INSTANA-T/-S/-L, traceparent,  and
tracestate), does the tracer use the correct trace and span IDs for the spans it creates and does it inject the correct
headers into downstream requests.

This is tested in the CI pipeline for https://github.ibm.com/instana/tracer-test-suite as well. One important reason for
this tests to exist in this repository here as well is that the CI pipeline for
https://github.ibm.com/instana/tracer-test-suite works on _released_ versions of our npm packages. Having a copy of
these tests here allows us to detect issues _before_ we release.

There is another variant of this test suite (using the same test case JSON file) in
[packages/aws-lambda/test/specification_compliance/](/packages/aws-lambda/test/specification_compliance/) specifically
for AWS Lambda tracing, as this creates its own HTTP-like entry span.
