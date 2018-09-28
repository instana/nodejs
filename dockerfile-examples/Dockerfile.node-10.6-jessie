# Bare Jessie Node.js 10 image.
# Native addons will work since the Jessie base image has all dependencies
# installed out of the box.

FROM node:10.6.0
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install --only=production
COPY . .
EXPOSE 3333
CMD [ "npm", "start" ]
