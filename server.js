const http = require('http');
const app = require('express')();
const request = require('request-promise');
const WebSocket = require('ws');
const router = require('express').Router();
var crypto = require('crypto');
const EventEmitter = require('events');
const SERVER_URL = 'http://localhost:9090';
const proxyEmitter = new EventEmitter();

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
  options.url = SERVER_URL + '/getinfo';
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
  proxyEmitter.on('message', data => {
    res.write('data: ' + data + '\n\n');
  });
});

app.use('/info', infoRoute);
app.use('/stream', streamRoute);

function authcheck() {
  return true;
}

function generateAcceptValue (acceptKey) {
  return crypto
  .createHash('sha1')
  .update(acceptKey + crypto.randomBytes(64).toString('hex'), 'binary')
  .digest('base64');
}

const webSocketServer = new WebSocket.Server({ noServer: true, path: '/ws', verifyClient: authcheck });

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
  webSocketServer.on('error', serverError => {
    console.log('Broadcasting Error to Clients...: ' + serverError);
    socket.send(typeof serverError === 'object' ? JSON.stringify(serverError) : Buffer.from(serverError));
  });
  webSocketServer.on('message', serverMessage => {
    console.log('Broadcasting Message to Clients...: ' + serverMessage);
    if (socket.readyState === 1) {
      socket.send(serverMessage);
    }
  });
  socket.on('message', clientMessage => {
    console.log('Received Message from the Client...: ' + clientMessage);
    webSocketServer.emit('message', clientMessage);
  });
});

const WS_LINK = 'ws://:test@localhost:9090/ws';
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
    webSocketServer.emit('message', msg.data);
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
