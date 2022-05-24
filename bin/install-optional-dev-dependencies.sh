#!/usr/bin/env bash

#######################################
# (c) Copyright IBM Corp. 2022
#######################################

# NPM does not offer optional dev dependencies, see https://github.com/npm/npm/issues/3870
# When using optional dependencies, they are counted as "prod" dependency.
# We run really quickly into audit errors for older packages.
# This is our own implementation of having "optionalDevDependencies".
# Requirement: cut, grep@3, jq, node, npm

set -eo pipefail

cd `dirname $BASH_SOURCE`/..

commands=$(jq -r '.optionalDevDependencies | to_entries[] | "npm install --save-dev \(.key)@\(.value.version)#\(.value.engine),"' ./package.json)
IFS=$',';

# We need to reset the json file because otherwise NPM will add the dependencies.
cp package.json package.json.tmp

for cmd in $commands; do
    engine=$(echo "$cmd" | grep -Eo "#(.*)"| cut -d# -f2)
    cmd=$(echo "$cmd" | grep -o "^.*#" | cut -d# -f1)
    nodeversion=$(node -v | grep -o "v[0-9][0-9]" | cut -dv -f2)
    enginecheck="$nodeversion $engine"
    result=$(echo $(( $enginecheck )))

    if [ ! $result -eq 0 ]; then
        echo "Executing $cmd..."
        eval $cmd || true
    fi
done

mv package.json.tmp package.json
