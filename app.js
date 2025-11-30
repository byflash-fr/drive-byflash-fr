const API_URL = 'https://api.byflash.fr/index.php';

const App = {
    token: null,
    userId: null,
    userEmail: null,
    currentView: 'files',
    currentFolder: null,
    selectedFile: null,
    files: [],
    trash: [],

    init() {
        this.checkAuth();
        this.bindEvents();
    },

    checkAuth() {
        const token = localStorage.getItem('api_token');
        const email = localStorage.getItem('user_email');

        if (token && email) {
            this.token = token;
            this.userEmail = email;
            this.showMainPage();
        } else {
            this.showLoginPage();
        }
    },

    showLoginPage() {
        document.getElementById('login-page').classList.add('active');
        document.getElementById('main-page').classList.remove('active');
    },

    showMainPage() {
        document.getElementById('login-page').classList.remove('active');
        document.getElementById('main-page').classList.add('active');
        document.getElementById('user-email').textContent = this.userEmail;
        this.loadFiles();
    },

    bindEvents() {
        document.getElementById('login-form').addEventListener('submit', (e) => this.handleLogin(e));
        document.getElementById('logout-btn').addEventListener('click', () => this.handleLogout());
        document.getElementById('upload-btn').addEventListener('click', () => this.openUploadModal());
        document.getElementById('new-folder-btn').addEventListener('click', () => this.openFolderModal());

        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchView(e));
        });

        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => this.handleNavigation(e));
        });

        document.getElementById('search-input').addEventListener('input', (e) => this.handleSearch(e));

        this.setupDragAndDrop();
        this.setupModals();
        this.setupContextMenu();

        document.addEventListener('click', () => {
            document.getElementById('context-menu').classList.remove('active');
        });
    },

    async handleLogin(e) {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        const errorDiv = document.getElementById('login-error');

        errorDiv.textContent = 'Connexion...';

        try {
            const response = await fetch(`${API_URL}?action=login`, {
                method: 'POST',
                mode: 'cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            if (!response.ok) throw new Error('Erreur HTTP ' + response.status);

            const data = await response.json();

            if (data.success) {
                this.token = data.api_token;
                this.userEmail = email;
                localStorage.setItem('api_token', data.api_token);
                localStorage.setItem('user_email', email);
                this.showMainPage();
            } else {
                errorDiv.textContent = data.error || 'Identifiants incorrects';
            }
        } catch (error) {
            console.error(error);
            errorDiv.textContent = 'Erreur de connexion serveur';
        }
    },

    handleLogout() {
        localStorage.removeItem('api_token');
        localStorage.removeItem('user_email');
        this.token = null;
        this.userEmail = null;
        this.showLoginPage();
    },

    async apiRequest(endpoint, options = {}) {
        const url = `${API_URL}?action=${endpoint}`;
        
        const headers = {
            'Authorization': `Bearer ${this.token}`,
            'Content-Type': 'application/json',
            ...options.headers
        };

        if (options.body instanceof FormData) {
            delete headers['Content-Type'];
        }

        try {
            const response = await fetch(url, { ...options, mode: 'cors', headers });
            
            if (!response.ok) {
                if (response.status === 401) {
                    this.handleLogout();
                    return { success: false, error: "Session expirée" };
                }
                const errorData = await response.json().catch(() => ({}));
                return { success: false, error: errorData.error || `Erreur ${response.status}` };
            }
            return await response.json();
        } catch (error) {
            console.error('API Error:', error);
            this.showToast('Erreur de connexion');
            return { success: false, error: error.message };
        }
    },

    async loadFiles() {
        this.showLoading();
        this.updateBreadcrumb(); // Mise à jour du fil d'ariane

        const params = this.currentFolder ? `&group_id=${this.currentFolder}` : '';
        const data = await this.apiRequest(`files${params}`);

        if (data.success) {
            this.files = data.files;
            this.renderFiles();
        }
        this.hideLoading();
    },

    // --- GESTION DU FIL D'ARIANE (Navigation) ---
    updateBreadcrumb() {
        const breadcrumb = document.querySelector('.breadcrumb');
        
        if (this.currentFolder) {
            // Si dans un dossier
            breadcrumb.innerHTML = `
                <span class="breadcrumb-item" id="bc-home" style="cursor:pointer; color: #3b82f6;">
                    <i class="fas fa-home"></i> Accueil
                </span>
                <span style="margin: 0 5px; color: #999;">/</span>
                <span class="breadcrumb-item active">
                    <i class="fas fa-folder-open"></i> Dossier ${this.currentFolder.substring(0, 8)}
                </span>
            `;
            // Clic sur "Accueil" pour revenir en arrière
            document.getElementById('bc-home').addEventListener('click', () => {
                this.currentFolder = null;
                this.loadFiles();
            });
        } else {
            // Si à la racine
            breadcrumb.innerHTML = `
                <span class="breadcrumb-item active">
                    <i class="fas fa-home"></i> Accueil
                </span>
            `;
        }
    },

    async loadTrash() {
        this.showLoading();
        const data = await this.apiRequest('trash_list');

        if (data.success) {
            this.trash = data.trash;
            this.renderTrash();
        }
        this.hideLoading();
    },

    renderFiles() {
        const container = document.getElementById('file-container');
        container.innerHTML = '';

        if (!this.files || this.files.length === 0) {
            container.innerHTML = '<div style="text-align: center; padding: 40px; color: #666;">Aucun fichier dans ce dossier</div>';
            return;
        }

        const groupedFiles = this.groupFilesByFolder();

        Object.entries(groupedFiles).forEach(([groupId, files]) => {
            // Dossiers (si on est à la racine)
            if (groupId !== 'null' && !this.currentFolder) {
                container.appendChild(this.createFolderItem(groupId, files));
            } 
            // Fichiers (racine ou intérieur dossier)
            else if (this.currentFolder || groupId === 'null') {
                files.forEach(file => container.appendChild(this.createFileItem(file)));
            }
        });
    },

    groupFilesByFolder() {
        const grouped = {};
        this.files.forEach(file => {
            const key = file.group_id || 'null';
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(file);
        });
        return grouped;
    },

    createFolderItem(groupId, files) {
        const div = document.createElement('div');
        div.className = 'file-item';
        div.dataset.groupId = groupId;
        div.innerHTML = `
            <i class="fas fa-folder file-icon folder"></i>
            <div class="file-name">Dossier ${groupId.substring(0, 8)}</div>
            <div class="file-meta">${files.length} fichier(s)</div>
        `;
        
        // --- NAVIGATION AU CLIC SIMPLE ---
        div.addEventListener('click', (e) => {
            e.stopPropagation(); // Évite la sélection
            this.currentFolder = groupId;
            this.loadFiles();
        });

        div.addEventListener('contextmenu', (e) => this.showContextMenu(e, groupId, 'folder'));
        return div;
    },

    createFileItem(file) {
        const div = document.createElement('div');
        div.className = 'file-item';
        div.dataset.fileId = file.id;
        const icon = this.getFileIcon(file.name);
        div.innerHTML = `
            <i class="fas ${icon} file-icon"></i>
            <div class="file-name">${file.name}</div>
            <div class="file-meta">${this.formatFileSize(file.size)}</div>
        `;
        div.addEventListener('click', () => this.selectFile(file.id));
        div.addEventListener('contextmenu', (e) => this.showContextMenu(e, file.id, 'file'));
        return div;
    },

    getFileIcon(filename) {
        if (!filename) return 'fa-file';
        const ext = filename.split('.').pop().toLowerCase();
        const icons = { 'pdf': 'fa-file-pdf', 'doc': 'fa-file-word', 'docx': 'fa-file-word', 'xls': 'fa-file-excel', 'jpg': 'fa-file-image', 'png': 'fa-file-image', 'zip': 'fa-file-archive', 'mp4': 'fa-file-video' };
        return icons[ext] || 'fa-file';
    },

    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024; const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + ['B', 'KB', 'MB', 'GB'][i];
    },

    selectFile(fileId) {
        document.querySelectorAll('.file-item').forEach(item => item.classList.remove('selected'));
        const item = document.querySelector(`[data-file-id="${fileId}"]`);
        if (item) {
            item.classList.add('selected');
            this.selectedFile = this.files.find(f => f.id === fileId);
        }
    },

    renderTrash() {
        const container = document.getElementById('trash-container');
        container.innerHTML = '';
        if (!this.trash || this.trash.length === 0) {
            container.innerHTML = '<div style="text-align: center; padding: 40px; color: #666;">Corbeille vide</div>';
            return;
        }
        this.trash.forEach(item => {
            const div = document.createElement('div');
            div.className = 'file-item';
            const icon = item.item_type === 'folder' ? 'fa-folder' : this.getFileIcon(item.original_name);
            div.innerHTML = `
                <i class="fas ${icon} file-icon"></i>
                <div class="file-name">${item.original_name}</div>
                <div class="file-meta">Supprimé le ${new Date(item.created_at).toLocaleDateString()}</div>
            `;
            div.addEventListener('click', () => this.restoreItem(item.item_id));
            container.appendChild(div);
        });
    },

    async restoreItem(itemId) {
        const data = await this.apiRequest('restore', { method: 'POST', body: JSON.stringify({ id: itemId }) });
        if (data.success) { this.showToast('Restauré'); this.loadTrash(); } else { this.showToast('Erreur'); }
    },

    handleNavigation(e) {
        e.preventDefault();
        const view = e.currentTarget.dataset.view;
        document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
        e.currentTarget.classList.add('active');
        this.currentView = view;
        
        const fileContainer = document.getElementById('file-container');
        const trashContainer = document.getElementById('trash-container');
        const uploadBtn = document.getElementById('upload-btn');
        const newFolderBtn = document.getElementById('new-folder-btn');

        if (view === 'files') {
            fileContainer.style.display = 'grid';
            trashContainer.style.display = 'none';
            uploadBtn.style.display = 'inline-flex';
            newFolderBtn.style.display = 'inline-flex';
            this.loadFiles();
        } else if (view === 'trash') {
            fileContainer.style.display = 'none';
            trashContainer.style.display = 'grid';
            uploadBtn.style.display = 'none';
            newFolderBtn.style.display = 'none';
            this.loadTrash();
        }
    },

    switchView(e) {
        const view = e.currentTarget.dataset.view;
        document.querySelectorAll('.view-btn').forEach(btn => btn.classList.remove('active'));
        e.currentTarget.classList.add('active');
        document.getElementById('file-container').className = view === 'grid' ? 'file-grid' : 'file-grid file-list';
    },

    setupDragAndDrop() {
        const dropZone = document.getElementById('drop-zone');
        const main = document.querySelector('.main-content');
        ['dragenter', 'dragover'].forEach(e => main.addEventListener(e, (evt) => { evt.preventDefault(); dropZone.classList.add('active'); }));
        ['dragleave', 'drop'].forEach(e => main.addEventListener(e, (evt) => { evt.preventDefault(); dropZone.classList.remove('active'); }));
        main.addEventListener('drop', (e) => {
            if (e.dataTransfer.files.length > 0) this.uploadFiles(e.dataTransfer.files);
        });
    },

    async uploadFiles(files) {
        this.showLoading();
        const groupId = this.currentFolder || this.generateUUID();
        for (let i = 0; i < files.length; i++) {
            const formData = new FormData();
            formData.append('file', files[i]);
            formData.append('group_id', groupId);
            const data = await this.apiRequest('upload', { method: 'POST', body: formData });
            if (!data.success) this.showToast(`Erreur upload: ${files[i].name}`);
        }
        this.hideLoading();
        this.showToast('Terminé');
        this.loadFiles();
    },

    openUploadModal() { document.getElementById('upload-modal').classList.add('active'); },
    openFolderModal() { document.getElementById('folder-modal').classList.add('active'); },

    setupModals() {
        document.querySelectorAll('.close-btn').forEach(btn => btn.addEventListener('click', function() { this.closest('.modal').classList.remove('active'); }));
        document.getElementById('cancel-upload').addEventListener('click', () => document.getElementById('upload-modal').classList.remove('active'));
        document.getElementById('confirm-upload').addEventListener('click', () => {
            const input = document.getElementById('file-input');
            if (input.files.length) { this.uploadFiles(input.files); document.getElementById('upload-modal').classList.remove('active'); input.value = ''; }
        });
        document.getElementById('cancel-folder').addEventListener('click', () => document.getElementById('folder-modal').classList.remove('active'));
        document.getElementById('confirm-folder').addEventListener('click', () => {
            const name = document.getElementById('folder-name').value.trim();
            if (name) { 
                this.currentFolder = this.generateUUID(); 
                this.loadFiles(); 
                document.getElementById('folder-modal').classList.remove('active'); 
                document.getElementById('folder-name').value = ''; 
            }
        });
        document.getElementById('cancel-rename').addEventListener('click', () => document.getElementById('rename-modal').classList.remove('active'));
        document.getElementById('confirm-rename').addEventListener('click', async () => {
            const newName = document.getElementById('rename-input').value.trim();
            if (newName && this.selectedFile) {
                await this.apiRequest('rename', { method: 'POST', body: JSON.stringify({ id: this.selectedFile.id, new_name: newName }) });
                this.loadFiles(); document.getElementById('rename-modal').classList.remove('active');
            }
        });
        document.getElementById('close-metadata').addEventListener('click', () => document.getElementById('metadata-modal').classList.remove('active'));
    },

    setupContextMenu() {
        const menu = document.getElementById('context-menu');
        document.querySelectorAll('.context-item').forEach(item => {
            item.addEventListener('click', async (e) => {
                e.stopPropagation();
                menu.classList.remove('active');
                if (!this.selectedFile) return;
                const action = item.dataset.action;
                if (action === 'download') await this.downloadFile(this.selectedFile.id);
                if (action === 'delete') { await this.deleteFile(this.selectedFile.id); this.loadFiles(); }
                if (action === 'rename') { document.getElementById('rename-input').value = this.selectedFile.name; document.getElementById('rename-modal').classList.add('active'); }
                if (action === 'metadata') this.showMetadata(this.selectedFile);
            });
        });
    },

    showContextMenu(e, itemId, type) {
        e.preventDefault();
        if (type === 'file') this.selectedFile = this.files.find(f => f.id === itemId);
        const menu = document.getElementById('context-menu');
        menu.style.left = e.pageX + 'px'; menu.style.top = e.pageY + 'px';
        menu.classList.add('active');
    },

    async downloadFile(fileId) {
        this.showToast('Téléchargement...');
        try {
            const res = await fetch(`${API_URL}?action=download&id=${fileId}`, { 
                headers: { 'Authorization': `Bearer ${this.token}` },
                mode: 'cors'
            });
            if (!res.ok) throw new Error();
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url;
            a.download = this.selectedFile ? this.selectedFile.name : 'file';
            document.body.appendChild(a); a.click(); a.remove(); window.URL.revokeObjectURL(url);
        } catch (e) { this.showToast('Erreur téléchargement'); }
    },

    async deleteFile(id) { 
        await this.apiRequest('delete', { method: 'POST', body: JSON.stringify({ id: id, type: 'file' }) }); 
    },

    showMetadata(file) {
        document.getElementById('metadata-content').innerHTML = `
            <div class="metadata-row"><div class="metadata-label">Nom</div><div class="metadata-value">${file.name}</div></div>
            <div class="metadata-row"><div class="metadata-label">Taille</div><div class="metadata-value">${this.formatFileSize(file.size)}</div></div>
            <div class="metadata-row"><div class="metadata-label">ID</div><div class="metadata-value">${file.id}</div></div>
        `;
        document.getElementById('metadata-modal').classList.add('active');
    },

    handleSearch(e) {
        const q = e.target.value.toLowerCase();
        document.querySelectorAll('.file-item').forEach(el => {
            const name = el.querySelector('.file-name').textContent.toLowerCase();
            el.style.display = name.includes(q) ? 'flex' : 'none';
        });
    },

    showLoading() { document.getElementById('loading-spinner').style.display = 'block'; },
    hideLoading() { document.getElementById('loading-spinner').style.display = 'none'; },
    showToast(msg) { 
        const t = document.getElementById('toast'); 
        t.textContent = msg; 
        t.classList.add('active'); 
        setTimeout(() => t.classList.remove('active'), 3000); 
    },
    generateUUID() { return crypto.randomUUID(); }
};

document.addEventListener('DOMContentLoaded', () => App.init());