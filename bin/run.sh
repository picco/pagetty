#!/bin/bash

sudo iptables -t nat -A PREROUTING -p tcp --dport 80 -j REDIRECT --to-port 8080
sudo iptables -t nat -A PREROUTING -p tcp --dport 443 -j REDIRECT --to-port 8443

forever stopall
forever start -a -l /srv/pagetty/logs/app.log -o /srv/pagetty/logs/app.log -e /srv/pagetty/logs/app.log app.js
forever start -a -l /srv/pagetty/logs/crawler.log -o /srv/pagetty/logs/crawler.log -e /srv/pagetty/logs/crawler.log crawler.js
forever list
