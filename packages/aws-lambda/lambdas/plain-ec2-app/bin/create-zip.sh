#!/usr/bin/env bash
set -eEuo pipefail
#######################################
# (c) Copyright IBM Corp. 2021
# (c) Copyright Instana Inc. 2019
#######################################


cd `dirname $BASH_SOURCE`/..

name=demo-ec2-app
echo "creating $name.zip"
rm -f $name.zip
mkdir -p ../zip
rm -f ../zip/$name.zip
rm -rf node_modules
zip -qr $name . -x bin/create-zip.sh -x \*.env -x \*.gitignore -x \*.swp -x node_modules/*
mv $name.zip ../zip

