const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "models/gemini-embedding-001" });

async function chunkText(text, size = 300, overlap = 50) {
    const words = text.split(/\s+/);
    const chunks = [];
    if (words.length <= size) return [text];
    
    for (let i = 0; i < words.length; i += (size - overlap)) {
        chunks.push(words.slice(i, i + size).join(' '));
        if (i + size >= words.length) break;
    }
    return chunks;
}

async function ingest() {
    try {
        const docsPath = path.join(__dirname, '../data/docs.json');
        const docs = JSON.parse(fs.readFileSync(docsPath, 'utf8'));
        const vectorStore = [];

        console.log(`Processing ${docs.length} documents...`);

        for (const doc of docs) {
            const chunks = await chunkText(doc.content);
            for (let i = 0; i < chunks.length; i++) {
                const chunk = chunks[i];
                const result = await model.embedContent(chunk);
                const embedding = result.embedding.values;

                vectorStore.push({
                    id: `${doc.id}_${i}`,
                    title: doc.title,
                    content: chunk,
                    vector: embedding
                });
                console.log(`Embedded chunk ${i + 1} of doc ${doc.id}`);
            }
        }

        const storePath = path.join(__dirname, '../data/vector_store.json');
        fs.writeFileSync(storePath, JSON.stringify(vectorStore, null, 2));
        console.log(`Vector store created at ${storePath}`);
    } catch (error) {
        console.error("Ingestion failed:", error);
    }
}

ingest();
