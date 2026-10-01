import { createServer } from './server.js';
import config from './config.js';

const server = createServer();

server.listen(config.port, config.host, () => {
  console.log(`cable in ascolto su http://${config.host}:${config.port}`);
});

function shutdown() {
  server.close(() => process.exit(0));
  server.closeAllConnections();
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
