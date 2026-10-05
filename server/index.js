const { default: config } = await import('./config.js').catch((err) => {
  console.error(err.message);
  process.exit(1);
});
const { createServer } = await import('./server.js');

for (const warning of config.warnings) console.warn(`Warning: ${warning}`);

const server = createServer();

server.listen(config.port, config.host, () => {
  console.log(`${config.name} listening on http://${config.host}:${config.port}`);
});

function shutdown() {
  server.close(() => process.exit(0));
  server.closeAllConnections();
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
