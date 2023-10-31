FROM node:20-alpine3.17

RUN apk update && apk add bash curl

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install --only=production

COPY *.js .

EXPOSE 3000
EXPOSE 3001

ENTRYPOINT [ "node", "." ]
