FROM node:20

WORKDIR /usr/src/app

COPY package.json ./
COPY app.js ./
RUN npm install

EXPOSE 3022

CMD [ "npm", "start" ]
