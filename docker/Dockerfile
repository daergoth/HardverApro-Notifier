FROM node:20-alpine AS build

WORKDIR /usr/src/app

COPY package*.json ./
COPY tsconfig.json ./
RUN npm install

COPY src/ src/
RUN cp src/config-example.json src/config.json
RUN npm run tsc

FROM node:20-alpine

# Port
EXPOSE 3000

# Env
ENV TIME_ZONE=Europe/Budapest
ENV ENV_NAME=dev
ENV EGG_SERVER_ENV=dev
ENV NODE_ENV=dev
ENV NODE_CONFIG_ENV=dev
# Path to an optional external config file that overrides values from src/config.json
ENV CONFIG_FILE_PATH=/usr/src/app/config/config.override.json

# Set the time and timezone in docker
RUN apk --update add tzdata openntpd \
  && cp /usr/share/zoneinfo/Europe/Budapest /etc/localtime \
  && echo "Europe/Budapest" > /etc/timezone

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install --omit=dev

COPY --from=build /usr/src/app/dist ./dist
COPY src/ ./src/
COPY --from=build /usr/src/app/src/config.json ./src/config.json

# copy crontabs and entry scripts
COPY docker/crontab.txt /etc/crontabs/root
COPY docker/start-job.sh ./
COPY docker/entry.sh ./
RUN chmod 755 start-job.sh entry.sh

# start crond with log level 8 in foreground, output to stderr
CMD ["./entry.sh"]
