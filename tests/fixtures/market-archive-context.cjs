// Representative synthetic 84-item batch, not captured account data.
module.exports = function context(id = 'batch', count = 84, finishedAt = 1000000) {
    const rows = Array.from({length: 20}, (_, i) => ({offerId: String(1000 + i), count: 33,
        offerResource: 'iron', offerAmount: 1000, requestResource: 'stone', requestAmount: 1000, compatibleEvidence: true}));
    return {version: 3, executionId: id, state: 'completed', createdAt: finishedAt - 100000,
        finishedAt, endedAt: finishedAt, revision: 1, batchAuthorization: {authorizedAt: finishedAt - 100000, plan: 'executable-plan'},
        queue: Array.from({length: count}, (_, i) => ({id: id + ':' + i, villageId: String(i + 1), status: 'created',
            offerResource: 'iron', requestResource: 'stone', offerAmount: 1000, requestAmount: 1000, repeatCount: 33,
            offerId: String(9000 + i), confirmation: {evidence: 'new-compatible-offer-id'},
            attempt: {attemptId: id + ':attempt:' + i, state: 'completed', submitAt: finishedAt - 1000,
                beforeSnapshot: {available: true, offerIds: rows.map(r => r.offerId), rows}},
            diagnosticEvents: Array.from({length: 8}, () => ({event: 'prepared', detail: 'x'.repeat(100)}))}))};
};
