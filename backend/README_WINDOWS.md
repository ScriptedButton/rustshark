# Windows Setup Guide for RustShark

This guide provides detailed instructions for setting up and running RustShark on Windows systems.

## Prerequisites

1. **Install Rust**

   - Download and install from [rustup.rs](https://rustup.rs/)
   - Follow the prompts to install the MSVC toolchain

2. **Install Npcap**

   - Download and install from [Npcap's official site](https://npcap.com/)
   - **IMPORTANT**: During installation, check these options:
     - "Install Npcap in WinPcap API-compatible Mode"
     - "Install Npcap service to start at boot time"
     - "Support raw 802.11 traffic (and monitor mode) for wireless adapters"

3. **Download Npcap SDK**
   - Download the SDK from [Npcap SDK](https://npcap.com/dist/npcap-sdk-1.13.zip)
   - Extract the downloaded zip file to a location on your computer

## Setup

1. **Create a lib directory in your project**

   ```
   mkdir lib
   ```

2. **Copy DLLs and lib files**

   - Copy these files from the Npcap SDK to your project's `lib` directory:
     - `Lib\x64\Packet.lib`
     - `Lib\x64\wpcap.lib`
   - Copy these files from either the SDK or from `C:\Windows\System32`:
     - `Packet.dll`
     - `wpcap.dll`

3. **Create a .cargo directory and config.toml**

   ```
   mkdir .cargo
   ```

4. **Create a config.toml file in the .cargo directory with:**
   ```toml
   [target.x86_64-pc-windows-msvc]
   rustflags = ["-L", "lib"]
   ```

## Building

```bash
cargo build
```

## Running

**IMPORTANT**: Always run as administrator on Windows to access network interfaces

### Option 1: Run from Command Prompt

1. Right-click on Command Prompt or PowerShell
2. Select "Run as administrator"
3. Navigate to your project directory
4. Run:
   ```
   cargo run
   ```

### Debugging Mode

For troubleshooting network interface issues, use the `--debug-windows` flag:

```
cargo run -- --debug-windows
```

This will output detailed information about your network adapters, Npcap service status, and permissions, which can help identify why interfaces aren't being detected.

### Option 2: Create a shortcut

1. Create a shortcut to `target\debug\rustshark.exe`
2. Right-click on the shortcut
3. Go to Properties
4. Click "Advanced"
5. Check "Run as administrator"
6. Click OK and apply changes

## Troubleshooting

### Empty Interface List

If the application shows no network interfaces:

1. **Run as Administrator**: This is the most common fix - Windows restricts access to network interfaces.

   ```
   Right-click on Command Prompt/PowerShell → "Run as administrator"
   ```

2. **Verify Npcap Installation**:

   ```powershell
   # Check if Npcap service is running
   Get-Service npcap

   # If not running, start it
   Start-Service npcap
   ```

3. **Add interfaces manually**: If the application UI shows no interfaces, you can specify one manually:

   ```
   cargo run -- --interface "\\Device\\NPF_{GUID}"
   ```

   Replace `{GUID}` with your adapter's GUID, which you can find by running:

   ```powershell
   Get-NetAdapter | Format-List InterfaceDescription, InterfaceGuid
   ```

4. **Reinstall Npcap**: Uninstall it completely first, then reinstall with all the recommended options checked.

5. **Check Windows Defender or other security software**: They might be blocking the interface detection.

### "STATUS_DLL_NOT_FOUND" Error

- Ensure both `wpcap.dll` and `Packet.dll` are in the same directory as your executable
- Try copying them from `C:\Windows\System32` to your `target\debug` directory

### No interfaces found

- Ensure Npcap is installed correctly
- Try running as administrator
- Check that the Windows firewall isn't blocking the application

### Empty packets or no data captured

- Make sure you have administrator privileges
- Verify that your network adapter supports promiscuous mode
- Try disabling antivirus or firewall temporarily (for testing only)

## Additional Notes

- Some wireless network adapters may have limited support for packet capture
- Virtual adapters (like VPNs) may not work with packet capture
- Npcap's WinPcap compatibility mode is required for most Rust pcap libraries to work correctly
