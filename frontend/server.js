const { spawn } = require("child_process");
const path = require("path");
const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");

// Set development mode
const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

// Configuration
const FRONTEND_PORT = 3000;
const BACKEND_PORT = 8080;

// Paths
const backendPath = path.join(__dirname, "..", "backend");

// Function to start the Rust backend
function startRustBackend() {
  console.log(`Starting Rust backend on port ${BACKEND_PORT}...`);

  // Use cargo run with port 8080
  const rustProcess = spawn(
    "cargo",
    [
      "run",
      "--",
      "--port",
      BACKEND_PORT.toString(),
      "--interface",
      "\\Device\\NPF_{B87B6B5D-08BE-44C4-BB4D-9BD86A469D07}",
    ],
    {
      cwd: backendPath,
      stdio: "pipe", // Pipe the output so we can log it
      env: {
        ...process.env,
        // Make sure we're using the correct port
        PORT: BACKEND_PORT.toString(),
      },
    }
  );

  // Log output from the Rust process
  rustProcess.stdout.on("data", (data) => {
    console.log(`[BACKEND]: ${data.toString().trim()}`);
  });

  rustProcess.stderr.on("data", (data) => {
    console.error(`[BACKEND ERROR]: ${data.toString().trim()}`);
  });

  // Handle exit
  rustProcess.on("close", (code) => {
    if (code !== 0 && code !== null) {
      console.error(`Rust backend exited with code ${code}`);
      console.log("Restarting Rust backend in 5 seconds...");
      setTimeout(startRustBackend, 5000);
    }
  });

  // Give the backend a moment to start
  console.log("Waiting for backend to initialize...");

  return rustProcess;
}

// Function to handle cleanup when the server stops
function cleanup(rustProcess) {
  console.log("Shutting down servers...");
  if (rustProcess) {
    rustProcess.kill();
  }
  process.exit(0);
}

// Start the Next.js app
app
  .prepare()
  .then(() => {
    // Start the Rust backend
    const rustProcess = startRustBackend();

    // Add a small delay to ensure the backend is running before starting the frontend
    setTimeout(() => {
      // Create the Next.js server
      const server = createServer(async (req, res) => {
        try {
          const parsedUrl = parse(req.url, true);
          await handle(req, res, parsedUrl);
        } catch (err) {
          console.error("Error handling request:", err);
          res.statusCode = 500;
          res.end("Internal Server Error");
        }
      });

      // Start the server
      server.listen(FRONTEND_PORT, (err) => {
        if (err) throw err;
        console.log(`> Frontend ready on http://localhost:${FRONTEND_PORT}`);
        console.log(`> Backend running on http://localhost:${BACKEND_PORT}`);
        console.log(
          `> Access the dashboard at http://localhost:${FRONTEND_PORT}`
        );
      });

      // Handle process termination
      process.on("SIGINT", () => cleanup(rustProcess));
      process.on("SIGTERM", () => cleanup(rustProcess));
    }, 2000); // Give the backend 2 seconds to start up
  })
  .catch((err) => {
    console.error("Error starting server:", err);
    process.exit(1);
  });
