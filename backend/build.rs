fn main() {
    // Tell cargo to look for libraries in the lib directory
    println!("cargo:rustc-link-search=native=lib");
    
    // Link against Npcap libraries
    println!("cargo:rustc-link-lib=wpcap");
    println!("cargo:rustc-link-lib=Packet");
    
    // Rerun build script if any files in lib change
    println!("cargo:rerun-if-changed=lib");
} 