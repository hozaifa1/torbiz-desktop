fn main() {
    // Only rebuild when Rust source files change
    println!("cargo:rerun-if-changed=src/");
    
    tauri_build::build()
}
