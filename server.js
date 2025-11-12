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
    
    // Trigger initialization via Next.js API route after server is ready
    // This ensures the server is listening and Next.js modules are available
    setTimeout(() => {
      // Call the init API route to trigger initialization
      // This uses Next.js's module system which properly handles TypeScript
      fetch(`http://localhost:${port}/api/init`)
        .then(() => {
          console.log('[Server] ✅ Initialization triggered via API route');
        })
        .catch((error) => {
          // Log but don't crash - initialization will happen when API route is first accessed
          console.log('[Server] ⚠️  Could not trigger init via API (will initialize on first API call):', error.message);
        });
    }, 3000); // Wait 3 seconds after server starts to ensure Next.js is fully ready
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

