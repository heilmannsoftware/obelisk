import {
  WASI,
  OpenFile,
  File,
  ConsoleStdout,
} from "./wasi-shim.js";
import ghc_wasm_jsffi from "./ghc_wasm_jsffi.js";

// Check if WASM is supported
function isWasmSupported() {
  return false;
}

// DOM progress display
function updateProgress(message) {
  let progressEl = document.getElementById('wasm-progress');
  if (!progressEl) {
    progressEl = document.createElement('h1');
    progressEl.id = 'wasm-progress';
    progressEl.style.cssText = 'position: fixed; top: 10px; left: 50%; transform: translateX(-50%); background: #f0f0f0; padding: 10px; border-radius: 5px; z-index: 9999; font-family: Arial, sans-serif; font-size: 18px; color: #333;';
    document.body.insertBefore(progressEl, document.body.firstChild);
  }
  progressEl.textContent = message;
}

// Delay function
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Phase 1: Read WASM to buffer
async function fetchBytes(url) {
  updateProgress("Phase 1/5: Reading WASM file...");
  const res = await fetch(url, { cache: "no-store", credentials: "same-origin" });
  const buf = await res.arrayBuffer();
  updateProgress("Phase 1/5: WASM file read successfully");
  return buf;
}

// Phase 2: Validate
async function validateOnly(buf) {
  updateProgress("Phase 2/5: Validating WASM...");
  const ok = WebAssembly.validate(buf);
  updateProgress(`Phase 2/5: WASM validation ${ok ? 'successful' : 'failed'}`);
  return ok;
}

// Phase 3: Compile
async function compileOnly(buf) {
  updateProgress("Phase 3/5: Compiling WASM...");
  const mod = await WebAssembly.compile(buf);
  updateProgress("Phase 3/5: WASM compilation complete");
  return mod;
}

// Fallback: Load and execute JS version
async function loadJsFallback() {
  try {
    updateProgress("WASM not supported - Loading JS fallback...");

    // Dynamically import the JS version
    const jsModule = await import("./frontend.wasm.js");

    updateProgress("JS fallback loaded - Starting application...");

    jsModule.hsMain();

    updateProgress("JS application started successfully!");

    // Hide progress after 3 seconds
    setTimeout(() => {
      const progressEl = document.getElementById('wasm-progress');
      if (progressEl) {
        progressEl.style.display = 'none';
      }
    }, 3000);

  } catch (error) {
    console.error("JS fallback loading failed:", error);
    updateProgress(`Error loading JS fallback: ${error.message}`);
  }
}

// Phase 4: Instantiate
async function instantiateOnly(modOrBuf, imports) {
  updateProgress("Phase 4/5: Instantiating WASM...");
  const instance = await WebAssembly.instantiate(modOrBuf, imports);
  updateProgress("Phase 4/5: WASM instantiation complete");
  return instance;
}

// Phase 5: Start
async function startWasm(instance, wasi) {
  updateProgress("Phase 5/5: Starting WASM application...");

  wasi.initialize(instance);

  if (instance.exports && instance.exports.hsMain) {
    instance.exports.hsMain();
    updateProgress("WASM application started successfully!");

    // Hide progress after 3 seconds
    setTimeout(() => {
      const progressEl = document.getElementById('wasm-progress');
      if (progressEl) {
        progressEl.style.display = 'none';
      }
    }, 3000);
  }
}



// Main execution with phased loading
async function loadWasm() {
  try {
    // Setup WASI and configuration
    const args = ["frontend.wasm", "+RTS", "-H64m", "-c", "-T", "-RTS"];
    const env = [];
    const fds = [
      new OpenFile(new File(new Uint8Array(), { readonly: true })),
      ConsoleStdout.lineBuffered((msg) =>
        console.info(`[frontend.wasm] ${msg}`)
      ),
      ConsoleStdout.lineBuffered((msg) =>
        console.error(`[frontend.wasm] ${msg}`)
      ),
    ];
    const options = { debug: false };
    const wasi = new WASI(args, env, fds, options);
    const instance_exports = {};

    // Phase 1: Read WASM to buffer
    const buf = await fetchBytes("./ghcjs/frontend.wasm");
    await delay(1000);

    // Phase 2: Validate
    const isValid = await validateOnly(buf);
    if (!isValid) {
       throw new Error("WASM validation failed");
    }
    await delay(1000);

    // Phase 3: Compile
    const mod = await compileOnly(buf);
    await delay(1000);

    // Phase 4: Instantiate
    const instance = await instantiateOnly(mod, {
      wasi_snapshot_preview1: wasi.wasiImport,
      ghc_wasm_jsffi: ghc_wasm_jsffi(instance_exports),
    });
    Object.assign(instance_exports, instance.exports);
    await delay(1000);

    // Phase 5: Start
    await startWasm(instance, wasi);

  } catch (error) {
    console.error("WASM loading failed:", error);
    updateProgress(`Error: ${error.message}`);
  }
}

// Start the loading process
async function main() {
  if (isWasmSupported()) {
    await loadWasm();
  } else {
    await loadJsFallback();
  }
}

main();
