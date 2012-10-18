#!/bin/bash
forever start -a -l >(logger -t forever) -o >(logger -t app.js) -e >(logger -t app.js) app.js
forever start -a -l >(logger -t forever) -o >(logger -t crawler.js) -e >(logger -t crawler.js) crawler.js