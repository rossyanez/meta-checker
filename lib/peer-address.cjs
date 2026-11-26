// Preload: node -r ./lib/peer-address.cjs server.js
// Stamps every request with the address of the socket it came in on, overwriting any value the client sent.
// Next only fills X-Forwarded-For with that address when the client sent none, so without this a visitor
// who sends their own X-Forwarded-For hides their address from the rate limit.
const http = require('node:http')

const HEADER = 'x-meta-checker-peer'
const emit = http.Server.prototype.emit

http.Server.prototype.emit = function (event, req, ...rest) {
  if (event === 'request') {
    const peer = req.socket.remoteAddress
    if (peer) req.headers[HEADER] = peer
    else delete req.headers[HEADER]
  }
  return emit.call(this, event, req, ...rest)
}
