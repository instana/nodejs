#######################################
# (c) Copyright IBM Corp. 2022
#######################################

shopt -s globstar
files=$(circleci tests glob /home/circleci/repo/packages/**/test/**/*test.js | sed "/node_modules/d" | circleci tests split --split-by=timings --timings-type=filename)
#files="packages/core/test/util/compression_test.js packages/collector/test/actions/source_test.js packages/core/test/util/slidingWindow_test.js packages/shared-metrics/test/util/DependencyDistanceCalculator_te$

for package in packages/*/ ; do
  for i in $(echo $files | tr " " "\n")
  do
    if [[ "$i" == *"$package"* ]]; then
        y+=" ${i}"
    fi
  done

  echo $package
  echo "Files matched: $y"

  package_name=${package#packages/}
  package_name=${package_name%/}
  package_name=${package_name//-/_}
  package_name="${package_name^^}"

  echo CI_${package_name}_TEST_FILES
  declare CI_${package_name}_TEST_FILES="$(echo ${y})"
  export CI_${package_name}_TEST_FILES="$(echo ${y})"

  unset y
done