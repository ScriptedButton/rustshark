const { spawn } = require("child_process");
const path = require("path");
const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const fs = require("fs");

// Load configuration from .env file if it exists
require("dotenv").config({
  path: path.join(__dirname, "..", ".env"),
});

// Set development mode
const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

// Configuration with environment variable overrides
const FRONTEND_PORT = parseInt(process.env.FRONTEND_PORT || "3000", 10);
const BACKEND_PORT = parseInt(process.env.BACKEND_PORT || "8080", 10);
const DEFAULT_INTERFACE = process.env.DEFAULT_INTERFACE || null; // Will auto-detect if not specified

// Paths
const backendPath = path.join(__dirname, "..", "backend");
const configPath = path.join(__dirname, "..", "rustshark.config.json");

// Load configuration file if it exists
let config = {};
try {
  if (fs.existsSync(configPath)) {
    const configFile = fs.readFileSync(configPath, "utf8");
    config = JSON.parse(configFile);
    console.log("Loaded configuration from rustshark.config.json");
  }
} catch (error) {
  console.error("Error loading configuration file:", error.message);
}

// Function to get the network interface to use
async function getNetworkInterface() {
  // If specified in config or env, use that
  if (config.interface || DEFAULT_INTERFACE) {
    return config.interface || DEFAULT_INTERFACE;
  }

  // Otherwise try to auto-detect
  try {
    // First check if we can get the interface list from the backend
    // This would require the backend to be running with a special flag
    // For now, just return null and let the backend handle auto-detection
    return null;
  } catch (error) {
    console.warn("Could not auto-detect network interface:", error.message);
    return null;
  }
}

// Function to start the Rust backend
async function startRustBackend() {
  console.log(`Starting Rust backend on port ${BACKEND_PORT}...`);

  // Get the interface to use
  const networkInterface = await getNetworkInterface();

  // Prepare the arguments for the Rust backend
  const args = [
    "run",
    "--bin",
    "rustshark",
    "--",
    "--port",
    BACKEND_PORT.toString(),
  ];

  // Add interface if specified
  if (networkInterface) {
    args.push("--interface");
    args.push(networkInterface);
    console.log(`Using network interface: ${networkInterface}`);
  } else {
    console.log(
      "No specific network interface specified, backend will use default or auto-detect"
    );
  }

  // Use cargo run with configured port
  const rustProcess = spawn("cargo", args, {
    cwd: backendPath,
    stdio: "pipe", // Pipe the output so we can log it
    env: {
      ...process.env,
      PORT: BACKEND_PORT.toString(),
    },
  });

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
  .then(async () => {
    // Start the Rust backend
    const rustProcess = await startRustBackend();

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

        console.log("\n----------------------------------------");
        console.log("🚀 Rustshark is now running!");
        console.log("----------------------------------------");
        console.log(`📊 Dashboard: http://localhost:${FRONTEND_PORT}`);
        console.log(`🔌 Frontend: http://localhost:${FRONTEND_PORT}`);
        console.log(`🛠️  Backend API: http://localhost:${BACKEND_PORT}/api`);
        console.log("----------------------------------------\n");
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
