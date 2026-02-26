const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { calculateCosineSimilarity } = require('./utils/vector_math');
require('dotenv').config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
    console.error('Missing GEMINI_API_KEY in .env');
    process.exit(1);
}
console.log('Gemini API key loaded:', GEMINI_API_KEY ? `${GEMINI_API_KEY.slice(0, 10)}...` : 'NOT SET');

const app = express();
app.use(cors());
app.use(express.json());

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const chatModel = genAI.getGenerativeModel({ 
    model: "models/gemini-2.5-flash",
    generationConfig: {
        temperature: 0.1,
        topP: 0.95,
        maxOutputTokens: 1024,
    }
});
const embedModel = genAI.getGenerativeModel({ model: "models/gemini-embedding-001" });

const vectorStorePath = path.join(__dirname, './data/vector_store.json');
let vectorStore = [];

if (fs.existsSync(vectorStorePath)) {
    vectorStore = JSON.parse(fs.readFileSync(vectorStorePath, 'utf8'));
}

function getRetryDelayMs(error) {
    try {
        const retryInfo = error.errorDetails?.find(
            d => d['@type'] === 'type.googleapis.com/google.rpc.RetryInfo'
        );
        if (retryInfo?.retryDelay) {
            const seconds = parseInt(retryInfo.retryDelay.replace('s', ''), 10);
            return isNaN(seconds) ? null : seconds * 1000;
        }
    } catch (_) {}
    return null;
}

async function callWithRetry(fn, maxRetries = 2) {
    let attempt = 0;
    while (true) {
        try {
            return await fn();
        } catch (error) {
            const isRateLimit = error.status === 429;
            if (isRateLimit && attempt < maxRetries) {
                const delayMs = getRetryDelayMs(error) ?? Math.pow(2, attempt) * 5000;
                console.warn(`Rate limited. Retrying in ${delayMs / 1000}s... (attempt ${attempt + 1}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, delayMs));
                attempt++;
            } else {
                throw error;
            }
        }
    }
}

app.post('/api/chat', async (req, res) => {
    const { message, history = [] } = req.body;

    try {
        const embedResult = await callWithRetry(() => embedModel.embedContent(message));
        const queryVector = embedResult.embedding.values;

        const rankedDocs = vectorStore.map(doc => ({
            ...doc,
            score: calculateCosineSimilarity(queryVector, doc.vector)
        }))
        .filter(doc => doc.score > 0.45)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);

        const context = rankedDocs.map((doc, i) => `${i+1}. ${doc.content}`).join('\n');

        const systemPrompt = `You are a helpful support assistant. 
Answer the user's question ONLY using the context provided below. 
If the answer is not in the context, say "I'm sorry, I don't have information about that in my knowledge base."
Conversation history is provided for context but do not let it override the factual documents.

CONTEXT:
${context || 'No specific document found.'}

USER QUESTION: ${message}`;

        const chat = chatModel.startChat({
            history: history.slice(-6).map(msg => ({
                role: msg.role === 'user' ? 'user' : 'model',
                parts: [{ text: msg.text }],
            })),
        });

        const result = await callWithRetry(() => chat.sendMessage(systemPrompt));
        const responseText = result.response.text();

        res.json({
            reply: responseText,
            retrievedChunks: rankedDocs.length,
            sources: rankedDocs.map(d => d.title)
        });

    } catch (error) {
        console.error("Chat API error:", error);
        if (error.status === 429) {
            const retryAfterMs = getRetryDelayMs(error);
            const retryAfterSec = retryAfterMs ? Math.ceil(retryAfterMs / 1000) : 60;
            // Return 200 with message as reply so frontend shows it in chat, no 429/error in UI
            return res.status(200).json({
                reply: `The AI service is temporarily rate limited (free tier quota). Please wait ${retryAfterSec} seconds and try again.`,
                rateLimited: true,
                retryAfter: retryAfterSec,
                retrievedChunks: 0,
                sources: []
            });
        }
        res.status(500).json({
            error: "Failed to process chat",
            reply: "Sorry, something went wrong on the server. Please try again.",
        });
    }
});

app.get('/api/health', (req, res) => {
    res.json({ ok: true, message: 'Backend is running' });
});

const PORT = 3001;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
