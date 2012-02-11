#!/bin/bash

ENVIRONMENT=$1
BASE_PATH="/var/node"
APP_PATH="$BASE_PATH/pagetty_$1"

if [ "$1" == "" ]; then
  echo "Error: please specify an environment."
  exit 1;
fi

echo "Initializing pagetty instace..."

echo "Stopping running forever scripts..."
forever stop "$APP_PATH/server.js"
forever stop "$APP_PATH/update.js"

echo "Rebuilding npm..."
#npm rebuild

echo "Checking out forever..."
#forever list

echo $APP_PATH
