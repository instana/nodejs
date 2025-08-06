#!/bin/bash

# Run all tests in the test directory
echo "Running tests..."

# Run utils test
echo "Running utils.test.js"
node bin/dependencies/test/utils.test.js

# Run update-prod-dependencies test
echo "Running update-prod-dependencies.test.js"
node bin/dependencies/test/update-prod-dependencies.test.js

echo "All tests completed."

# Made with Bob
