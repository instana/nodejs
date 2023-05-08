#######################################
# (c) Copyright IBM Corp. 2022
#######################################

# A helper script used to split test files over multiple parallel CircleCI executors. Used in .circleci/config.yml. This
# works in conjunction with the "npm run test:ci" command we run in each package, and executes the subset of tests
# assigned to the current executor. If this CircleCI run has been started as "rerun failed tests only" (see
# https://circleci.com/docs/test-splitting-tutorial/ and https://circleci.com/docs/rerun-failed-tests-only/), the list
# of tests produced by this script will be the intersection of the tests assigned to this executor and the failed
# tests to be rerun.

# Note: globstar requires at least bash 4, the default bash on MacOS is 3.2.
# If testing this script locally on MacOS and you run into issues with globstar, see
# https://apple.stackexchange.com/a/292760.
shopt -s globstar

# ALL_TEST_FILES collects all test files across all packages into one string.
if [[ -n "$CI" ]]; then
  # - "circleci tests glob" finds all test files.
  # - "circleci tests run" does two things:
  #   - It splits the test files across the number of available CircleCI executors, according to test durations recorded
  #     in previous runs.
  #   - It implements CircleCI's "rerun failed tests only" mechanism. If this is a rerun that has been started as
  #   "failed tests only", it will filter the tests, and only the failed tests from the previous run will end up in the
  #   resulting list. Otherwise (if this is not a rerun of failed tests), "circleci tests run" will not apply additional
  #   filtering beyond the spreading of tests across executors (see previous bullet point).
  circleci tests glob /home/circleci/repo/packages/**/test/**/*test.js | sed "/node_modules/d" | circleci tests run --command ">all_test_files.txt xargs echo" --verbose --split-by=timings --timings-type=filename

  if [[ -f all_test_files.txt ]]; then
    ALL_TEST_FILES=$(cat all_test_files.txt)
    if [[ -n $CI_GLOB_DEBUG ]]; then
      echo "All tests for this executor: $ALL_TEST_FILES"
    fi
  else
    # When this is a "rerun failed tests only" execution, there might not be _any_ tests for this executor.
    echo "No tests have been assigned to this executor."
    ALL_TEST_FILES=""
  fi
else
  cd `dirname $BASH_SOURCE`/..
  ALL_TEST_FILES=$(find ~+/packages/**/test -type f -name '*test.js' | sed "/node_modules/d")
fi

# The resulting list of tests in ALL_TEST_FILES from above has already been processed by CircleCI's mechanism to
# intelligently distributes tests across executors according to test suite durations from previous runs, as well as the
# "rerun failed tests only" mechanism, if applicable.,
#
# We still need to combine CircleCI's test filtering with our own monorepo setup though, that is, associate the files
# selected by CircleCI's splitting/rerunning logic for this exector with the
# Node.js package they belong to (core, collector, aws-lambda, ...). The following for-loop takes care of that. Once it
# has run, multiple CI_${package_name}_TEST_FILES environment variables are available which contain the test file names
# with the subset of test files for this executor for the respective package. Each CI_${package_name}_TEST_FILES can
# also be empty, if this executor did not get any tests from a particular package.
for package in packages/*/ ; do
  for test_file in $(echo $ALL_TEST_FILES | tr " " "\n")
  do
    if [[ "$test_file" == *"$package"* ]]; then
        files_for_current_package+=" ${test_file}"
    fi
  done

  package_name=${package#packages/}
  package_name=${package_name%/}
  package_name=${package_name//-/_}
  package_name="${package_name^^}"

  if [[ -n $CI_GLOB_DEBUG ]]; then
    echo "Declaring CI_${package_name}_TEST_FILES for $package, matched files: $files_for_current_package"
    echo
  fi

  declare CI_${package_name}_TEST_FILES="$(echo ${files_for_current_package})"
  export CI_${package_name}_TEST_FILES="$(echo ${files_for_current_package})"

  unset files_for_current_package
done
