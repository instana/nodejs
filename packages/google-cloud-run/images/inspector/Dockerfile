FROM node:12.18.3-alpine3.11
WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install --only=production

COPY . .

EXPOSE 8080

ENTRYPOINT [ "node", "." ]
