#!/usr/bin/env bash

set -eo pipefail

# Remark: You will need to change the domain in two places (subj and config/subjectAltName) if the app is deployed on a
# different server. If you want to access the app in your browser you also need to add the cert to your trusted certs
# locally:

# 1. Open the app "Keychain Access"
# 2. drag your certificate from Finder into Keychain Access,
# 3. go into the certificates section and locate the certificate you just added,
# 4. double click it, enter the trust section and under “When using this certificate” select “Always Trust”.

openssl req \
  -newkey rsa:2048 \
  -x509 \
  -nodes \
  -keyout key \
  -new \
  -out cert \
  -subj /CN=ec2-3-15-208-8.us-east-2.compute.amazonaws.com \
  -reqexts SAN \
  -extensions SAN \
  -config <(cat /System/Library/OpenSSL/openssl.cnf \
      <(printf '[SAN]\nsubjectAltName=DNS:ec2-3-15-208-8.us-east-2.compute.amazonaws.com')) \
  -sha256 \
  -days 3650

echo "Created a new certificate with the following details: "
openssl x509 -in cert -noout -text
