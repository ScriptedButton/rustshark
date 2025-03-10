# RustShark

A network packet capture and analysis tool built in Rust, inspired by Wireshark, with a REST API for data interaction.

## Features

- Capture and analyze network packets in real-time
- Filter packets based on various criteria (protocol, source/destination, ports, etc.)
- View packet details including headers, payload, and metadata
- REST API for interacting with captured data
- Save and load packet captures

## Prerequisites

- Rust and Cargo (latest stable version)
- libpcap development libraries:
  - On Debian/Ubuntu: `sudo apt install libpcap-dev`
  - On macOS: `brew install libpcap`
  - On Windows: Install [Npcap](https://npcap.com/) and its SDK

## Building

```bash
cargo build --release
```

## Running

```bash
# Run with default settings
cargo run --release

# Specify network interface
cargo run --release -- --interface eth0

# Run with specific options
cargo run --release -- --interface eth0 --promiscuous --port 8080
```

**Note**: Running packet capture typically requires elevated privileges:

- Linux/macOS: `sudo target/release/rustshark`
- Windows: Run as Administrator

## REST API Endpoints

The API server runs on `http://localhost:3000` by default.

### Capture Management

- `GET /api/interfaces` - List available network interfaces
- `POST /api/capture/start` - Start a capture session
- `POST /api/capture/stop` - Stop the current capture
- `GET /api/capture/status` - Get status of the current capture

### Packet Data

- `GET /api/packets` - List captured packets (with pagination)
- `GET /api/packets/{id}` - Get detailed information about a specific packet
- `GET /api/packets/stats` - Get statistics about captured packets
- `GET /api/packets/filter?query={filter}` - Get packets matching filter

### Filters

- `POST /api/filters` - Create a new filter
- `GET /api/filters` - List available filters
- `PUT /api/filters/{id}` - Update a filter
- `DELETE /api/filters/{id}` - Delete a filter

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
