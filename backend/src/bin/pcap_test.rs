use std::env;
use pcap::{Device, Capture, Active, DeviceFlags};

fn main() {
    println!("PCap Test Application");
    println!("This tests basic pcap functionality on your system");
    
    // Get interface name from command line or use a default
    let interface_name = env::args().nth(1).unwrap_or_else(|| {
        println!("No interface specified, listing available interfaces:");
        match Device::list() {
            Ok(devices) => {
                for (i, device) in devices.iter().enumerate() {
                    println!("  {}: {} - {}", i, device.name, device.desc.as_deref().unwrap_or("No description"));
                }
                if devices.is_empty() {
                    panic!("No capture devices found!");
                }
                println!("Using first interface by default");
                devices[0].name.clone()
            },
            Err(e) => {
                panic!("Failed to list devices: {}", e);
            }
        }
    });
    
    println!("Testing capture on interface: {}", interface_name);
    
    // Create a simple device
    let device = Device {
        name: interface_name,
        desc: None,
        addresses: Vec::new(),
        flags: DeviceFlags::empty()
    };
    
    println!("Creating capture...");
    match Capture::from_device(device) {
        Ok(capture) => {
            println!("Setting parameters...");
            let capture = capture
                .promisc(true)
                .snaplen(65535)
                .timeout(1000);
            
            println!("Opening capture...");
            match capture.open() {
                Ok(mut active_capture) => {
                    println!("Capture successfully opened!");
                    println!("Capturing 3 packets...");
                    
                    for i in 0..3 {
                        println!("Waiting for packet {}...", i+1);
                        match active_capture.next_packet() {
                            Ok(packet) => {
                                println!("Received packet: {} bytes", packet.data.len());
                            },
                            Err(e) => {
                                println!("Error capturing packet: {}", e);
                            }
                        }
                    }
                    
                    println!("Test completed successfully!");
                },
                Err(e) => {
                    println!("Failed to open capture: {}", e);
                }
            }
        },
        Err(e) => {
            println!("Failed to create capture: {}", e);
        }
    }
} 