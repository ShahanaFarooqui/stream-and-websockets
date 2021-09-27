const path = require("path");
const http = require('http');
const express = require("express");
const request = require('request-promise');
const WebSocket = require('ws');
var crypto = require('crypto');
const EventEmitter = require('events');
const proxyEmitter = new EventEmitter();

const app = express();
const router = require('express').Router();

let SERVER_URL = '';

if (process.env.LN_SERVER_URL && process.env.LN_SERVER_URL.trim() !== '') {
  SERVER_URL = process.env.LN_SERVER_URL;
} else {
  SERVER_URL = 'localhost:9090';
}
console.warn(SERVER_URL);

const options = {
  rejectUnauthorized: false,
  json: true,
  headers: { 'authorization': 'Basic OnRlc3Q=' }
};

const onError = error => { console.error('DEFUALT ERROR'); throw error; };
const onListening = () => { console.log('Server is up and running, please open the UI at http://localhost:5000'); };

const server = http.createServer(app);
server.on('error', onError);
server.on('listening', onListening);
server.listen(5000);

app.use((req, res, next) => {
  res.setHeader( 'Access-Control-Allow-Origin', '*' );
  res.setHeader( 'Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, filePath' );
  res.setHeader( 'Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS' );
  next();
});

let infoRoute = router.get('/', (req, res, next) => {
  options.url = 'http://' + SERVER_URL + '/getinfo';
  request.post(options).then((body) => {
    res.status(200).json(body);
  })
  .catch(errRes => {
    console.log('ERROR: ' + JSON.stringify(errRes));
    res.status(500).json(errRes);
  });
});

let streamRoute = router.get('/stream', (req, res, next) => {
  res.set({ 'Cache-Control': 'no-cache', 'Content-Type': 'text/event-stream', 'Connection': 'keep-alive' });
  function sendMessage(msg) {
    console.log('Stream Message...');
    res.write('data: ' + msg + '\n\n');
  }
  proxyEmitter.on('message', sendMessage);

  req.on('close', function(){
    console.log('Disconnected Event from the Client.');
    proxyEmitter.removeListener('message', sendMessage);
  });
});

app.use('/root/api/info', infoRoute);
app.use('/root/api/stream', streamRoute);

app.use('/root/', express.static(path.join(__dirname, "dist")));
app.use((req, res, next) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

function authcheck() {
  return true;
}

function generateAcceptValue (acceptKey) {
  return crypto
  .createHash('sha1')
  .update(acceptKey + crypto.randomBytes(64).toString('hex'), 'binary')
  .digest('base64');
}

const webSocketServer = new WebSocket.Server({ noServer: true, path: '/api/ws', verifyClient: authcheck });

server.on('upgrade', (request, socket, head) => {
  if (request.headers['upgrade'] !== 'websocket') {
    socket.end('HTTP/1.1 400 Bad Request');
    return;
  }
  const acceptKey = request.headers['sec-websocket-key']; 
  const hash = generateAcceptValue(acceptKey); 
  const responseHeaders = [ 'HTTP/1.1 101 Web Socket Protocol Handshake', 'Upgrade: WebSocket', 'Connection: Upgrade', `Sec-WebSocket-Accept: ${hash}` ]; 
  const protocol = request.headers['sec-websocket-protocol'];
  const protocols = !protocol ? [] : protocol.split(',').map(s => s.trim());
  if (protocols.includes('json')) { responseHeaders.push(`Sec-WebSocket-Protocol: json`); }  
  webSocketServer.handleUpgrade(request, socket, head, socket => {
    webSocketServer.emit('connection', socket, request);
  });
});

webSocketServer.on('connection', socket => {
  console.log('Connected with the Client...: ' + webSocketServer.clients.size);
  socket.on('close', function() {
    console.log('Disconnected with the Client...: ' + webSocketServer.clients.size);
  });  
  socket.on('error', serverError => {
    console.log('Broadcasting Error to Clients...: ' + JSON.stringify(serverError));
    try {
      socket.send(typeof serverError === 'object' ? JSON.stringify(serverError) : Buffer.from(serverError));
    } catch (err) {
      console.log('Error while Broadcasting Error: ' + JSON.stringify(err));
    }
  });
  socket.on('message', serverMessage => {
    console.log('Broadcasting Message to Clients...: ' + serverMessage);
    try {
      socket.send(serverMessage);
    } catch (err) {
      console.log('Error while Broadcasting Message: ' + JSON.stringify(err));
    }
  });
});

const WS_LINK = 'ws://:test@' + SERVER_URL + '/ws';
var waitTime = 0.5;
var reconnectTimeOut = null;

const reconnet = function() {
  if (reconnectTimeOut) { return; }
  waitTime = (waitTime >= 16) ? 16 : (waitTime * 2);  
  reconnectTimeOut = setTimeout(() => {
    console.log('Reconnecting...');
    connect();
    reconnectTimeOut = null;
  }, waitTime * 1000);
}

function connect() {
  var webSocketClient = new WebSocket(WS_LINK);

  webSocketClient.onopen = function() {
    console.log('Web socket connected');
    waitTime = 0.5;
  };

  webSocketClient.onmessage = function(msg) {
    console.log('Received Message from LNP Web Socket...');
    console.log(msg.data);
    webSocketServer.clients.forEach(client => {
      try {
        client.send(msg.data);
      } catch (err) {
        console.log('Error while Broadcasting Error: ' + JSON.stringify(err));
      }      
    });
    proxyEmitter.emit('message', msg.data);
    return false;
  };

  webSocketClient.onclose = function(e) {
    console.error('Web socket disconnected, will reconnect again...');
    reconnet();
  };

  webSocketClient.onerror = function(err) {
    console.error('Web socket error: ', err.error);
    webSocketServer.emit('error', err.error);
    reconnet();
  };

}

connect();
