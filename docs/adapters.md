# Storage Adapters

VecLite ships with a generic key/value storage layer. This means it doesn't assume you are running in a browser, Node.js, or React Native — you can plug in any persistent storage you like.

## The `StorageAdapter` Interface

The adapter interface is only four methods and has no knowledge of vectors, dimensions, or search logic. VecLite handles all serialization to JSON. 

```typescript
export interface StorageAdapter {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}
```

## Built-in Adapters

VecLite ships with two adapters:
1. `IndexedDBAdapter` — The default. Persists to the browser's IndexedDB.
2. `MemoryAdapter` — Keeps the index purely in-memory. Useful for testing or serverless environments where persistence is handled externally.

## Writing a Custom Adapter

Writing a custom adapter is trivial. For example, if you wanted to use `localStorage` (not recommended for large indexes, but good for small ones):

```typescript
import { VecLite, StorageAdapter } from 'veclite';

class LocalStorageAdapter implements StorageAdapter {
  async get(key: string): Promise<string | null> {
    return localStorage.getItem(key);
  }

  async set(key: string, value: string): Promise<void> {
    localStorage.setItem(key, value);
  }

  async delete(key: string): Promise<void> {
    localStorage.removeItem(key);
  }

  async clear(): Promise<void> {
    // In a real app, you might want to namespace your keys
    // so you don't clear the user's entire localStorage
    localStorage.clear();
  }
}

// Usage:
const db = new VecLite({
  dimensions: 1536,
  storage: new LocalStorageAdapter()
});
```

Here's an example using Node's `fs` for a file-based adapter:

```typescript
import { StorageAdapter } from 'veclite';
import * as fs from 'fs/promises';

export class FileAdapter implements StorageAdapter {
  constructor(private path: string) {}

  async get(key: string): Promise<string | null> {
    try {
      return await fs.readFile(`${this.path}/${key}.json`, 'utf8');
    } catch {
      return null;
    }
  }

  async set(key: string, value: string): Promise<void> {
    await fs.mkdir(this.path, { recursive: true });
    await fs.writeFile(`${this.path}/${key}.json`, value, 'utf8');
  }

  async delete(key: string): Promise<void> {
    try {
      await fs.unlink(`${this.path}/${key}.json`);
    } catch {} // Ignore if file doesn't exist
  }

  async clear(): Promise<void> {
    try {
      await fs.rm(this.path, { recursive: true, force: true });
    } catch {}
  }
}
```
