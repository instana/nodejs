#!/usr/bin/env bash
set -eEuo pipefail
#######################################
# (c) Copyright IBM Corp. 2021
# (c) Copyright Instana Inc. and contributors 2019
#######################################

cd $(dirname $BASH_SOURCE)

openssl genrsa -des3 -passout pass:x -out server.pass.key 4096
openssl rsa -passin pass:x -in server.pass.key -out server.key
rm server.pass.key
openssl req -new -key server.key -subj "/C=DE/ST=NRW/O=Instana, Inc./OU=Engineering/CN=instana.com" -out server.csr
openssl x509 -req -sha256 -days 36500 -in server.csr -signkey server.key -out server.crt
