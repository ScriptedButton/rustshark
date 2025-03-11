#!/usr/bin/env node

const { spawn } = require("child_process");
const readline = require("readline");
const path = require("path");
const fs = require("fs");

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// ANSI color codes for terminal output
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  red: "\x1b[31m",
};

// Check for command line arguments
const args = process.argv.slice(2);
if (args.length > 0) {
  // Handle command line arguments
  switch (args[0]) {
    case "quick":
      startFullApp();
      break;
    case "frontend":
      startFrontend();
      break;
    case "backend":
      startBackend();
      break;
    case "build":
      buildFrontend();
      break;
    case "config":
      editConfig();
      break;
    default:
      // Show menu for unknown arguments
      showMenu();
      break;
  }
} else {
  // No arguments, show the menu
  // Print welcome message
  console.log(`
${colors.bright}${colors.cyan}=======================================
        RUSTSHARK LAUNCHER
=======================================
A packet capture and analysis tool
=======================================
${colors.reset}
`);
  showMenu();
}

// Display menu
function showMenu() {
  console.log(`${colors.bright}Choose an option:${colors.reset}`);
  console.log(
    `${colors.green}1.${colors.reset} Start Full Application (Frontend & Backend)`
  );
  console.log(`${colors.green}2.${colors.reset} Start Frontend Only`);
  console.log(`${colors.green}3.${colors.reset} Start Backend Only`);
  console.log(`${colors.green}4.${colors.reset} Build Frontend`);
  console.log(`${colors.green}5.${colors.reset} Edit Configuration`);
  console.log(`${colors.green}6.${colors.reset} Exit`);

  rl.question(
    `\n${colors.yellow}Enter your choice (1-6):${colors.reset} `,
    (answer) => {
      switch (answer.trim()) {
        case "1":
          startFullApp();
          break;
        case "2":
          startFrontend();
          break;
        case "3":
          startBackend();
          break;
        case "4":
          buildFrontend();
          break;
        case "5":
          editConfig();
          break;
        case "6":
          console.log(`${colors.blue}Goodbye!${colors.reset}`);
          rl.close();
          break;
        default:
          console.log(
            `${colors.red}Invalid option. Please try again.${colors.reset}\n`
          );
          showMenu();
          break;
      }
    }
  );
}

// Function to run a command
function runCommand(command, args, cwd = process.cwd()) {
  const childProcess = spawn(command, args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  childProcess.on("error", (error) => {
    console.error(
      `${colors.red}Error executing command:${colors.reset}`,
      error.message
    );
  });

  return childProcess;
}

// Start full application
function startFullApp() {
  console.log(
    `${colors.blue}Starting full application (Frontend & Backend)...${colors.reset}`
  );

  const frontendDir = path.join(__dirname, "frontend");

  // Check if we should use npm or yarn
  const useYarn = fs.existsSync(path.join(frontendDir, "yarn.lock"));
  const command = useYarn ? "yarn" : "npm";

  runCommand(command, ["run", "dev:integrated"], frontendDir);
}

// Start frontend only
function startFrontend() {
  console.log(`${colors.blue}Starting frontend only...${colors.reset}`);

  const frontendDir = path.join(__dirname, "frontend");
  const useYarn = fs.existsSync(path.join(frontendDir, "yarn.lock"));
  const command = useYarn ? "yarn" : "npm";

  runCommand(command, ["run", "dev"], frontendDir);
}

// Start backend only
function startBackend() {
  console.log(`${colors.blue}Starting backend only...${colors.reset}`);

  const backendDir = path.join(__dirname, "backend");
  runCommand("cargo", ["run"], backendDir);
}

// Build frontend
function buildFrontend() {
  console.log(`${colors.blue}Building frontend...${colors.reset}`);

  const frontendDir = path.join(__dirname, "frontend");
  const useYarn = fs.existsSync(path.join(frontendDir, "yarn.lock"));
  const command = useYarn ? "yarn" : "npm";

  const buildProcess = runCommand(command, ["run", "build"], frontendDir);

  buildProcess.on("close", (code) => {
    if (code === 0) {
      console.log(
        `${colors.green}Build completed successfully!${colors.reset}`
      );
    } else {
      console.log(`${colors.red}Build failed with code ${code}${colors.reset}`);
    }

    // Return to menu after build completes
    console.log("\n");
    showMenu();
  });

  return; // Don't show menu immediately for build
}

// Edit configuration
function editConfig() {
  console.log(`${colors.blue}Opening configuration file...${colors.reset}`);

  const configPath = path.join(__dirname, "rustshark.config.json");

  // Check if config file exists, create it if not
  if (!fs.existsSync(configPath)) {
    const defaultConfig = {
      interface: null,
      frontend: { port: 3000 },
      backend: { port: 8080, autostart: true },
      capture: { promiscuous: true, buffer_size: 10000 },
    };

    fs.writeFileSync(
      configPath,
      JSON.stringify(defaultConfig, null, 2),
      "utf8"
    );
    console.log(
      `${colors.green}Created new configuration file.${colors.reset}`
    );
  }

  // Open with default editor or print path
  let editorCmd;
  if (process.platform === "win32") {
    editorCmd = "notepad";
  } else if (process.env.EDITOR) {
    editorCmd = process.env.EDITOR;
  } else {
    editorCmd = "nano";
  }

  try {
    runCommand(editorCmd, [configPath]);
    console.log(
      `${colors.green}Opening ${configPath} with ${editorCmd}${colors.reset}`
    );
  } catch (err) {
    console.log(
      `${colors.red}Could not open editor. Please edit manually at: ${configPath}${colors.reset}`
    );
  }

  // Return to menu after a short delay
  setTimeout(() => {
    console.log("\n");
    showMenu();
  }, 1000);

  return; // Don't show menu immediately
}

// Handle CTRL+C
process.on("SIGINT", () => {
  console.log(`\n${colors.blue}Exiting Rustshark Launcher...${colors.reset}`);
  rl.close();
});
