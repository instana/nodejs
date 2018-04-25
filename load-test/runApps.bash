#!/bin/bash

set -eo pipefail

APP_PORT=7681 DOWNSTREAM_PORT=7682 APP_WORKERS=1 npm start &
trap "kill $!" EXIT SIGINT SIGTERM

APP_PORT=7682 APP_WORKERS=1 npm start
