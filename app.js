const API_URL = 'https://api.byflash.fr/index.php';

const App = {
    token: null,
    userId: null,
    userEmail: null,
    currentView: 'files',
    currentFolder: null,
    currentGroupPassword: null, // Stockage temporaire du mot de passe du dossier
    selectedFile: null,
    selectedFolderId: null,
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
            const contextMenu = document.getElementById('context-menu');
            if (contextMenu) contextMenu.classList.remove('active');
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

            // LOGIQUE MOT DE PASSE GROUPE
            // Si on est dans un dossier et qu'au moins un fichier a un mot de passe, on demande le MDP
            if (this.currentFolder && this.files.some(f => f.has_password == 1) && !this.currentGroupPassword) {
                this.promptGroupPassword();
            }

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
                <span class="breadcrumb-item" onclick="App.goToRoot()" style="cursor:pointer; color: #3b82f6;">
                    <i class="fas fa-home"></i> Accueil
                </span>
                <span style="margin: 0 5px; color: #999;">/</span>
                <span class="breadcrumb-item active">
                    <i class="fas fa-folder-open"></i> Dossier ${this.currentFolder.substring(0, 8)}
                </span>
            `;
        } else {
            // Si à la racine
            breadcrumb.innerHTML = `
                <span class="breadcrumb-item active">
                    <i class="fas fa-home"></i> Accueil
                </span>
            `;
        }
    },

    goToRoot() {
        this.currentFolder = null;
        this.currentGroupPassword = null; // Reset du mot de passe quand on sort
        this.loadFiles();
    },

    // --- GESTION MOT DE PASSE ---
    promptGroupPassword() {
        // Injection dynamique de la modale si elle n'existe pas
        if (!document.getElementById('password-modal')) {
            const modalHTML = `
            <div id="password-modal" class="modal active">
                <div class="modal-content">
                    <div class="modal-header"><h3>Mot de passe requis</h3></div>
                    <div class="modal-body">
                        <p>Ce dossier contient des fichiers protégés. Entrez le mot de passe pour y accéder.</p>
                        <input type="password" id="group-password-input" class="input-field" placeholder="Mot de passe">
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="App.cancelPassword()">Annuler</button>
                        <button class="btn btn-primary" onclick="App.submitPassword()">Valider</button>
                    </div>
                </div>
            </div>`;
            document.body.insertAdjacentHTML('beforeend', modalHTML);
        } else {
            document.getElementById('password-modal').classList.add('active');
        }
        const input = document.getElementById('group-password-input');
        if (input) input.focus();
    },

    submitPassword() {
        const pass = document.getElementById('group-password-input').value;
        if (pass) {
            this.currentGroupPassword = pass;
            document.getElementById('password-modal').classList.remove('active');
            this.showToast('Mot de passe enregistré pour la session');
        }
    },

    cancelPassword() {
        document.getElementById('password-modal').classList.remove('active');
        // Retour à la racine si on annule
        this.goToRoot();
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
        
        // Vérifie si le dossier contient des fichiers protégés
        const isProtected = files.some(f => f.has_password == 1);
        const iconClass = isProtected ? 'fa-folder-closed' : 'fa-folder';
        const colorStyle = isProtected ? 'color: #e67e22;' : ''; // Orange si protégé

        div.innerHTML = `
            <i class="fas ${iconClass} file-icon folder" style="${colorStyle}"></i>
            <div class="file-name">Dossier ${groupId.substring(0, 8)}</div>
            <div class="file-meta">${files.length} fichier(s) ${isProtected ? '<i class="fas fa-lock" style="font-size:10px"></i>' : ''}</div>
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
            ${file.has_password == 1 ? '<i class="fas fa-lock" style="position:absolute; top:10px; right:10px; color:#aaa;"></i>' : ''}
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
        const pwd = document.getElementById('file-password').value; // Récupère mot de passe modale

        for (let i = 0; i < files.length; i++) {
            const formData = new FormData();
            formData.append('file', files[i]);
            formData.append('group_id', groupId);
            if(pwd) formData.append('password', pwd);

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
        
        // Upload Modal
        document.getElementById('cancel-upload').addEventListener('click', () => document.getElementById('upload-modal').classList.remove('active'));
        document.getElementById('confirm-upload').addEventListener('click', () => {
            const input = document.getElementById('file-input');
            if (input.files.length) { 
                this.uploadFiles(input.files); 
                document.getElementById('upload-modal').classList.remove('active'); 
                input.value = ''; 
                document.getElementById('file-password').value = ''; // Reset password
            }
        });

        // Toggle password input visibility
        const pwdCheck = document.getElementById('password-check');
        if (pwdCheck) {
            pwdCheck.addEventListener('change', (e) => {
                document.getElementById('file-password').style.display = e.target.checked ? 'block' : 'none';
            });
        }

        // Folder Modal
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

        // Rename Modal
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
                const action = item.dataset.action;
                menu.classList.remove('active');

                // CAS 1 : Action sur un FICHIER
                if (this.selectedFile) {
                    switch (action) {
                        case 'download': 
                            await this.downloadFile(this.selectedFile); 
                            break;
                        case 'rename':
                            document.getElementById('rename-input').value = this.selectedFile.name;
                            document.getElementById('rename-modal').classList.add('active');
                            break;
                        case 'metadata': 
                            this.showMetadata(this.selectedFile, 'file'); 
                            break;
                        case 'delete': 
                            await this.deleteFile(this.selectedFile.id, 'file'); 
                            break;
                    }
                }
                // CAS 2 : Action sur un DOSSIER
                else if (this.selectedFolderId) {
                    if (action === 'delete') {
                        if(confirm('Supprimer ce dossier et tout son contenu ?')) {
                            await this.deleteFile(this.selectedFolderId, 'group');
                        }
                    } else if (action === 'metadata') {
                        this.showMetadata({ id: this.selectedFolderId }, 'folder');
                    } else if (action === 'download') {
                        await this.downloadFolder(this.selectedFolderId);
                    }
                }
            });
        });
    },

    showContextMenu(e, itemId, type) {
        e.preventDefault();
        const contextMenu = document.getElementById('context-menu');
        
        this.selectedFile = null;
        this.selectedFolderId = null;

        const btnRename = document.querySelector('[data-action="rename"]');
        const btnDownload = document.querySelector('[data-action="download"]');
        const btnInfo = document.querySelector('[data-action="metadata"]');
        const btnDelete = document.querySelector('[data-action="delete"]');

        if (type === 'file') {
            this.selectedFile = this.files.find(f => f.id === itemId);
            btnRename.style.display = 'block';
            btnDownload.style.display = 'block';
            btnDownload.innerHTML = '<i class="fas fa-download"></i> Télécharger';
            btnInfo.style.display = 'block';
            btnDelete.innerHTML = '<i class="fas fa-trash"></i> Supprimer';
        } else {
            this.selectedFolderId = itemId;
            btnRename.style.display = 'none';
            btnDownload.style.display = 'block';
            btnDownload.innerHTML = '<i class="fas fa-file-archive"></i> Télécharger le dossier';
            btnInfo.style.display = 'block';
            btnDelete.innerHTML = '<i class="fas fa-trash"></i> Supprimer le dossier';
        }

        contextMenu.style.left = `${e.pageX}px`;
        contextMenu.style.top = `${e.pageY}px`;
        contextMenu.classList.add('active');
    },

    showMetadata(item, type = 'file') {
        const content = document.getElementById('metadata-content');
        if (type === 'file') {
            content.innerHTML = `
                <div class="metadata-row"><div class="metadata-label">Type</div><div class="metadata-value">Fichier</div></div>
                <div class="metadata-row"><div class="metadata-label">Nom</div><div class="metadata-value">${item.name}</div></div>
                <div class="metadata-row"><div class="metadata-label">Taille</div><div class="metadata-value">${this.formatFileSize(item.size)}</div></div>
                <div class="metadata-row"><div class="metadata-label">ID</div><div class="metadata-value" style="font-size:10px">${item.id}</div></div>
            `;
        } else {
            content.innerHTML = `
                <div class="metadata-row"><div class="metadata-label">Type</div><div class="metadata-value">Dossier Virtuel</div></div>
                <div class="metadata-row"><div class="metadata-label">ID Groupe</div><div class="metadata-value" style="font-size:10px">${item.id}</div></div>
                <div class="metadata-row"><div class="metadata-label">Info</div><div class="metadata-value">Contient des fichiers groupés</div></div>
            `;
        }
        document.getElementById('metadata-modal').classList.add('active');
    },

    async downloadFile(file) {
        this.showToast('Préparation du téléchargement...');
        let password = this.currentGroupPassword || '';
        
        // Si le fichier a un mot de passe et qu'on ne l'a pas déjà en mémoire pour le groupe
        if (file.has_password == 1 && !password) {
            password = prompt("Entrez le mot de passe pour télécharger ce fichier :");
            if (!password) return;
        }

        const url = `${API_URL}?action=download&id=${file.id}&password=${encodeURIComponent(password)}`;
        this.triggerDownload(url, file.name);
    },

    async downloadFolder(groupId) {
        this.showToast('Création de l\'archive...');
        let password = this.currentGroupPassword || '';
        
        // On vérifie si un des fichiers du groupe a un mot de passe
        const filesInGroup = this.files.filter(f => f.group_id === groupId);
        if (filesInGroup.some(f => f.has_password == 1) && !password) {
            password = prompt("Mot de passe requis pour déchiffrer le dossier :");
            if (!password) return;
        }

        const url = `${API_URL}?action=download_folder&group_id=${groupId}&password=${encodeURIComponent(password)}`;
        this.triggerDownload(url, `Dossier_${groupId.substring(0,8)}.zip`);
    },

    async triggerDownload(url, filename) {
        try {
            const res = await fetch(url, { 
                headers: { 'Authorization': `Bearer ${this.token}` },
                mode: 'cors'
            });
            if (!res.ok) throw new Error("Erreur serveur ou mot de passe incorrect");
            const blob = await res.blob();
            const downloadUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a'); 
            a.href = downloadUrl;
            a.download = filename;
            document.body.appendChild(a); 
            a.click(); 
            a.remove(); 
            window.URL.revokeObjectURL(downloadUrl);
        } catch (e) { 
            this.showToast(e.message || 'Erreur téléchargement'); 
        }
    },

    async deleteFile(id, type) { 
        await this.apiRequest('delete', { method: 'POST', body: JSON.stringify({ id: id, type: type }) }); 
        this.loadFiles();
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

// Global access for onclick events
window.App = App;
document.addEventListener('DOMContentLoaded', () => App.init());