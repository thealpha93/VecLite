import { VecLite } from 'veclite';
import { pipeline, env } from '@xenova/transformers';

// Setup pdf.js worker natively through Vite worker resolving mechanisms
import * as pdfjsLib from 'pdfjs-dist';
// Explicitly providing the worker source manually to skip build complexities
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

// Disable local models search, directly fetch from HuggingFace to prevent config headaches
env.allowLocalModels = false;

const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';
const DIMENSIONS = 384; 

// DOM Elements
const statusPanel = document.getElementById('status-panel') as HTMLElement;
const fileInput = document.getElementById('file-input') as HTMLInputElement;
const progressContainer = document.getElementById('progress-container') as HTMLElement;
const progressBar = document.getElementById('progress-bar') as HTMLElement;
const uploadStatus = document.getElementById('upload-status') as HTMLElement;
const searchInput = document.getElementById('search-input') as HTMLInputElement;
const btnSearch = document.getElementById('btn-search') as HTMLButtonElement;
const searchCard = document.getElementById('search-card') as HTMLElement;
const resultsContainer = document.getElementById('results-container') as HTMLElement;

let embedderPipeline: any = null;
let db: VecLite | null = null;

async function init() {
  try {
    statusPanel.textContent = '1. Initializing VecLite WASM boundary...';
    await VecLite.init();
    db = new VecLite({ dimensions: DIMENSIONS });

    statusPanel.textContent = '2. Downloading Embedding Model (~23MB)...';
    embedderPipeline = await pipeline('feature-extraction', MODEL_NAME);

    statusPanel.textContent = '✅ All Systems Ready';
    statusPanel.style.borderLeftColor = '#4CAF50';
    fileInput.disabled = false;
  } catch (err: any) {
    statusPanel.textContent = `Error initializing: ${err.message}`;
    statusPanel.style.borderLeftColor = 'red';
    console.error(err);
  }
}

// PDF Text Extraction Logic
async function extractTextFromPDF(pdfData: ArrayBuffer): Promise<string> {
  const loadingTask = pdfjsLib.getDocument({ data: pdfData });
  const pdf = await loadingTask.promise;
  let text = '';
  
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const strings = content.items.map((item: any) => item.str);
    text += strings.join(' ') + '\n';
  }
  return text;
}

// Advanced semantic overlapping chunker
function chunkText(text: string, maxWords: number = 150, overlapWords: number = 30): string[] {
  const cleanText = text.replace(/\\n+/g, ' ').replace(/\\s+/g, ' ');
  
  // Split into rough sentences to preserve semantic boundaries
  const sentences = cleanText.match(/[^.!?]+[.!?]+/g) || [cleanText];
  
  const chunks: string[] = [];
  let currentChunk: string[] = [];
  let currentWordCount = 0;

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i].trim();
    if (!sentence) continue;

    const wordsInSentence = sentence.split(' ').length;
    
    // If adding this sentence exceeds the limit, commit the chunk
    if (currentWordCount + wordsInSentence > maxWords && currentChunk.length > 0) {
      chunks.push(currentChunk.join(' '));
      
      // Build the overlap from the end of the current chunk
      let overlapCount = 0;
      const overlapChunk: string[] = [];
      for (let j = currentChunk.length - 1; j >= 0; j--) {
        const sw = currentChunk[j].split(' ').length;
        if (overlapCount + sw > overlapWords) break;
        overlapChunk.unshift(currentChunk[j]);
        overlapCount += sw;
      }
      
      // Start the new chunk with the overlap + the current sentence
      currentChunk = [...overlapChunk, sentence];
      currentWordCount = overlapCount + wordsInSentence;
    } else {
      currentChunk.push(sentence);
      currentWordCount += wordsInSentence;
    }
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join(' '));
  }

  // Filter out tiny chunks
  return chunks.filter(c => c.trim().split(' ').length > 10);
}

// File Upload Handler
fileInput.addEventListener('change', async (e: any) => {
  if (!e.target.files.length || !db) return;
  const file = e.target.files[0];
  
  fileInput.disabled = true;
  progressContainer.style.display = 'block';
  uploadStatus.textContent = 'Parsing PDF...';

  try {
    const arrayBuffer = await file.arrayBuffer();
    const rawText = await extractTextFromPDF(arrayBuffer);
    const chunks = chunkText(rawText, 150);
    
    uploadStatus.textContent = `Parsed ${chunks.length} chunks. Generating Embeddings...`;

    // Process vectors
    const vectors = [];
    for (let i = 0; i < chunks.length; i++) {
      // Calculate progress
      const percent = Math.round((i / chunks.length) * 100);
      progressBar.style.width = `${percent}%`;

      const chunk = chunks[i];
      // Generate embedding through transformers.js pipeline
      const output = await embedderPipeline(chunk, { pooling: 'mean', normalize: true });
      const vector = Array.from(output.data); 
      
      vectors.push({
        id: `chunk-${i}`,
        vector: vector,
        metadata: { chunkContent: chunk }
      });
    }

    progressBar.style.width = '100%';
    uploadStatus.textContent = `Indexing vectors into VecLite...`;

    db.clear(); // Ensure fresh index for new doc
    db.upsert(vectors);

    uploadStatus.textContent = `✅ Successfully indexed ${chunks.length} vectors!`;
    
    // Unlock search functionality
    searchCard.style.opacity = '1';
    searchInput.disabled = false;
    btnSearch.disabled = false;
    
  } catch (err: any) {
    uploadStatus.textContent = `Error: ${err.message}`;
    console.error(err);
  }
});

// Search Handler
async function performSearch() {
  const query = searchInput.value.trim();
  if (!query || !db) return;

  btnSearch.disabled = true;
  btnSearch.textContent = 'Searching...';
  resultsContainer.innerHTML = '';

  try {
    const output = await embedderPipeline(query, { pooling: 'mean', normalize: true });
    const queryVector = Array.from(output.data);
    
    const t0 = performance.now();
    const results = db.search({
      vector: queryVector,
      topK: 3
    });
    const t1 = performance.now();

    resultsContainer.innerHTML = `<em>Query executed natively in ${(t1-t0).toFixed(2)}ms</em>`;

    results.forEach((res, i) => {
      const item = document.createElement('div');
      item.className = 'result-item';
      item.innerHTML = `
        <div class="result-score">Match Score: ${(res.score * 100).toFixed(1)}%</div>
        <div>${res.metadata?.chunkContent}</div>
      `;
      resultsContainer.appendChild(item);
    });

  } catch (err: any) {
     resultsContainer.textContent = `Search Error: ${err.message}`;
  }

  btnSearch.disabled = false;
  btnSearch.textContent = 'Search';
}

btnSearch.addEventListener('click', performSearch);
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') performSearch();
});

// Start initialization mapping
init();
