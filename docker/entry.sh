#!/bin/sh
set -e

ntpd -s

# Run the web UI in the background so cron can run too.
node dist/app.js --web &

# Keep the container alive with cron in the foreground.
exec crond -f -d 8
