#!/bin/bash

ENV=$1
BASE_PATH="/var/node"
APP_PATH="$BASE_PATH/pagetty_$1"
SERVER_SCRIPT="server.js"
UPDATE_SCRIPT="update.js"

echo "================================================================================"
echo "                                                                                "
echo "PAGETTY RUN ENV: $ENV                                                           "
echo "                                                                                "
echo "================================================================================"

if [ "$1" = "" ]; then
  echo "Error: please specify an environment."
  exit 1;
fi

if [ ! -d "$APP_PATH" ]; then
  echo "Error: evorinment can not be found."
  exit 1;
fi

if [ ! -f "$APP_PATH/$SERVER_SCRIPT" ]; then
  echo "Error: server script not found."
  exit 1;
fi

if [ ! -f "$APP_PATH/$UPDATE_SCRIPT" ]; then
  echo "Error: update script not found."
  exit 1;
fi

forever stop "$APP_PATH/server.js"
forever stop "$APP_PATH/update.js"

if [ "$2" = "stop" ]; then
  sleep 1
  forever list
  exit 1;
fi

npm rebuild
export NODE_ENV="$ENV"
export NODE_CONFIG_DIR="$APP_PATH/config"

echo ""
echo "Forever processes"
echo "================================================================================"
forever -a -l "$APP_PATH/log/server.log" start "$APP_PATH/server.js"

if [ "$ENV" = "production" ]; then
  forever -a -l "$APP_PATH/log/server.log" start "$APP_PATH/update.js"
fi

sleep 1
forever list

echo ""
echo "Server log"
echo "================================================================================"
tail "$APP_PATH/log/server.log"

echo ""
echo "Output log"
echo "================================================================================"
tail "$APP_PATH/log/server.out.log"

echo ""
echo "Error log"
echo "================================================================================"
tail "$APP_PATH/log/server.err.log"
echo ""