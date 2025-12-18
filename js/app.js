import { GraphRenderer } from './graph.js';
import { SidebarRenderer } from './sidebar.js';
import { DataManager } from './data.js';

const App = {
    async init() {
        try {
            const network = await DataManager.loadNetwork();
            
            // Randomize positions slightly to prevent collision on init
            const width = window.innerWidth;
            const height = window.innerHeight;
            network.nodes.forEach(n => { n.x = Math.random() * width; n.y = Math.random() * height; });

            const graph = new GraphRenderer('#viz', network);
            const sidebar = new SidebarRenderer('#sidebar');
            
            document.getElementById('loading-overlay').style.display = 'none';

            // --- BIND EVENTS ---

            // 1. Search
            document.getElementById('search-input').addEventListener('input', (e) => {
                const term = e.target.value.toUpperCase();
                if(!term) { graph.reset(); return; }
                
                const match = network.nodes.find(n => n.id.includes(term) || n.n.toUpperCase().includes(term));
                if(match) {
                    graph.highlight(match);
                    this.openTicker(match.id, sidebar);
                }
            });

            // 2. Score Filter
            document.getElementById('score-filter').addEventListener('input', (e) => {
                const val = parseInt(e.target.value);
                document.getElementById('score-val').innerText = val;
                graph.filter(val);
            });

            // 3. Node Click
            graph.onNodeClick((nodeId) => this.openTicker(nodeId, sidebar));

            // 4. Sidebar Close
            document.getElementById('close-sidebar').addEventListener('click', () => {
                document.getElementById('sidebar').classList.remove('visible');
                graph.reset();
            });

            // 5. Tabs
            document.querySelectorAll('.tab').forEach(t => {
                t.addEventListener('click', () => {
                    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
                    document.querySelectorAll('.sidebar-content').forEach(x => x.classList.remove('active'));
                    t.classList.add('active');
                    document.getElementById(t.dataset.target).classList.add('active');
                });
            });

        } catch (e) {
            console.error("App Init Failed:", e);
            document.getElementById('loading-overlay').innerText = "Error Loading Data. Check Console.";
        }
    },

    async openTicker(id, sidebar) {
        try {
            const data = await DataManager.loadTicker(id);
            data.meta.id = id; // Ensure ID availability
            sidebar.render(data);
            sidebar.open();
        } catch(e) {
            console.error("Could not load ticker:", id);
        }
    }
};

App.init();
