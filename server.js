// Production server script that respects PORT environment variable
const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');

// Note: Initialization happens via app/layout.tsx which imports @/lib/init
// This ensures TypeScript files are properly compiled by Next.js

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = process.env.PORT || 3001;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Set a timeout for app preparation to avoid hanging
const PREPARE_TIMEOUT = 60000; // 60 seconds
let prepareTimeout;

prepareTimeout = setTimeout(() => {
  console.error('App preparation timeout - exiting');
  process.exit(1);
}, PREPARE_TIMEOUT);

app.prepare().then(() => {
  // Clear timeout since preparation succeeded
  clearTimeout(prepareTimeout);
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  });

  server.listen(port, hostname, (err) => {
    if (err) {
      console.error('Failed to start server:', err);
      process.exit(1);
    }
    console.log(`> Ready on http://${hostname}:${port}`);
    console.log(`> Environment: ${dev ? 'development' : 'production'}`);
    
    // Import init after server is ready to ensure non-blocking initialization
    // This ensures the server is listening before background tasks start
    setTimeout(() => {
      try {
        require('./lib/init');
      } catch (error) {
        console.error('[Server] ❌ Failed to load init module:', error);
        // Don't exit - server should continue running even if init fails
      }
    }, 1000); // Wait 1 second after server starts
  });

  // Handle graceful shutdown
  process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully...');
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully...');
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });
}).catch((err) => {
  clearTimeout(prepareTimeout);
  console.error('Failed to prepare Next.js app:', err);
  process.exit(1);
});

