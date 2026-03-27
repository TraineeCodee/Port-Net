import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, addDoc, serverTimestamp, updateDoc, doc } from 'firebase/firestore';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyB1oc8B99JQprZYDoijAwfrol3J-5AqS6A",
  authDomain: "port-net.firebaseapp.com",
  projectId: "port-net",
  storageBucket: "port-net.firebasestorage.app",
  messagingSenderId: "562987479269",
  appId: "1:562987479269:web:64c3a45e0fc0216762e40c",
  measurementId: "G-LWG8Y77JTS"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Make functions globally available since this is now a module
window.navigateTo = navigateTo;
window.logout = logout;
window.selectRole = selectRole;
window.loadPortalView = loadPortalView;
window.simulateAction = simulateAction;

// Initialize Lucide Icons
lucide.createIcons();

// State
let currentRole = 'manager';
let isLoggedIn = false;
let currentPortalView = '';

// Data
let mockVessels = [];
let mockCargo = [];
let mockTasks = [];

window.fetchFromDatabase = async function() {
    try {
        const now = new Date();
        const vesselsSnapshot = await getDocs(collection(db, "vessels"));
        mockVessels = await Promise.all(vesselsSnapshot.docs.map(async (d) => {
            const data = d.data();
            let status = data.status;
            // Check if ETA has passed
            if (data.eta && status === 'In Transit') {
                const etaDate = new Date(data.eta);
                if (!isNaN(etaDate.getTime()) && now >= etaDate) {
                    status = 'Docked';
                    try { await updateDoc(doc(db, "vessels", d.id), { status: 'Docked' }); } catch(e) { console.error(e); }
                }
            }
            return { dbId: d.id, ...data, status };
        }));

        const cargoSnapshot = await getDocs(collection(db, "cargo"));
        mockCargo = cargoSnapshot.docs.map(doc => ({ dbId: doc.id, ...doc.data() }));
        
        const tasksSnapshot = await getDocs(collection(db, "tasks"));
        mockTasks = tasksSnapshot.docs.map(doc => ({ dbId: doc.id, ...doc.data() }));

        // Refresh Current View if Portal Data changed
        if (currentPortalView && document.querySelector('.portal-layout.active')) {
             loadPortalView(currentPortalView);
        }
    } catch (error) {
        console.error("Error fetching data from Firestore:", error);
    }
};

window.submitCargoUpload = async function() {
    const vessel = document.getElementById('cargo-vessel').value;
    const type = document.getElementById('cargo-type').value;
    const origin = document.getElementById('cargo-origin').value;
    const weight = document.getElementById('cargo-weight') ? document.getElementById('cargo-weight').value : 'N/A';

    if (!type || !origin) {
        showToast("Please fill out all cargo details.");
        return;
    }

    try {
        const docRef = await addDoc(collection(db, "cargo"), {
            ref: 'CRG-' + Math.floor(Math.random() * 900 + 100),
            type: type,
            origin: origin,
            weight: weight,
            status: 'Inspection',
            vessel: vessel,
            createdAt: serverTimestamp()
        });
        showToast("Cargo details uploaded to Firestore successfully.");
        
        // If the vessel is Docked, promote it to Pending Clearance
        const vesselDetails = mockVessels.find(v => v.name === vessel);
        if (vesselDetails && vesselDetails.status === 'Docked') {
            await updateDoc(doc(db, "vessels", vesselDetails.dbId), { status: 'Pending Clearance' });
            showToast(`${vessel} status updated to Pending Clearance.`);
        }
        
        await window.fetchFromDatabase(); // Refresh data
        document.getElementById('cargo-type').value = '';
        document.getElementById('cargo-origin').value = '';
        if (document.getElementById('cargo-weight')) document.getElementById('cargo-weight').value = '';
    } catch (error) {
        console.error("Error adding document: ", error);
        showToast("Error saving to database. Check console for Firebase Config issues.");
    }
};

window.submitNewVessel = async function() {
    const name = document.getElementById('vessel-name').value;
    const status = document.getElementById('vessel-status').value;
    const eta = document.getElementById('vessel-eta').value;
    const cargoType = document.getElementById('vessel-cargo-type').value;

    if (!name || !eta || !cargoType) {
        showToast("Please fill out all vessel details.");
        return;
    }

    try {
        await addDoc(collection(db, "vessels"), {
            id: 'V-' + Math.floor(Math.random() * 9000 + 1000),
            name: name,
            status: status,
            eta: eta,
            cargo: cargoType,
            createdAt: serverTimestamp()
        });
        showToast("Vessel added to database successfully.");
        await window.fetchFromDatabase(); // Refresh data
    } catch (error) {
        console.error("Error adding vessel: ", error);
        showToast("Error saving vessel to database. Check console.");
    }
};

window.submitNewTask = async function() {
    const assignee = document.getElementById('task-assignee').value;
    const priority = document.getElementById('task-priority').value;
    const description = document.getElementById('task-description').value;

    if (!description.trim()) {
        showToast("Please provide a task description.");
        return;
    }

    try {
        await addDoc(collection(db, "tasks"), {
            assignee: assignee,
            priority: priority,
            description: description,
            createdAt: serverTimestamp()
        });
        showToast(`Task assigned to ${assignee} successfully.`);
        await window.fetchFromDatabase(); // Refresh data
        document.getElementById('task-description').value = '';
    } catch (error) {
        console.error("Error adding task: ", error);
        showToast("Error assigning task. Check console.");
    }
};

window.clearCargo = async function(cargoDbId, vesselName) {
    try {
        await updateDoc(doc(db, "cargo", cargoDbId), { status: 'Cleared' });
        showToast("Cargo approved and cleared.");
        
        await window.fetchFromDatabase();

        const allCargoForVessel = mockCargo.filter(c => c.vessel === vesselName);
        const allCleared = allCargoForVessel.length > 0 && allCargoForVessel.every(c => c.status === 'Cleared');

        if (allCleared) {
            const vesselDetails = mockVessels.find(v => v.name === vesselName);
            if (vesselDetails && (vesselDetails.status === 'Pending Clearance' || vesselDetails.status === 'Docked')) {
                await updateDoc(doc(db, "vessels", vesselDetails.dbId), { status: 'Cleared for Departure' });
                showToast(`All cargo cleared! ${vesselName} is now Cleared for Departure.`);
                await window.fetchFromDatabase();
            }
        }
    } catch (error) {
        console.error("Error clearing cargo: ", error);
        showToast("Error updating cargo. Check console.");
    }
};

// Navigation
function navigateTo(viewId) {
    if (viewId === 'portal' && !isLoggedIn) {
        navigateTo('login');
        return;
    }
    
    // Hide all views
    document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
    
    // Update nav links
    document.querySelectorAll('.nav-link').forEach(el => {
        el.classList.remove('active');
        if (el.dataset.target === viewId) {
            el.classList.add('active');
        }
    });
    
    // Show selected view
    document.getElementById(`view-${viewId}`).classList.add('active');

    // If portal, load default dashboard
    if (viewId === 'portal') {
        loadPortalSidebar();
        let defaultView = 'manager-dashboard';
        if (currentRole === 'agent') defaultView = 'agent-dashboard';
        else if (currentRole === 'worker') defaultView = 'worker-tasks';
        loadPortalView(defaultView);
    }
}

// Authentication
function selectRole(role) {
    currentRole = role;
    document.querySelectorAll('.role-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`[data-role="${role}"]`).classList.add('active');
}

document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;
    
    if (username.length < 4) {
        showToast("Username must be at least 4 characters long.");
        return;
    }
    
    if (password.length < 6) {
        showToast("Password must be at least 6 characters long.");
        return;
    }

    showToast("Connecting to Database...");
    await window.fetchFromDatabase();

    isLoggedIn = true;
    
    // Update Navbar
    document.getElementById('nav-login-btn').style.display = 'none';
    document.getElementById('nav-user-profile').style.display = 'block';
    
    let displayRole = 'Port Manager';
    if (currentRole === 'agent') displayRole = 'Shipping Agent';
    else if (currentRole === 'worker') displayRole = 'Port Worker';
    
    document.getElementById('nav-username').textContent = displayRole;
    
    showToast(`Logged in successfully as ${displayRole}`);
    navigateTo('portal');
});

function logout() {
    isLoggedIn = false;
    currentRole = 'manager';
    
    // Reset Navbar
    document.getElementById('nav-login-btn').style.display = 'block';
    document.getElementById('nav-user-profile').style.display = 'none';
    
    showToast('Logged out successfully');
    navigateTo('home');
}

// Portal Navigation
function loadPortalSidebar() {
    const sidebar = document.getElementById('portal-sidebar');
    let links = '';
    
    if (currentRole === 'manager') {
        links = `
            <div class="sidebar-link active" onclick="loadPortalView('manager-dashboard', this)">
                <i data-lucide="layout-dashboard"></i> Dashboard
            </div>
            <div class="sidebar-link" onclick="loadPortalView('manager-vessels', this)">
                <i data-lucide="ship"></i> Manage Vessels
            </div>
            <div class="sidebar-link" onclick="loadPortalView('manager-cargo', this)">
                <i data-lucide="box"></i> Monitor Cargo
            </div>
            <div class="sidebar-link" onclick="loadPortalView('manager-reports', this)">
                <i data-lucide="file-text"></i> Generate Report
            </div>
            <div class="sidebar-link" onclick="loadPortalView('manager-assign', this)">
                <i data-lucide="user-check"></i> Assign Task
            </div>
        `;
    } else if (currentRole === 'agent') {
        links = `
            <div class="sidebar-link active" onclick="loadPortalView('agent-dashboard', this)">
                <i data-lucide="layout-dashboard"></i> Dashboard
            </div>
            <div class="sidebar-link" onclick="loadPortalView('agent-upload', this)">
                <i data-lucide="upload-cloud"></i> Upload Cargo
            </div>
            <div class="sidebar-link" onclick="loadPortalView('agent-track', this)">
                <i data-lucide="crosshair"></i> Track Vessel
            </div>
        `;
    } else if (currentRole === 'worker') {
        links = `
            <div class="sidebar-link active" onclick="loadPortalView('worker-tasks', this)">
                <i data-lucide="clipboard-list"></i> My Tasks
            </div>
            <div class="sidebar-link" onclick="loadPortalView('worker-vessels', this)">
                <i data-lucide="anchor"></i> Docked Vessels
            </div>
        `;
    }
    
    sidebar.innerHTML = links;
    lucide.createIcons();
}

function loadPortalView(viewId, element = null) {
    if (element) {
        document.querySelectorAll('.sidebar-link').forEach(el => el.classList.remove('active'));
        element.classList.add('active');
    }
    
    const main = document.getElementById('portal-main');
    currentPortalView = viewId;
    
    let html = '';
    
    switch(viewId) {
        // --- MANAGER VIEWS ---
        case 'manager-dashboard':
            html = `
                <div class="page-header" style="text-align: left; margin-bottom: 2rem;">
                    <h2>Manager Dashboard</h2>
                    <p>Overview of port operations and key metrics.</p>
                </div>
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-icon"><i data-lucide="ship"></i></div>
                        <div class="stat-info"><h4>Active Vessels</h4><p>${mockVessels.filter(v => v.status !== 'Cleared for Departure').length}</p></div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon"><i data-lucide="box"></i></div>
                        <div class="stat-info"><h4>Pending Cargo</h4><p>${mockCargo.filter(c => c.status === 'Inspection').length}</p></div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon"><i data-lucide="alert-triangle"></i></div>
                        <div class="stat-info"><h4>Critical Alerts</h4><p>0</p></div>
                    </div>
                </div>
                <div class="card">
                    <h3>Recent Operations</h3>
                    <p style="margin-top:1rem; color:var(--text-secondary);">Connected to Live Database. Operations nominal.</p>
                </div>
            `;
            break;
        case 'manager-vessels':
            html = `
                <div class="page-header" style="text-align: left; margin-bottom: 2rem;">
                    <h2>Manage Vessels</h2>
                    <p>Add new incoming vessels to the port database.</p>
                </div>
                <div class="card form-container" style="max-width: 600px; margin-bottom: 2rem;">
                    <div class="form-group">
                        <label>Vessel Name</label>
                        <input type="text" id="vessel-name" placeholder="e.g. Oceanic Horizon" required />
                    </div>
                    <div class="form-group">
                        <label>Vessel Status</label>
                        <select id="vessel-status">
                            <option>In Transit</option>
                            <option>Docked</option>
                            <option>Pending Clearance</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>ETA (Estimated Time of Arrival)</label>
                        <input type="datetime-local" id="vessel-eta" required />
                    </div>
                    <div class="form-group">
                        <label>Primary Cargo Type</label>
                        <input type="text" id="vessel-cargo-type" placeholder="e.g. Containers, Oil" required />
                    </div>
                    <button class="btn btn-primary" onclick="submitNewVessel()">Add Vessel</button>
                </div>
                <div class="table-container">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Vessel ID</th>
                                <th>Name</th>
                                <th>Status</th>
                                <th>ETA</th>
                                <th>Cargo</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${mockVessels.map(v => {
                                const etaFormatted = (!isNaN(new Date(v.eta).getTime())) ? new Date(v.eta).toLocaleString() : v.eta;
                                return `
                                <tr>
                                    <td><strong>${v.id}</strong></td>
                                    <td>${v.name}</td>
                                    <td><span class="badge ${v.status === 'Docked' ? 'badge-success' : 'badge-primary'}">${v.status}</span></td>
                                    <td>${etaFormatted}</td>
                                    <td>${v.cargo}</td>
                                </tr>
                            `}).join('')}
                        </tbody>
                    </table>
                </div>
            `;
            break;
        case 'manager-cargo':
            html = `
                <div class="page-header" style="text-align: left; margin-bottom: 2rem;">
                    <h2>Monitor Cargo</h2>
                    <p>Real-time log of cargo movements.</p>
                </div>
                <div class="table-container">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Ref #</th>
                                <th>Type</th>
                                <th>Origin</th>
                                <th>Weight</th>
                                <th>Vessel</th>
                                <th>Status</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${mockCargo.map(c => `
                                <tr>
                                    <td><strong>${c.ref}</strong></td>
                                    <td>${c.type}</td>
                                    <td>${c.origin}</td>
                                    <td>${c.weight || 'N/A'} Tons</td>
                                    <td>${c.vessel}</td>
                                    <td><span class="badge ${c.status === 'Cleared' ? 'badge-success' : 'badge-warning'}">${c.status}</span></td>
                                    <td>${c.status === 'Inspection' ? `<button class="btn btn-outline" style="padding: 0.2rem 0.5rem; font-size: 0.8rem;" onclick="clearCargo('${c.dbId}', '${c.vessel}')">Approve</button>` : `<i data-lucide="check" style="color:var(--success)"></i>`}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
            break;
        case 'manager-reports':
            html = `
                <div class="page-header" style="text-align: left; margin-bottom: 2rem;">
                    <h2>Generate Reports</h2>
                    <p>Export operational data and analytics.</p>
                </div>
                <div class="card form-container" style="max-width: 600px;">
                    <div class="form-group">
                        <label>Report Type</label>
                        <select>
                            <option>Daily Operations Summary</option>
                            <option>Cargo Throughput</option>
                            <option>Vessel Delay Analysis</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Date Range</label>
                        <div style="display:flex; gap:1rem;">
                            <input type="date" style="flex:1;">
                            <input type="date" style="flex:1;">
                        </div>
                    </div>
                    <button class="btn btn-primary" onclick="simulateAction('Report generated successfully!')">Generate & Download</button>
                </div>
            `;
            break;
        case 'manager-assign':
            html = `
                <div class="page-header" style="text-align: left; margin-bottom: 2rem;">
                    <h2>Assign Task</h2>
                    <p>Delegate operations to shipping agents or port staff.</p>
                </div>
                <div class="card form-container" style="max-width: 600px; margin-bottom: 2rem;">
                    <div class="form-group">
                        <label>Assignee</label>
                        <select id="task-assignee">
                            <option>Agent: Sarah Jenkins</option>
                            <option>Agent: Michael Chang</option>
                            <option>Staff: Docking Bay Team Alpha</option>
                            <option>Staff: Crane Operator Group B</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Task Priority</label>
                        <select id="task-priority">
                            <option>Normal</option>
                            <option>High</option>
                            <option>Critical</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Task Description</label>
                        <textarea id="task-description" rows="4" placeholder="Detail the task requirements..." required></textarea>
                    </div>
                    <button class="btn btn-primary" onclick="submitNewTask()">Assign Task</button>
                </div>
                
                ${mockTasks && mockTasks.length > 0 ? `
                <div class="table-container">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Assignee</th>
                                <th>Priority</th>
                                <th>Description</th>
                                <th>Date Issued</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${mockTasks.map(t => `
                                <tr>
                                    <td><strong>${t.assignee}</strong></td>
                                    <td><span class="badge ${t.priority === 'Critical' ? 'badge-warning' : (t.priority === 'High' ? 'badge-primary' : 'badge-success')}">${t.priority}</span></td>
                                    <td>${t.description}</td>
                                    <td>${t.createdAt ? new Date(t.createdAt.seconds * 1000).toLocaleDateString() : 'Just now'}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                ` : ''}
            `;
            break;

        // --- AGENT VIEWS ---
        case 'agent-dashboard':
            html = `
                <div class="page-header" style="text-align: left; margin-bottom: 2rem;">
                    <h2>Agent Dashboard</h2>
                    <p>Manage your fleet and shipping documentation.</p>
                </div>
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-icon" style="background: rgba(16, 185, 129, 0.1); color: var(--success);"><i data-lucide="check-circle"></i></div>
                        <div class="stat-info"><h4>Total Uploaded Cargo</h4><p>${mockCargo.length}</p></div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon" style="background: rgba(245, 158, 11, 0.1); color: var(--warning);"><i data-lucide="clock"></i></div>
                        <div class="stat-info"><h4>Active Vessels</h4><p>${mockVessels.filter(v => v.status !== 'Cleared for Departure').length}</p></div>
                    </div>
                </div>
            `;
            break;
        case 'agent-upload':
            html = `
                <div class="page-header" style="text-align: left; margin-bottom: 2rem;">
                    <h2>Upload Cargo Details</h2>
                    <p>Submit documentation and manifests for incoming shipments.</p>
                </div>
                <div class="card form-container" style="max-width: 600px;" id="cargo-upload-form">
                    <div class="form-group">
                        <label>Vessel Association</label>
                        <select id="cargo-vessel">
                            ${mockVessels.filter(v => v.status !== 'Cleared for Departure').length ? mockVessels.filter(v => v.status !== 'Cleared for Departure').map(v => `<option value="${v.name}">${v.name} (${v.id || v.ref || 'N/A'})</option>`).join('') : '<option>No active vessels available.</option>'}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Cargo Type / Manifest Info</label>
                        <input type="text" id="cargo-type" placeholder="e.g. Electronics, Machinery" required />
                    </div>
                    <div class="form-group">
                        <label>Origin</label>
                        <input type="text" id="cargo-origin" placeholder="e.g. Shanghai" required />
                    </div>
                    <div class="form-group">
                        <label>Total Weight (Tons)</label>
                        <input type="number" id="cargo-weight" placeholder="10.5" required />
                    </div>
                    <button class="btn btn-primary" onclick="submitCargoUpload()">Submit Details</button>
np                </div>
            `;
            break;
        case 'agent-track':
            html = `
                <div class="page-header" style="text-align: left; margin-bottom: 2rem;">
                    <h2>Track Vessel Status</h2>
                    <p>Live updates on your assigned fleet.</p>
                </div>
                <div class="table-container">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Vessel ID</th>
                                <th>Name</th>
                                <th>Ext. Cargo</th>
                                <th>ETA</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${mockVessels.map(v => {
                                const etaFormatted = (!isNaN(new Date(v.eta).getTime())) ? new Date(v.eta).toLocaleString() : v.eta;
                                return `
                                <tr>
                                    <td><strong>${v.id}</strong></td>
                                    <td>${v.name}</td>
                                    <td>${v.cargo}</td>
                                    <td>${etaFormatted}</td>
                                    <td><span class="badge ${v.status === 'Docked' ? 'badge-success' : 'badge-primary'}">${v.status}</span></td>
                                </tr>
                            `}).join('')}
                        </tbody>
                    </table>
                </div>
            `;
            break;
            
        // --- WORKER VIEWS ---
        case 'worker-tasks':
            html = `
                <div class="page-header" style="text-align: left; margin-bottom: 2rem;">
                    <h2>Assigned Tasks</h2>
                    <p>Review the duties assigned to you by the Port Manager.</p>
                </div>
                <div class="table-container">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Assignee</th>
                                <th>Priority</th>
                                <th>Description</th>
                                <th>Date Issued</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${mockTasks.length ? mockTasks.map(t => `
                                <tr>
                                    <td><strong>${t.assignee}</strong></td>
                                    <td><span class="badge ${t.priority === 'Critical' ? 'badge-warning' : (t.priority === 'High' ? 'badge-primary' : 'badge-success')}">${t.priority}</span></td>
                                    <td>${t.description}</td>
                                    <td>${t.createdAt ? new Date(t.createdAt.seconds * 1000).toLocaleDateString() : 'Just now'}</td>
                                </tr>
                            `).join('') : `<tr><td colspan="4" style="text-align:center;">No pending tasks assigned.</td></tr>`}
                        </tbody>
                    </table>
                </div>
            `;
            break;
            
        case 'worker-vessels':
            const dockedVessels = mockVessels.filter(v => v.status === 'Docked');
            html = `
                <div class="page-header" style="text-align: left; margin-bottom: 2rem;">
                    <h2>Docked Vessels</h2>
                    <p>Overview of ships currently docked and requiring port operations.</p>
                </div>
                <div class="table-container">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Vessel ID</th>
                                <th>Name</th>
                                <th>Status</th>
                                <th>Arrival ETA</th>
                                <th>Cargo Requirement</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${dockedVessels.length ? dockedVessels.map(v => {
                                const etaFormatted = (!isNaN(new Date(v.eta).getTime())) ? new Date(v.eta).toLocaleString() : v.eta;
                                return `
                                <tr>
                                    <td><strong>${v.id}</strong></td>
                                    <td>${v.name}</td>
                                    <td><span class="badge badge-success">${v.status}</span></td>
                                    <td>${etaFormatted}</td>
                                    <td>${v.cargo}</td>
                                </tr>
                                `
                            }).join('') : `<tr><td colspan="5" style="text-align:center;">No vessels are currently docked.</td></tr>`}
                        </tbody>
                    </table>
                </div>
            `;
            break;
    }
    
    main.innerHTML = html;
    
    // Re-initialize icons for newly injected HTML
    setTimeout(() => {
        lucide.createIcons();
    }, 10);
}

// Utility functions
function showToast(message) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<i data-lucide="info"></i> <span>${message}</span>`;
    
    container.appendChild(toast);
    lucide.createIcons();
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function simulateAction(msg) {
    showToast(msg);
}

// Set initial view on load
document.addEventListener('DOMContentLoaded', () => {
    // Prevent default form behavior on contact page
    document.querySelector('#view-contact form').addEventListener('submit', (e) => {
        e.preventDefault();
        showToast('Message sent to our support team!');
        e.target.reset();
    });
    
    // Initialize Navbar clicks
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            navigateTo(e.target.dataset.target);
        });
    });
});
