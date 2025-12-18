import { GraphRenderer } from './graph.js';
import { SidebarRenderer } from './sidebar.js';
import { DataManager } from './data.js';

const App = {
    async init() {
        document.getElementById('meta-status').innerText = 'Loading Universe...';
        
        // 1. Load Data
        const network = await DataManager.loadNetwork();
        
        document.getElementById('meta-status').innerText = `${network.nodes.length} Tickers Loaded`;

        // 2. Init Components
        const graph = new GraphRenderer('#viz', network);
        const sidebar = new SidebarRenderer('#sidebar');

        // 3. Bind Events
        graph.onNodeClick(async (nodeId) => {
            // Lazy load heavy ticker data
            try {
                const data = await DataManager.loadTicker(nodeId);
                // Inject Ticker ID back into meta for display (since it's the filename)
                data.meta.id = nodeId; 
                sidebar.render(data);
                sidebar.open();
            } catch(e) {
                console.error("Failed to load ticker", e);
            }
        });
        
        // Sidebar Close
        document.getElementById('close-sidebar').addEventListener('click', () => {
            document.getElementById('sidebar').classList.add('hidden'); // Fix logic to hide
            graph.reset();
        });
        
        // Search
        document.getElementById('search').addEventListener('input', (e) => {
            const term = e.target.value.toUpperCase();
            if(!term) { graph.reset(); return; }
            const match = network.nodes.find(n => n.id.includes(term));
            if(match) graph.highlight(match);
        });
    }
};

App.init();
