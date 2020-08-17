#!/usr/bin/env bash

set -eo pipefail

cd `dirname $BASH_SOURCE`

if [[ ! -f .env ]]; then
  echo .env file is missing
  exit 1
fi
source .env

if [[ -z "${image_tag_prefix-}" ]]; then
  echo Please set image_tag_prefix in .env.
  exit 1
fi
if [[ -z "${container_name_prefix-}" ]]; then
  echo Please set container_name_prefix in .env.
  exit 1
fi

./build-and-push.sh local 12 standard
./build-and-push.sh local 12 alpine
./build-and-push.sh local 10 standard
./build-and-push.sh local 10 alpine
./build-and-push.sh local  8 standard
./build-and-push.sh local  8 alpine
./build-and-push.sh released 12 standard
./build-and-push.sh released 12 alpine
./build-and-push.sh released 10 standard
./build-and-push.sh released 10 alpine
./build-and-push.sh released  8 standard
./build-and-push.sh released  8 alpine

