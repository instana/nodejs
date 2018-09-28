# Bare Jessie Node.js 10 image, using yarn.
# Native addons will work since the Jessie base image has all dependencies
# installed out of the box.

FROM node:10.10.0-jessie
WORKDIR /usr/src/app
RUN yarn global add node-gyp
RUN yarn
COPY . .
EXPOSE 3333
CMD [ "yarn", "start" ]
