FROM node:${NODEJS_VERSION}-alpine
WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install --only=production

COPY . .

EXPOSE 8080

ENTRYPOINT [ "node", "." ]
