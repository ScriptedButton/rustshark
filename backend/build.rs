fn main() {
    #[cfg(target_os = "windows")]
    {
        // Tell cargo to look for libraries in the lib directory
        println!("cargo:rustc-link-search=native=lib");
        
        // Link against Npcap libraries
        println!("cargo:rustc-link-lib=wpcap");
        println!("cargo:rustc-link-lib=Packet");
        
        // Rerun build script if lib directory changes
        println!("cargo:rerun-if-changed=lib");
    }
} 