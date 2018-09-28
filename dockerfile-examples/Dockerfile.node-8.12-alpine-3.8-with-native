# An Alpine image with additional Alpine packages, so native addons can
# be compiled via node-gyp.

FROM node:8.12.0-alpine
WORKDIR /usr/src/app
COPY package*.json ./
RUN apk add --no-cache --virtual .gyp \
        build-base \
        python \
    && npm install --only=production \
    && apk del .gyp
COPY . .
EXPOSE 3333
CMD [ "npm", "start" ]
