FROM node:14

WORKDIR /usr/src/app

COPY package.json ./
COPY app.js ./
RUN npm install

# Use this to play with native add-ons.
# RUN rm -rf node_modules/event-loop-stats

EXPOSE 3022

CMD [ "npm", "start" ]
