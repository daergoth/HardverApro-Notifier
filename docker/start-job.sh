#!/bin/sh
ntpd -s
cd /usr/src/app && node dist/app.js
