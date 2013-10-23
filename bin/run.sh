#!/bin/bash

forever stopall
forever start -a -l /srv/pagetty/logs/app.log -o /srv/pagetty/logs/app.log -e /srv/pagetty/logs/app.log app.js
forever start -a -l /srv/pagetty/logs/crawler.log -o /srv/pagetty/logs/crawler.log -e /srv/pagetty/logs/crawler.log crawler.js
forever list
