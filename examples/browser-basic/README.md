# VecLite: Basic Browser Example

This example demonstrates the core functionality of `VecLite` running directly in the browser via WebAssembly, bundled by Vite.

## Features Showcased
- Initializing the WASM worker (`VecLite.init()`).
- Inserting generated embeddings into the in-memory index (`db.upsert()`).
- Persisting state locally across pageloads via the default IndexedDB Storage Adapter (`db.save()`, `db.load()`).
- Performing rapid similarity searches via brute-force `f32` vectors.

## How to Run

Because this project relies on navigating directly to the local un-built package route from the root of the repo (via `file:../..` in `package.json`), make sure VecLite has been built successfully at the root directory first.

```bash
# In the root repository folder
npm run build 

# Jump into this example
cd examples/browser-basic
npm install
npm run dev
```

Open `http://localhost:5173` to test the library.
