# VecLite: 100% Local PDF RAG Example

This example showcases a full Retrieval-Augmented Generation (RAG) pipeline running _entirely_ inside the client's browser with **zero backend server required**. 

It demonstrates how lightweight and powerful `VecLite` is when paired with local embedding models.

## How it works

1. **Upload**: You provide a `.pdf` file.
2. **Parse**: `pdfjs-dist` reads the PDF natively and fragments it into text chunks.
3. **Embed**: Hugging Face's `Transformers.js` downloads a small ONNX-formatted machine learning model (`Xenova/all-MiniLM-L6-v2`) and converts the text chunks into 384-dimensional dense vectors.
4. **Index**: The vectors are inserted into the high-performance `VecLite` WebAssembly memory.
5. **Search**: You type a query. The same local model embeds the query, and `VecLite` immediately returns the exact snippets from the PDF utilizing Cosine Similarity.

## How to Run

Because this project links to the root directory's package (via `file:../..`), you must have already run `npm run build` in the main repository path.

```bash
# In the root repository folder
npm run build 

# Jump into this example
cd examples/browser-pdf
npm install
npm run dev
```

Open `http://localhost:5173` to experience a completely serverless semantic search engine.
