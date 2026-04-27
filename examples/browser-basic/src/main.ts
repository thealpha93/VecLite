import { VecLite } from 'veclite';

const DIMENSIONS = 1536;

// HTML Elements
const sizeEl = document.getElementById('index-size') as HTMLElement;
const btnSeed = document.getElementById('btn-seed') as HTMLButtonElement;
const btnClear = document.getElementById('btn-clear') as HTMLButtonElement;
const btnSearch = document.getElementById('btn-search') as HTMLButtonElement;
const resultsContainer = document.getElementById('results-container') as HTMLElement;

// Utility: Generate fake embeddings
function generateRandomVector(dims: number): Float32Array {
  const vec = new Float32Array(dims);
  for (let i = 0; i < dims; i++) {
    vec[i] = Math.random() * 2 - 1; // between -1 and 1
  }
  return vec;
}

async function main() {
  resultsContainer.textContent = 'Loading WebAssembly...';
  
  // 1. Initialize WebAssembly
  await VecLite.init();
  
  // 2. Create the Database instance
  const db = new VecLite({ dimensions: DIMENSIONS });
  
  // Load any previously saved state from IndexedDB
  await db.load();
  
  // Update UI State
  function updateUI() {
    sizeEl.textContent = db.size.toLocaleString();
    btnSearch.disabled = db.size === 0;
  }
  updateUI();
  resultsContainer.textContent = 'WASM Loaded and VecLite initialized! Ready.';

  // 3. Seed Hook
  btnSeed.addEventListener('click', async () => {
    btnSeed.disabled = true;
    btnSeed.textContent = 'Generating & Inserting...';
    
    // Generate 1000 vectors
    const vectors = [];
    for (let i = 0; i < 1000; i++) {
      vectors.push({
        id: `doc-${db.size + i}`,
        vector: generateRandomVector(DIMENSIONS),
        metadata: {
          category: Math.random() > 0.5 ? 'documents' : 'emails',
          timestamp: Date.now()
        }
      });
    }

    const t0 = performance.now();
    db.upsert(vectors); // Push to in-memory WASM index
    await db.save();    // Persist to IndexedDB
    const t1 = performance.now();

    resultsContainer.textContent = `Successfully inserted and persisted 1,000 vectors in ${(t1 - t0).toFixed(2)}ms!`;
    
    btnSeed.disabled = false;
    btnSeed.textContent = 'Insert 1,000 Random Vectors';
    updateUI();
  });

  // 4. Clear Hook
  btnClear.addEventListener('click', async () => {
    db.clear();      // Clear memory
    await db.save(); // Persist empty state to IndexedDB 
    updateUI();
    resultsContainer.textContent = 'Index cleared.';
  });

  // 5. Search Hook
  btnSearch.addEventListener('click', () => {
    const query = generateRandomVector(DIMENSIONS);
    
    const t0 = performance.now();
    // Brute force cosine similarity
    const results = db.search({
      vector: query,
      topK: 5
    });
    const t1 = performance.now();

    // Format output
    let output = `Search completed in ${(t1 - t0).toFixed(2)}ms (against ${db.size.toLocaleString()} vectors):\n\n`;
    
    results.forEach((r, idx) => {
      output += `${idx + 1}. [${r.id}] Score: ${r.score.toFixed(4)} | Category: ${r.metadata?.category || 'none'}\n`;
    });
    
    resultsContainer.textContent = output;
  });
}

main().catch(err => {
  console.error("VecLite init error", err);
  resultsContainer.textContent = `Failed to load VecLite: ${err.message}`;
});
