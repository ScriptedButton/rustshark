use anyhow::{Result, anyhow};
use log::{debug, error, trace, log_enabled, Level};
use pnet::packet::{
    ethernet::{EthernetPacket, EtherTypes},
    ip::{IpNextHeaderProtocol, IpNextHeaderProtocols},
    ipv4::Ipv4Packet,
    ipv6::Ipv6Packet,
    tcp::TcpPacket,
    udp::UdpPacket,
    icmp::IcmpPacket,
    arp::ArpPacket,
    Packet as PnetPacket,
};
use pnet::util::MacAddr;
use serde_json::{json, Value};
use std::net::IpAddr;

use crate::models::packet::Packet;

/// Parses raw packet data into structured packet objects
pub struct PacketParser {}

impl PacketParser {
    /// Create a new packet parser
    pub fn new() -> Self {
        Self {}
    }
    
    /// Parse raw packet data into a Packet object
    pub fn parse_packet(&self, data: Vec<u8>, interface: &str) -> Result<Packet> {
        // Only log in verbose mode
        if log_enabled!(Level::Debug) {
            debug!("Parsing packet from interface '{}', size: {} bytes", interface, data.len());
        }
        
        // Parse Ethernet frame
        let eth_packet = match EthernetPacket::new(&data) {
            Some(packet) => packet,
            None => return Err(anyhow!("Failed to parse Ethernet packet")),
        };
        
        // Get MAC addresses
        let src_mac = self.format_mac(eth_packet.get_source());
        let dst_mac = self.format_mac(eth_packet.get_destination());
        
        // Initialize packet with defaults
        let mut packet = Packet {
            id: 0, // Will be set by the caller
            timestamp: chrono::Utc::now(), // Will be updated by the caller
            interface: interface.to_string(),
            length: data.len(),
            protocol: "Unknown".to_string(),
            source_ip: None,
            destination_ip: None,
            source_port: None,
            destination_port: None,
            source_mac: Some(src_mac),
            destination_mac: Some(dst_mac),
            raw_data: data.clone(),
            headers: json!({}),
            payload: None,
            metadata: json!({}),
        };
        
        // Add ethernet header to JSON
        let ethertype = eth_packet.get_ethertype();
        packet.headers = json!({
            "ethernet": {
                "source_mac": packet.source_mac,
                "destination_mac": packet.destination_mac,
                "ethertype": format!("{:?}", ethertype),
            }
        });
        
        // Only log in verbose mode  
        if log_enabled!(Level::Trace) {
            trace!("EtherType: {:?}, src: {}, dst: {}", 
                   ethertype, packet.source_mac.as_ref().unwrap_or(&"?".to_string()), 
                   packet.destination_mac.as_ref().unwrap_or(&"?".to_string()));
        }
        
        // Process based on EtherType
        match ethertype {
            EtherTypes::Ipv4 => {
                self.parse_ipv4(eth_packet.payload(), &mut packet)?;
            },
            EtherTypes::Ipv6 => {
                self.parse_ipv6(eth_packet.payload(), &mut packet)?;
            },
            EtherTypes::Arp => {
                self.parse_arp(eth_packet.payload(), &mut packet)?;
            },
            _ => {
                // Other protocols can be added here
                packet.protocol = format!("Other ({:?})", ethertype);
                packet.payload = Some(eth_packet.payload().to_vec());
            }
        }
        
        Ok(packet)
    }
    
    /// Parse IPv4 packet
    fn parse_ipv4(&self, data: &[u8], packet: &mut Packet) -> Result<()> {
        let ipv4_packet = match Ipv4Packet::new(data) {
            Some(packet) => packet,
            None => return Err(anyhow!("Failed to parse IPv4 packet")),
        };
        
        // Set IP addresses
        packet.source_ip = Some(IpAddr::V4(ipv4_packet.get_source()));
        packet.destination_ip = Some(IpAddr::V4(ipv4_packet.get_destination()));
        
        if log_enabled!(Level::Trace) {
            trace!("IPv4 - src: {}, dst: {}, proto: {:?}", 
                   ipv4_packet.get_source(), 
                   ipv4_packet.get_destination(),
                   ipv4_packet.get_next_level_protocol());
        }
        
        // Update headers in JSON
        let mut headers = serde_json::from_value(packet.headers.clone()).unwrap_or_else(|_| serde_json::Map::new());
        headers.insert("ipv4".to_string(), json!({
            "version": ipv4_packet.get_version(),
            "header_length": ipv4_packet.get_header_length(),
            "total_length": ipv4_packet.get_total_length(),
            "ttl": ipv4_packet.get_ttl(),
            "protocol": format!("{:?}", ipv4_packet.get_next_level_protocol()),
            "checksum": ipv4_packet.get_checksum(),
            "source_ip": packet.source_ip,
            "destination_ip": packet.destination_ip,
        }));
        packet.headers = serde_json::Value::Object(headers);
        
        // Parse transport layer
        self.parse_transport_protocol(ipv4_packet.get_next_level_protocol(), ipv4_packet.payload(), packet)?;
        
        Ok(())
    }
    
    /// Parse IPv6 packet
    fn parse_ipv6(&self, data: &[u8], packet: &mut Packet) -> Result<()> {
        let ipv6_packet = match Ipv6Packet::new(data) {
            Some(packet) => packet,
            None => return Err(anyhow!("Failed to parse IPv6 packet")),
        };
        
        // Set IP addresses
        packet.source_ip = Some(IpAddr::V6(ipv6_packet.get_source()));
        packet.destination_ip = Some(IpAddr::V6(ipv6_packet.get_destination()));
        
        // Add IPv6 header to JSON
        let mut headers = packet.headers.clone();
        let ipv6_json = json!({
            "version": ipv6_packet.get_version(),
            "traffic_class": ipv6_packet.get_traffic_class(),
            "flow_label": ipv6_packet.get_flow_label(),
            "payload_length": ipv6_packet.get_payload_length(),
            "next_header": ipv6_packet.get_next_header().0,
            "hop_limit": ipv6_packet.get_hop_limit(),
            "source": packet.source_ip,
            "destination": packet.destination_ip,
        });
        
        if let Value::Object(ref mut obj) = headers {
            obj.insert("ipv6".to_string(), ipv6_json);
            packet.headers = Value::Object(obj.clone());
        }
        
        // Process next protocol
        self.parse_transport_protocol(ipv6_packet.get_next_header(), 
                                     ipv6_packet.payload(), 
                                     packet)
    }
    
    /// Parse ARP packet
    fn parse_arp(&self, data: &[u8], packet: &mut Packet) -> Result<()> {
        let arp_packet = match ArpPacket::new(data) {
            Some(packet) => packet,
            None => return Err(anyhow!("Failed to parse ARP packet")),
        };
        
        packet.protocol = "ARP".to_string();
        
        // Add ARP header to JSON
        let mut headers = packet.headers.clone();
        let sender_hw = self.format_mac(arp_packet.get_sender_hw_addr());
        let target_hw = self.format_mac(arp_packet.get_target_hw_addr());
        
        let arp_json = json!({
            "hardware_type": format!("{:?}", arp_packet.get_hardware_type()),
            "protocol_type": format!("{:?}", arp_packet.get_protocol_type()),
            "hw_addr_len": arp_packet.get_hw_addr_len(),
            "proto_addr_len": arp_packet.get_proto_addr_len(),
            "operation": format!("{:?}", arp_packet.get_operation()),
            "sender_hw_addr": sender_hw,
            "sender_proto_addr": format!("{:?}", arp_packet.get_sender_proto_addr()),
            "target_hw_addr": target_hw,
            "target_proto_addr": format!("{:?}", arp_packet.get_target_proto_addr()),
        });
        
        if let Value::Object(ref mut obj) = headers {
            obj.insert("arp".to_string(), arp_json);
            packet.headers = Value::Object(obj.clone());
        }
        
        // No further parsing required for ARP
        Ok(())
    }
    
    /// Parse transport layer protocols
    fn parse_transport_protocol(&self, proto: IpNextHeaderProtocol, data: &[u8], packet: &mut Packet) -> Result<()> {
        if log_enabled!(Level::Trace) {
            trace!("Transport protocol: {:?}, data length: {}", proto, data.len());
        }
        
        match proto {
            IpNextHeaderProtocols::Tcp => {
                self.parse_tcp(data, packet)?;
            },
            IpNextHeaderProtocols::Udp => {
                self.parse_udp(data, packet)?;
            },
            IpNextHeaderProtocols::Icmp => {
                self.parse_icmp(data, packet)?;
            },
            _ => {
                packet.protocol = format!("IP({:?})", proto);
                packet.payload = Some(data.to_vec());
            }
        }
        
        Ok(())
    }
    
    /// Parse TCP packet
    fn parse_tcp(&self, data: &[u8], packet: &mut Packet) -> Result<()> {
        let tcp_packet = match TcpPacket::new(data) {
            Some(packet) => packet,
            None => return Err(anyhow!("Failed to parse TCP packet")),
        };
        
        // Set TCP specific info
        packet.protocol = "TCP".to_string();
        packet.source_port = Some(tcp_packet.get_source());
        packet.destination_port = Some(tcp_packet.get_destination());
        
        if log_enabled!(Level::Trace) {
            trace!("TCP - src port: {}, dst port: {}, payload: {} bytes", 
                   tcp_packet.get_source(), 
                   tcp_packet.get_destination(),
                   tcp_packet.payload().len());
        }
        
        // Add TCP header to JSON
        let mut headers = packet.headers.clone();
        let flags = tcp_packet.get_flags() as u16;
        let tcp_json = json!({
            "source_port": tcp_packet.get_source(),
            "destination_port": tcp_packet.get_destination(),
            "sequence": tcp_packet.get_sequence(),
            "acknowledgement": tcp_packet.get_acknowledgement(),
            "data_offset": tcp_packet.get_data_offset(),
            "flags": {
                "ns": flags & 0x100 != 0,
                "cwr": flags & 0x80 != 0,
                "ece": flags & 0x40 != 0,
                "urg": flags & 0x20 != 0,
                "ack": flags & 0x10 != 0,
                "psh": flags & 0x8 != 0,
                "rst": flags & 0x4 != 0,
                "syn": flags & 0x2 != 0,
                "fin": flags & 0x1 != 0,
            },
            "window": tcp_packet.get_window(),
            "checksum": tcp_packet.get_checksum(),
            "urgent_ptr": tcp_packet.get_urgent_ptr(),
        });
        
        if let Value::Object(ref mut obj) = headers {
            obj.insert("tcp".to_string(), tcp_json);
            packet.headers = Value::Object(obj.clone());
        }
        
        // Set payload
        if !tcp_packet.payload().is_empty() {
            packet.payload = Some(tcp_packet.payload().to_vec());
        }
        
        Ok(())
    }
    
    /// Parse UDP packet
    fn parse_udp(&self, data: &[u8], packet: &mut Packet) -> Result<()> {
        let udp_packet = match UdpPacket::new(data) {
            Some(packet) => packet,
            None => return Err(anyhow!("Failed to parse UDP packet")),
        };
        
        // Set UDP specific fields
        packet.protocol = "UDP".to_string();
        packet.source_port = Some(udp_packet.get_source());
        packet.destination_port = Some(udp_packet.get_destination());
        
        // Add UDP header to JSON
        let mut headers = packet.headers.clone();
        let udp_json = json!({
            "source_port": udp_packet.get_source(),
            "destination_port": udp_packet.get_destination(),
            "length": udp_packet.get_length(),
            "checksum": udp_packet.get_checksum(),
        });
        
        if let Value::Object(ref mut obj) = headers {
            obj.insert("udp".to_string(), udp_json);
            packet.headers = Value::Object(obj.clone());
        }
        
        // Set payload
        if !udp_packet.payload().is_empty() {
            packet.payload = Some(udp_packet.payload().to_vec());
        }
        
        // Detect DNS (ports 53)
        if udp_packet.get_source() == 53 || udp_packet.get_destination() == 53 {
            packet.protocol = "DNS".to_string();
        }
        
        Ok(())
    }
    
    /// Parse ICMP packet
    fn parse_icmp(&self, data: &[u8], packet: &mut Packet) -> Result<()> {
        let icmp_packet = match IcmpPacket::new(data) {
            Some(packet) => packet,
            None => return Err(anyhow!("Failed to parse ICMP packet")),
        };
        
        // Set ICMP specific fields
        packet.protocol = "ICMP".to_string();
        
        // Add ICMP header to JSON
        let mut headers = packet.headers.clone();
        let icmp_json = json!({
            "icmp_type": icmp_packet.get_icmp_type().0,
            "icmp_code": icmp_packet.get_icmp_code().0,
            "checksum": icmp_packet.get_checksum(),
        });
        
        if let Value::Object(ref mut obj) = headers {
            obj.insert("icmp".to_string(), icmp_json);
            packet.headers = Value::Object(obj.clone());
        }
        
        // Set payload
        if !icmp_packet.payload().is_empty() {
            packet.payload = Some(icmp_packet.payload().to_vec());
        }
        
        Ok(())
    }
    
    /// Format MAC address to a readable string
    fn format_mac(&self, mac: MacAddr) -> String {
        format!("{}", mac)
    }
} 