# docker build -t stream:0.0 .
# docker run --env-file=.env -p 5005:5000 stream:0.0
# Open at http://localhost:5005/root/

# ====START WITHOUT NGINX==============================================

# FROM node:16-alpine

# RUN apk add --no-cache tini

# WORKDIR /stream

# COPY package.json /stream/package.json
# COPY package-lock.json /stream/package-lock.json

# RUN npm install --production

# COPY . /stream

# EXPOSE 5000

# ENTRYPOINT ["/sbin/tini", "-g", "--"]

# CMD ["node", "server"]

# ====END WITHOUT NGINX================================================

# ====START WITH NGINX=================================================
# Step 1
FROM node:latest

WORKDIR /usr/local/app

COPY package.json /usr/local/app/package.json
COPY package-lock.json /usr/local/app/package-lock.json

RUN npm install --production

COPY ./ /usr/local/app/

# Step 2
FROM nginx:latest

RUN rm -rf ./usr/share/nginx/html

COPY . /usr/share/nginx/html

EXPOSE 80
# EXPOSE 5000

CMD ["node", "server"]

# ====END WITH NGINX=================================================