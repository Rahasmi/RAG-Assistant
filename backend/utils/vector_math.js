const similarity = require('compute-cosine-similarity');

function calculateCosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) {
        return 0;
    }
    const score = similarity(vecA, vecB);
    return score || 0;
}

module.exports = { calculateCosineSimilarity };
