ARG NODEJS_VERSION
FROM node:${NODEJS_VERSION}-alpine

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install --only=production

COPY . .

EXPOSE 3000
EXPOSE 3001

ENTRYPOINT [ "node", "." ]
