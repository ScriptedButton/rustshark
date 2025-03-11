# Rustshark

A packet capture and analysis tool built with Rust and Next.js.

![Rustshark Logo](https://via.placeholder.com/800x400/4285f4/ffffff?text=Rustshark)

## Overview

Rustshark is a network packet capture and analysis tool that provides a modern web interface for capturing, analyzing, and visualizing network traffic. It combines the speed and efficiency of Rust for packet processing with the flexibility and ease of use of a web-based UI built with Next.js.

## Features

- 🔍 Real-time packet capture and analysis
- 📊 Detailed packet information display
- 📈 Traffic visualization and statistics
- 🔎 Advanced filtering capabilities
- 💾 Save and load packet captures
- 🌐 Cross-platform support (Windows, macOS, Linux)

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) (v14 or higher)
- [npm](https://www.npmjs.com/) or [yarn](https://yarnpkg.com/)
- [Rust](https://www.rust-lang.org/tools/install) (for backend development)
- Admin/root privileges (for network capture features)

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/yourusername/rustshark.git
   cd rustshark
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Build the backend (required for packet capture):
   ```bash
   cargo build --release
   ```

### Running the Application

#### Using the Launcher Scripts

We provide convenient launcher scripts for both Windows and Unix-like systems:

**On Windows:**

```bash
.\rustshark.bat
```

**On macOS/Linux:**

```bash
./rustshark.sh
```

#### Command-line Options

Both launcher scripts support the following options:

- `quick` or `run`: Start both frontend and backend
- `frontend`: Start only the frontend
- `backend`: Start only the backend
- `build`: Build the frontend
- `config`: Edit configuration

Example:

```bash
# Windows
.\rustshark.bat quick

# macOS/Linux
./rustshark.sh quick
```

#### Manual Start

You can also use the Node.js launcher directly:

```bash
node start.js
```

Or start components individually:

```bash
# Start frontend
cd frontend
npm run dev

# Start backend
cargo run --release
```

## Configuration

The application can be configured using:

1. Environment variables in `.env` file
2. Configuration file at `rustshark.config.json`

Key configuration options:

- `FRONTEND_PORT`: Port for the web interface (default: 3000)
- `BACKEND_PORT`: Port for the Rust backend (default: 3001)
- `NODE_ENV`: Environment mode (development or production)

## Development

### Project Structure

```
rustshark/
├── frontend/           # Next.js frontend
│   ├── components/     # React components
│   ├── pages/          # Next.js pages
│   ├── public/         # Static assets
│   └── styles/         # CSS styles
├── src/                # Rust backend
│   ├── capture/        # Packet capture logic
│   ├── analysis/       # Packet analysis modules
│   └── api/            # API endpoints
├── rustshark.sh        # Unix launcher script
├── rustshark.bat       # Windows launcher script
└── start.js            # Node.js launcher script
```

### Building for Production

1. Build the frontend:

   ```bash
   cd frontend
   npm run build
   ```

2. Build the backend:
   ```bash
   cargo build --release
   ```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- [libpnet](https://github.com/libpnet/libpnet) for packet processing
- [Next.js](https://nextjs.org/) for the frontend framework
- [React](https://reactjs.org/) for the UI components
