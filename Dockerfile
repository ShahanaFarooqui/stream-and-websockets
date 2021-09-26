# docker build -t stream:0.0 .
# docker run --env-file=.env -p 5005:5000 stream:0.0
# Open at http://localhost:5005/

FROM node:16-alpine

RUN apk add --no-cache tini

WORKDIR /stream

COPY package.json /stream/package.json
COPY package-lock.json /stream/package-lock.json

# Install dependencies
RUN npm install --production

COPY . /stream

EXPOSE 5000

ENTRYPOINT ["/sbin/tini", "-g", "--"]

CMD ["node", "server"]
