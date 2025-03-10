// API client for interacting with the Rustshark backend

// Use proxy through Next.js, no need to specify a port
const API_BASE_URL = "/api";

// Types
export interface Interface {
  name: string;
}

export interface CaptureStatus {
  is_running: boolean;
  stats?: CaptureStats | null;
}

export interface CaptureStats {
  total_packets: number;
  total_bytes: number;
  protocols: Record<string, number>;
  sources: Record<string, number>;
  destinations: Record<string, number>;
  start_time?: string;
  end_time?: string;
  packet_rate: number;
  data_rate: number;
  errors: number;
}

export interface PacketSummary {
  id: number;
  timestamp: string;
  protocol: string;
  source: string;
  destination: string;
  length: number;
  info: string;
}

export interface Packet extends PacketSummary {
  interface: string;
  source_ip?: string;
  destination_ip?: string;
  source_port?: number;
  destination_port?: number;
  source_mac?: string;
  destination_mac?: string;
  headers: Record<string, unknown>;
  payload?: string;
  metadata: Record<string, unknown>;
}

export interface InterfaceInfo {
  device_name: string;
  friendly_name?: string;
  description?: string;
  ipv4_address?: string;
  mac_address?: string;
  is_loopback: boolean;
  is_up: boolean;
}

export interface InterfacesResponse {
  interfaces: string[];
  detailed_interfaces: InterfaceInfo[];
}

export interface DiagnosticInfo {
  is_running: boolean;
  packet_count: number;
  stats: CaptureStats;
  interfaces: string[];
  detailed_interfaces: InterfaceInfo[];
  selected_interface?: string;
  promiscuous_mode: boolean;
  filter?: string;
}

export interface PacketsResponse {
  packets: PacketSummary[];
  total: number;
  offset: number;
  limit: number;
}

// API functions
export const getInterfaces = async (): Promise<string[]> => {
  const response = await fetch(`${API_BASE_URL}/interfaces`);
  if (!response.ok) {
    throw new Error(`Failed to fetch interfaces: ${response.statusText}`);
  }
  const data = (await response.json()) as InterfacesResponse;
  return data.interfaces;
};

export const getDetailedInterfaces = async (): Promise<InterfaceInfo[]> => {
  const response = await fetch(`${API_BASE_URL}/interfaces`);
  if (!response.ok) {
    throw new Error(`Failed to fetch interfaces: ${response.statusText}`);
  }
  const data = (await response.json()) as InterfacesResponse;
  return data.detailed_interfaces;
};

export async function startCapture(interfaceName?: string): Promise<{
  status: string;
  message: string;
}> {
  const requestBody = interfaceName ? { interface: interfaceName } : {};

  const response = await fetch(`${API_BASE_URL}/capture/start`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  return await response.json();
}

export async function stopCapture(): Promise<{
  status: string;
  message: string;
}> {
  const response = await fetch(`${API_BASE_URL}/capture/stop`, {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(`Failed to stop capture: ${response.statusText}`);
  }
  return response.json();
}

export async function getCaptureStatus(): Promise<CaptureStatus> {
  const response = await fetch(`${API_BASE_URL}/capture/status`);
  if (!response.ok) {
    throw new Error(`Failed to get capture status: ${response.statusText}`);
  }
  return response.json();
}

export async function getDiagnosticInfo(): Promise<DiagnosticInfo> {
  const response = await fetch(`${API_BASE_URL}/capture/diagnostic`);
  if (!response.ok) {
    throw new Error(`Failed to get diagnostic info: ${response.statusText}`);
  }
  return response.json();
}

export async function getPackets(
  offset = 0,
  limit = 100
): Promise<PacketsResponse> {
  const response = await fetch(
    `${API_BASE_URL}/packets?offset=${offset}&limit=${limit}`
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch packets: ${response.statusText}`);
  }
  return response.json();
}

export async function getPacket(id: number): Promise<Packet> {
  const response = await fetch(`${API_BASE_URL}/packets/${id}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch packet: ${response.statusText}`);
  }
  return response.json();
}

export async function getPacketStats(): Promise<CaptureStats> {
  const response = await fetch(`${API_BASE_URL}/packets/stats`);
  if (!response.ok) {
    throw new Error(`Failed to fetch packet stats: ${response.statusText}`);
  }
  return response.json();
}

export async function filterPackets(
  query?: string,
  protocol?: string,
  source?: string,
  destination?: string,
  offset = 0,
  limit = 100
): Promise<PacketsResponse> {
  const params = new URLSearchParams();
  if (query) params.append("query", query);
  if (protocol) params.append("protocol", protocol);
  if (source) params.append("source", source);
  if (destination) params.append("destination", destination);
  params.append("offset", offset.toString());
  params.append("limit", limit.toString());

  const response = await fetch(
    `${API_BASE_URL}/packets/filter?${params.toString()}`
  );
  if (!response.ok) {
    throw new Error(`Failed to filter packets: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Check if the backend API is accessible
 * @returns True if the backend is available
 */
export async function checkBackendHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/capture/status`, {
      method: "GET",
      // Set a short timeout to avoid hanging
      signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch (error) {
    console.error("Backend health check failed:", error);
    return false;
  }
}

export async function updateCaptureSettings(settings: {
  interface?: string;
  promiscuous?: boolean;
  filter?: string;
  buffer_size?: number;
}): Promise<{
  status: string;
  message: string;
}> {
  const response = await fetch(`${API_BASE_URL}/capture/settings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(settings),
  });

  if (!response.ok) {
    throw new Error(`Failed to update settings: ${response.statusText}`);
  }

  return response.json();
}
