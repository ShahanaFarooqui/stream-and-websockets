const path = require("path");
const http = require('http');
const express = require("express");
const request = require('request-promise');
const WebSocket = require('ws');
var crypto = require('crypto');
let clients = [];

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

let sendEventsToAllSSEClients = (newMessage) => {
  clients.forEach(client => client.res.write('data: '+ JSON.stringify(newMessage) + '\n\n'));
};

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

let SSERoute = router.get('/events', (req, res, next) => {
  const headers = { 'Content-Type': 'text/event-stream', 'Connection': 'keep-alive', 'Cache-Control': 'no-cache' };
  res.writeHead(200, headers);

  const clientId = Date.now();
  const newClient = { id: clientId, res };
  clients.push(newClient);
  console.log('Connected: ' + clientId + ', Total SSE clients: ' + clients.length);

  req.on('close', () => {
    clients = clients.filter(client => client.id !== clientId);
    console.log('Disconnected: ' + clientId + ', Total SSE clients: ' + clients.length);
  });
});

app.use('/api/info', infoRoute);
app.use('/api/stream', SSERoute);

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
  socket.clientId = Date.now(); 
  console.log('Connected: ' + socket.clientId + ', Total WS clients: ' + webSocketServer.clients.size);
  socket.on('close', function() {
    console.log('Disconnected: ' + socket.clientId + ', Total WS clients: ' + webSocketServer.clients.size);
  });  
  socket.on('error', serverError => {
    console.log('Broadcasting error to clients...: ' + JSON.stringify(serverError));
    try {
      socket.send(JSON.stringify({error: (typeof serverError === 'string' ? serverError : JSON.stringify(serverError)) }));
    } catch (err) {
      console.log('Error while broadcasting error: ' + JSON.stringify(err));
    }
  });
});

let sendEventsToAllWSClients = (newMessage) => {
  webSocketServer.clients.forEach(client => {
    try {
      console.log('Broadcasting message to client...: ' + client.clientId);
      client.send(newMessage);
    } catch (err) {
      console.log('Error while broadcasting message: ' + JSON.stringify(err));
    }      
  });
};

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
    // sendEventsToAllWSClients(msg.data);
    webSocketServer.clients.forEach(client => {
      client.emit('error', msg.data);
    });
    sendEventsToAllSSEClients(msg.data);
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
