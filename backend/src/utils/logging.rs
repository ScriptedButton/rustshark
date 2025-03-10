use log::{Level, LevelFilter, Log, Metadata, Record};
use std::io::Write;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use termcolor::{BufferWriter, Color, ColorChoice, ColorSpec, WriteColor};

// Global counters for compact statistics
static INFO_COUNT: AtomicUsize = AtomicUsize::new(0);
static WARN_COUNT: AtomicUsize = AtomicUsize::new(0);
static ERROR_COUNT: AtomicUsize = AtomicUsize::new(0);
static PACKET_COUNT: AtomicUsize = AtomicUsize::new(0);
static LAST_STATS_TIME: Mutex<Option<Instant>> = Mutex::new(None);

// Track verbose output mode
static VERBOSE_MODE: AtomicBool = AtomicBool::new(false);

// Structure to hold stats for TUI output
struct CaptureStats {
    total_packets: usize,
    packet_rate: f64,
    protocols: Vec<(String, usize)>,
    last_update: Instant,
}

impl Default for CaptureStats {
    fn default() -> Self {
        Self {
            total_packets: 0,
            packet_rate: 0.0,
            protocols: Vec::new(),
            last_update: Instant::now(),
        }
    }
}

// Our custom logger implementation
struct CompactLogger {
    level: LevelFilter,
    is_initialized: bool,
    stats: Arc<Mutex<CaptureStats>>,
}

impl CompactLogger {
    fn new(level: LevelFilter) -> Self {
        Self {
            level,
            is_initialized: false,
            stats: Arc::new(Mutex::new(CaptureStats::default())),
        }
    }

    // Helper to print a status line that updates in place
    fn print_status_line(&self) {
        if !self.is_initialized {
            return;
        }

        // Only update status line every second to reduce flicker
        let should_update = {
            let mut last_time = LAST_STATS_TIME.lock().unwrap();
            let now = Instant::now();
            
            if let Some(time) = *last_time {
                if now.duration_since(time) < Duration::from_secs(1) {
                    return;
                }
            }
            
            *last_time = Some(now);
            true
        };
        
        if !should_update {
            return;
        }

        let info_count = INFO_COUNT.load(Ordering::Relaxed);
        let warn_count = WARN_COUNT.load(Ordering::Relaxed);
        let error_count = ERROR_COUNT.load(Ordering::Relaxed);
        let packet_count = PACKET_COUNT.load(Ordering::Relaxed);
        
        let stdout = BufferWriter::stdout(ColorChoice::Always);
        let mut buffer = stdout.buffer();
        
        // Move cursor to beginning of line and clear line
        write!(&mut buffer, "\r\x1B[2K").unwrap();
        
        // Write packet count with cyan color
        buffer.set_color(ColorSpec::new().set_fg(Some(Color::Cyan))).unwrap();
        write!(&mut buffer, "PKT: {:6}", packet_count).unwrap();
        buffer.reset().unwrap();
        
        // Write info count
        buffer.set_color(ColorSpec::new().set_fg(Some(Color::Green))).unwrap();
        write!(&mut buffer, " | INFO: {:4}", info_count).unwrap();
        buffer.reset().unwrap();
        
        // Write warning count if any
        if warn_count > 0 {
            buffer.set_color(ColorSpec::new().set_fg(Some(Color::Yellow))).unwrap();
            write!(&mut buffer, " | WARN: {:4}", warn_count).unwrap();
            buffer.reset().unwrap();
        }
        
        // Write error count if any
        if error_count > 0 {
            buffer.set_color(ColorSpec::new().set_fg(Some(Color::Red))).unwrap();
            write!(&mut buffer, " | ERR: {:4}", error_count).unwrap();
            buffer.reset().unwrap();
        }
        
        // Add timestamp
        let now = chrono::Local::now();
        write!(&mut buffer, " | {}", now.format("%H:%M:%S")).unwrap();
        
        // Write buffer
        stdout.print(&buffer).unwrap();
    }

    // Helper to format and print a log message
    fn print_log(&self, record: &Record) {
        let stdout = BufferWriter::stdout(ColorChoice::Always);
        let mut buffer = stdout.buffer();
        
        // Clear the status line and move to new line
        write!(&mut buffer, "\r\x1B[2K").unwrap();
        
        // Format timestamp
        let now = chrono::Local::now();
        write!(&mut buffer, "[{}] ", now.format("%H:%M:%S")).unwrap();
        
        // Format level with color
        match record.level() {
            Level::Error => {
                buffer.set_color(ColorSpec::new().set_fg(Some(Color::Red)).set_bold(true)).unwrap();
                write!(&mut buffer, "ERROR").unwrap();
            },
            Level::Warn => {
                buffer.set_color(ColorSpec::new().set_fg(Some(Color::Yellow)).set_bold(true)).unwrap();
                write!(&mut buffer, "WARN ").unwrap();
            },
            Level::Info => {
                buffer.set_color(ColorSpec::new().set_fg(Some(Color::Green))).unwrap();
                write!(&mut buffer, "INFO ").unwrap();
            },
            Level::Debug => {
                buffer.set_color(ColorSpec::new().set_fg(Some(Color::Blue))).unwrap();
                write!(&mut buffer, "DEBUG").unwrap();
            },
            Level::Trace => {
                buffer.set_color(ColorSpec::new().set_fg(Some(Color::Magenta))).unwrap();
                write!(&mut buffer, "TRACE").unwrap();
            },
        }
        
        buffer.reset().unwrap();
        
        // Format target (module path) in dimmed color
        buffer.set_color(ColorSpec::new().set_fg(Some(Color::White)).set_intense(false)).unwrap();
        write!(&mut buffer, " [{}]", record.target()).unwrap();
        buffer.reset().unwrap();
        
        // Format message
        write!(&mut buffer, " {}", record.args()).unwrap();
        
        // Print and add a newline
        stdout.print(&buffer).unwrap();
        println!();
        
        // Reprint the status line
        self.print_status_line();
    }
}

impl Log for CompactLogger {
    fn enabled(&self, metadata: &Metadata) -> bool {
        metadata.level() <= self.level
    }

    fn log(&self, record: &Record) {
        if !self.enabled(record.metadata()) {
            return;
        }
        
        // Initialize on first log
        if !self.is_initialized {
            let logger = self as *const CompactLogger as *mut CompactLogger;
            unsafe {
                (*logger).is_initialized = true;
            }
        }
        
        // Track statistics
        match record.level() {
            Level::Error => {
                ERROR_COUNT.fetch_add(1, Ordering::Relaxed);
            },
            Level::Warn => {
                WARN_COUNT.fetch_add(1, Ordering::Relaxed);
            },
            Level::Info => {
                INFO_COUNT.fetch_add(1, Ordering::Relaxed);
            },
            _ => {}
        }
        
        // Check if this is a packet capture message and update counter
        let msg = format!("{}", record.args());
        if msg.contains("Captured packet:") || msg.contains("packet: ") {
            PACKET_COUNT.fetch_add(1, Ordering::Relaxed);
            // Don't print packet capture messages, just update the counter
            self.print_status_line();
            return;
        }
        
        // Determine if we should print the message
        let verbose = VERBOSE_MODE.load(Ordering::Relaxed);
        let is_important = record.level() <= Level::Warn; // Errors and warnings are always important
        
        if verbose || is_important {
            // In verbose mode, print all messages
            // In non-verbose mode, only print warnings and errors
            self.print_log(record);
        } else if record.level() == Level::Info && 
                  (msg.contains("Starting") || 
                   msg.contains("stopped") || 
                   msg.contains("mode") ||
                   msg.contains("Verbose")) {
            // Always print important info messages like start/stop events
            self.print_log(record);
        } else {
            // For other messages in non-verbose mode, just update the status line
            self.print_status_line();
        }
    }

    fn flush(&self) {}
}

// Ensure our logger is thread-safe
unsafe impl Send for CompactLogger {}
unsafe impl Sync for CompactLogger {}

// Initialize the logger
pub fn init_logger(level: LevelFilter) {
    let logger = Box::new(CompactLogger::new(level));
    log::set_boxed_logger(logger).unwrap();
    log::set_max_level(level);
    
    // Print header
    println!("RustShark TUI Logger - Press 'v' to toggle verbose mode");
    println!("------------------------------------------------");
}

// Convert string level to LevelFilter
pub fn get_log_level(level_str: &str) -> LevelFilter {
    match level_str.to_lowercase().as_str() {
        "trace" => LevelFilter::Trace,
        "debug" => LevelFilter::Debug,
        "info" => LevelFilter::Info,
        "warn" => LevelFilter::Warn,
        "error" => LevelFilter::Error,
        "off" => LevelFilter::Off,
        _ => LevelFilter::Info,
    }
}

// Set verbose mode
pub fn set_verbose_mode(verbose: bool) {
    VERBOSE_MODE.store(verbose, Ordering::Relaxed);
    
    if verbose {
        println!("\rVerbose logging enabled. All log messages will be displayed.");
    } else {
        println!("\rVerbose logging disabled. Only warnings and errors will be displayed.");
    }
}

// Toggle verbose mode - returns the new state
pub fn toggle_verbose_mode() -> bool {
    let current = VERBOSE_MODE.load(Ordering::Relaxed);
    let new_state = !current;
    VERBOSE_MODE.store(new_state, Ordering::Relaxed);
    
    if new_state {
        println!("\rVerbose logging enabled. All log messages will be displayed.");
    } else {
        println!("\rVerbose logging disabled. Only warnings and errors will be displayed.");
    }
    
    new_state
}

// Update packet stats
pub fn update_packet_count(count: usize) {
    PACKET_COUNT.store(count, Ordering::Relaxed);
}

// Reset counters
pub fn reset_counters() {
    INFO_COUNT.store(0, Ordering::Relaxed);
    WARN_COUNT.store(0, Ordering::Relaxed);
    ERROR_COUNT.store(0, Ordering::Relaxed);
    PACKET_COUNT.store(0, Ordering::Relaxed);
} 