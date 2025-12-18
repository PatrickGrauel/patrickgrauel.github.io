export const DataManager = {
    async loadUniverse() {
        const res = await fetch('data/universe.json');
        return await res.json();
    },
    async loadNetwork() {
        const res = await fetch('data/network.json');
        return await res.json();
    },
    async loadTicker(id) {
        const res = await fetch(`data/tickers/${id}.json`);
        return await res.json();
    }
};
