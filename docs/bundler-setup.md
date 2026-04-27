# Bundler Setup

VecLite relies on WebAssembly. While many bundlers handle `.wasm` files out-of-the-box, some require minor configuration to copy the file to your output directory.

## Vite

Vite handles WASM natively out-of-the-box. There is no configuration required. It will automatically fetch `veclite_bg.wasm` when `await VecLite.init()` is called.

```typescript
import { VecLite } from 'veclite';

// Just works!
await VecLite.init();
```

## Next.js / Webpack

Next.js and Webpack may require you to copy the WASM file to your public directory or configure asset modules. 

In your `next.config.js` or `webpack.config.js`:

```javascript
module.exports = {
  webpack(config) {
    // Tell Webpack to treat .wasm files as assets and emit them 
    config.module.rules.push({
      test: /\.wasm$/,
      type: 'asset/resource',
    });
    return config;
  }
};
```

If webpack struggles to resolve it automatically, you can explicitly fetch it in your code:

```typescript
import { VecLite } from 'veclite';

// Fetch the WASM file manually and pass it to init
const wasmUrl = new URL('veclite/dist/veclite_bg.wasm', import.meta.url).href;
const response = await fetch(wasmUrl);
const wasmBuffer = await response.arrayBuffer();

await VecLite.init(wasmBuffer);
```

## Node.js / Serverless

In Node.js or serverless environments (like AWS Lambda or Vercel Edge functions), you usually need to read the `.wasm` file directly from the filesystem by passing a buffer:

```typescript
import { VecLite } from 'veclite';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Fix __dirname for ESM
const __dirname = dirname(fileURLToPath(import.meta.url));

// Resolve path to the WASM binary
const wasmPath = join(__dirname, 'node_modules/veclite/dist/veclite_bg.wasm');
const wasmBuffer = readFileSync(wasmPath);

await VecLite.init(wasmBuffer);
```
