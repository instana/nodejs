#!/bin/bash

npmVersion=$(cat .npm)
echo "Installing NPM version $npmVersion"
npm install -g npm@$npmVersion
