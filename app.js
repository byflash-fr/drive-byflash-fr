// app.js - Byflash Drive Frontend Logic v3.0 (Version Finale & Complète)

const API_URL = 'https://api.byflash.fr/index.php'; // Vérifiez votre URL

const App = {
    token: null,
    userEmail: null,
    files: [],
    trash: [],
    currentView: 'files', // 'files' ou 'trash'
    currentFolder: null,  // Null = Racine, Sinon = ID du groupe
    selectedFile: null,
    selectedFolderId: null,
    selectedItems: new Set(),
    editingGroupId: null, // Pour stocker l'ID du dossier en cours d'édition
    
    // --- INITIALISATION ---
    init() {
        this.checkAuth();
        this.bindEvents();
    },

    checkAuth() {
        this.token = localStorage.getItem('api_token');
        this.userEmail = localStorage.getItem('user_email');

        if (this.token && this.userEmail) {
            this.showMainPage();
        } else {
            this.showLoginPage();
        }
    },

    bindEvents() {
        // Auth
        document.getElementById('login-form').addEventListener('submit', (e) => this.handleLogin(e));
        document.getElementById('logout-btn').addEventListener('click', () => this.handleLogout());
        
        // Navigation Menu Principal (Switch entre Fichiers et Corbeille)
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => this.handleNavigation(e));
        });

        // Vue Grille / Liste
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchView(e));
        });

        // Actions Principales
        document.getElementById('upload-btn').addEventListener('click', () => document.getElementById('upload-modal').classList.add('active'));
        document.getElementById('confirm-upload')?.addEventListener('click', () => this.handleUpload());
        
        // Création Dossier
        const newFolderBtn = document.getElementById('new-folder-btn');
        if(newFolderBtn) {
            newFolderBtn.addEventListener('click', () => {
                document.getElementById('folder-name').value = '';
                document.getElementById('folder-modal').classList.add('active');
            });
        }
        document.getElementById('confirm-folder')?.addEventListener('click', () => this.createFolder());

        // Recherche
        document.getElementById('search-input')?.addEventListener('input', (e) => this.handleSearch(e));

        // Fermeture Modales (X et Annuler)
        document.querySelectorAll('.close-btn, .btn-secondary').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const modal = e.target.closest('.modal');
                // On ne ferme pas si c'est un bouton d'action ou de toolbar
                if (modal && !e.target.classList.contains('btn-primary') && !e.target.classList.contains('btn-copy') && !e.target.closest('.selection-toolbar')) {
                    modal.classList.remove('active');
                }
            });
        });

        // Drag & Drop et Clic Droit
        this.setupDragAndDrop();
        this.setupContextMenu(); 
        
        // Clic global pour fermer les menus et gérer la désélection
        document.addEventListener('click', (e) => {
            const cm = document.getElementById('context-menu');
            if(cm) cm.classList.remove('active');
        });
    },

    // --- AUTHENTIFICATION ---
    async handleLogin(e) {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        const errorDiv = document.getElementById('login-error');

        try {
            const res = await fetch(`${API_URL}?action=login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await res.json();

            if (data.success) {
                this.token = data.api_token;
                this.userEmail = data.email;
                localStorage.setItem('api_token', this.token);
                localStorage.setItem('user_email', this.userEmail);
                this.showMainPage();
            } else {
                if(errorDiv) errorDiv.textContent = data.error || 'Erreur de connexion';
            }
        } catch (error) {
            console.error(error);
            if(errorDiv) errorDiv.textContent = 'Erreur serveur';
        }
    },

    handleLogout() {
        localStorage.clear();
        this.token = null;
        this.userEmail = null;
        this.showLoginPage();
    },

    showLoginPage() {
        document.getElementById('login-page').classList.add('active');
        document.getElementById('main-page').classList.remove('active');
    },

    showMainPage() {
        document.getElementById('login-page').classList.remove('active');
        document.getElementById('main-page').classList.add('active');
        const emailEl = document.getElementById('user-email');
        if(emailEl) emailEl.textContent = this.userEmail;
        
        // Charger la vue par défaut
        this.handleNavigation({ currentTarget: document.querySelector('.nav-item[data-view="files"]') });
    },

    // --- NAVIGATION & VUES ---
    handleNavigation(e) {
        if (!e || !e.currentTarget) return;
        const view = e.currentTarget.dataset.view;
        this.currentView = view;

        document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
        e.currentTarget.classList.add('active');

        const fileContainer = document.getElementById('file-container');
        const trashContainer = document.getElementById('trash-container');
        const uploadBtn = document.getElementById('upload-btn');
        const newFolderBtn = document.getElementById('new-folder-btn');
        const searchBox = document.querySelector('.search-box');
        const selectionToolbar = document.getElementById('selection-toolbar');

        // Reset display
        fileContainer.style.display = 'none';
        trashContainer.style.display = 'none';

        if (view === 'files') {
            // Vue Fichiers
            fileContainer.style.display = 'grid'; // Grid par défaut, sera surchargé par applyCurrentViewStyle
            this.applyCurrentViewStyle();
            
            if(uploadBtn) uploadBtn.style.display = 'inline-flex';
            if(newFolderBtn) newFolderBtn.style.display = 'inline-flex';
            if(searchBox) searchBox.style.visibility = 'visible';
            if (selectionToolbar && this.selectedItems.size > 0) selectionToolbar.style.display = 'flex';
            
            this.loadFiles();
        } else if (view === 'trash') {
            // Vue Corbeille
            trashContainer.style.display = 'grid';
            
            if(uploadBtn) uploadBtn.style.display = 'none';
            if(newFolderBtn) newFolderBtn.style.display = 'none';
            if(searchBox) searchBox.style.visibility = 'hidden';
            if (selectionToolbar) selectionToolbar.style.display = 'none';
            
            this.loadTrash();
        }
    },

    switchView(e) {
        const btn = e.currentTarget;
        const viewType = btn.dataset.view; // 'grid' ou 'list'
        
        // Active button state
        document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        // Save preference
        localStorage.setItem('view_preference', viewType);
        this.applyCurrentViewStyle();
    },

    applyCurrentViewStyle() {
        const viewType = localStorage.getItem('view_preference') || 'grid';
        const container = document.getElementById('file-container');
        
        // Met à jour les boutons (utile au chargement de la page)
        document.querySelectorAll('.view-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.view === viewType);
        });

        if (viewType === 'list') {
            container.classList.add('file-list');
            container.classList.remove('file-grid');
        } else {
            container.classList.add('file-grid');
            container.classList.remove('file-list');
        }
    },

    // --- CHARGEMENT DONNÉES ---
    async loadFiles() {
        const spinner = document.getElementById('loading-spinner');
        if(spinner) spinner.style.display = 'block';

        const params = this.currentFolder ? `&group_id=${this.currentFolder}` : '';

        try {
            const res = await fetch(`${API_URL}?action=files${params}`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            
            if (res.status === 401) { this.handleLogout(); return; }

            const data = await res.json();
            if (data.success) {
                this.files = data.files;
                this.renderFiles();
                this.updateBreadcrumb();
            } else {
                this.showToast(data.error || "Erreur chargement", "error");
            }
        } catch (error) { console.error(error); }
        if(spinner) spinner.style.display = 'none';
    },

    async loadTrash() {
        const spinner = document.getElementById('loading-spinner');
        if(spinner) spinner.style.display = 'block';
        try {
            const res = await fetch(`${API_URL}?action=trash_list`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            const data = await res.json();
            if (data.success) {
                this.trash = data.trash;
                this.renderTrash();
            }
        } catch (e) { console.error(e); }
        if(spinner) spinner.style.display = 'none';
    },

    // --- RENDU CONTENU ---
    renderFiles() {
        const container = document.getElementById('file-container');
        container.innerHTML = '';
        this.updateSelectionToolbar();

        if (!this.files || this.files.length === 0) {
            container.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:#888; margin-top:50px;">Aucun élément</div>';
            return;
        }

        const grouped = {};
        this.files.forEach(f => {
            const gid = f.group_id || 'root';
            if (!grouped[gid]) grouped[gid] = [];
            grouped[gid].push(f);
        });

        // Affichage Racine (Dossiers + Fichiers orphelins)
        if (!this.currentFolder) {
            // Dossiers
            Object.keys(grouped).forEach(groupId => {
                if (groupId !== 'root') {
                    // Les métadonnées du groupe (nom, couleur) sont dans le premier fichier renvoyé par l'API
                    const meta = grouped[groupId][0]; 
                    container.appendChild(this.createFolderItem(groupId, meta, grouped[groupId].length));
                }
            });
            // Fichiers sans dossier
            if (grouped['root']) {
                grouped['root'].forEach(f => container.appendChild(this.createFileItem(f)));
            }
        } 
        // Affichage Contenu Dossier
        else {
            if (grouped[this.currentFolder]) {
                grouped[this.currentFolder].forEach(f => container.appendChild(this.createFileItem(f)));
            } else {
                container.innerHTML = '<div style="grid-column:1/-1; text-align:center;">Dossier vide</div>';
            }
        }
    },

    renderTrash() {
        const container = document.getElementById('trash-container');
        container.innerHTML = '';
        
        if (!this.trash || this.trash.length === 0) {
            container.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:#888; margin-top:50px;">Corbeille vide</div>';
            return;
        }

        this.trash.forEach(item => {
            const div = document.createElement('div');
            div.className = 'file-item';
            div.style.opacity = '0.7';
            div.style.cursor = 'default';
            
            const icon = item.item_type === 'group' ? 'fa-folder' : this.getFileIcon(item.original_name);
            const name = item.original_name || 'Élément';

            div.innerHTML = `
                <i class="fas ${icon} file-icon" style="color:#666;"></i>
                <div class="file-name">${name}</div>
                <div class="file-meta">Supprimé le ${new Date(item.created_at).toLocaleDateString()}</div>
                <button class="btn-sm btn-primary" onclick="App.restoreItem('${item.item_id}')" style="margin-top:10px;">
                    <i class="fas fa-trash-restore"></i> Restaurer
                </button>
            `;
            container.appendChild(div);
        });
    },

    // --- ELEMENTS HTML ---
    createFolderItem(groupId, meta, count) {
        const div = document.createElement('div');
        div.className = 'file-item folder-item';
        
        // Récupération des infos personnalisées
        const folderName = meta.group_name || `Dossier ${groupId.substring(0,6)}`;
        const folderColor = meta.group_color || '#3b82f6'; 
        const isLocked = meta.is_group_protected == 1; 

        div.innerHTML = `
            <div class="file-icon-wrapper" style="position:relative">
                <i class="fas fa-folder file-icon" style="color: ${folderColor};"></i>
                ${isLocked ? '<i class="fas fa-lock" style="position:absolute; bottom:5px; right:-5px; font-size:12px; color:#555; background:white; padding:3px; border-radius:50%; border:1px solid #eee;"></i>' : ''}
            </div>
            <div class="file-name" title="${folderName}" style="font-weight:bold;">${folderName}</div>
            <div class="file-meta">${count} fichier(s)</div>
            
            <div class="folder-actions" style="position: absolute; top: 10px; right: 10px;">
                <button class="btn-icon btn-settings" onclick="event.stopPropagation(); App.openFolderSettings('${groupId}', '${folderName}', '${folderColor}')" title="Paramètres">
                    <i class="fas fa-cog"></i>
                </button>
            </div>
        `;

        div.addEventListener('click', () => this.enterFolder(groupId, isLocked));
        div.addEventListener('contextmenu', (e) => this.showContextMenu(e, groupId, 'folder'));
        return div;
    },

    createFileItem(file) {
        const div = document.createElement('div');
        div.className = `file-item ${this.selectedItems.has(file.id) ? 'selected' : ''}`;
        
        const iconClass = this.getFileIcon(file.name);
        const isSelected = this.selectedItems.has(file.id);

        const checkboxHtml = `
            <div class="selection-checkbox ${isSelected ? 'checked' : ''}" 
                 onclick="event.stopPropagation(); App.toggleSelection('${file.id}')">
                 <i class="fas fa-check"></i>
            </div>
        `;

        div.innerHTML = `
            ${checkboxHtml}
            <i class="fas ${iconClass} file-icon"></i>
            <div class="file-name" title="${file.name}">${file.name}</div>
            <div class="file-meta">${this.formatFileSize(file.size)}</div>
            
            <div class="file-actions" style="margin-top:10px; width:100%; display:flex; justify-content:center; gap:5px;">
                <button class="btn-sm btn-secondary btn-copy" onclick="event.stopPropagation(); App.copyLink('${file.download_url}')" title="Copier lien">
                    <i class="fas fa-link"></i> Copier
                </button>
                <button class="btn-sm btn-primary" onclick="event.stopPropagation(); App.downloadFileWithAuth('${file.id}', ${file.has_password})" title="Télécharger">
                    <i class="fas fa-download"></i>
                </button>
            </div>
        `;
        
        div.addEventListener('click', (e) => {
            if (e.ctrlKey || e.metaKey) this.toggleSelection(file.id);
        });
        div.addEventListener('contextmenu', (e) => {
            if (!this.selectedItems.has(file.id)) this.selectedFile = file; 
            else this.selectedFile = null;
            this.showContextMenu(e, file.id, 'file');
        });
        return div;
    },

    // --- SÉLECTION MULTIPLE ---
    toggleSelection(id) {
        if (this.selectedItems.has(id)) this.selectedItems.delete(id);
        else this.selectedItems.add(id);
        this.renderFiles();
    },
    clearSelection() {
        this.selectedItems.clear();
        this.renderFiles();
    },
    updateSelectionToolbar() {
        let toolbar = document.getElementById('selection-toolbar');
        if (!toolbar) {
            toolbar = document.createElement('div');
            toolbar.id = 'selection-toolbar';
            toolbar.className = 'selection-toolbar';
            toolbar.innerHTML = `
                <div class="toolbar-left">
                    <span id="selection-count" style="font-weight:bold; margin-right:15px; color:#333;">0</span>
                    <button class="btn btn-secondary btn-sm" onclick="App.clearSelection()">Annuler</button>
                </div>
                <div class="toolbar-right" style="display:flex; gap:10px;">
                    <button class="btn btn-primary" onclick="App.openMoveModal()"><i class="fas fa-folder-open"></i> Déplacer</button>
                    <button class="btn btn-danger" style="background:#dc3545; color:white; border:none;" onclick="App.deleteSelected()"><i class="fas fa-trash"></i></button>
                </div>
            `;
            const mainToolbar = document.querySelector('.toolbar');
            if(mainToolbar) mainToolbar.parentNode.insertBefore(toolbar, mainToolbar.nextSibling);
        }
        const count = this.selectedItems.size;
        toolbar.style.display = count > 0 ? 'flex' : 'none';
        if(count > 0) document.getElementById('selection-count').textContent = `${count} élément(s)`;
    },

    // --- MENU CONTEXTUEL ---
    setupContextMenu() {
        const menu = document.getElementById('context-menu');
        const newMenu = menu.cloneNode(true);
        menu.parentNode.replaceChild(newMenu, menu);

        newMenu.querySelectorAll('.context-item').forEach(item => {
            item.addEventListener('click', async (e) => {
                e.stopPropagation();
                const action = item.dataset.action;
                newMenu.classList.remove('active');

                if (this.selectedFile && !this.selectedFolderId) {
                    switch (action) {
                        case 'download': await this.downloadFileWithAuth(this.selectedFile.id, this.selectedFile.has_password); break;
                        case 'rename': 
                            const newName = prompt("Nouveau nom :", this.selectedFile.name);
                            if(newName) this.apiRequest('rename', { method:'POST', body: JSON.stringify({id: this.selectedFile.id, new_name: newName})}).then(() => this.loadFiles());
                            break;
                        case 'delete': 
                            if(confirm("Supprimer ce fichier ?")) await this.deleteFile(this.selectedFile.id, 'file'); 
                            break;
                        case 'metadata': this.showMetadata(this.selectedFile, 'file'); break;
                    }
                } 
                else if (this.selectedFolderId) {
                    const fMeta = this.files.find(f => f.group_id === this.selectedFolderId);
                    const name = fMeta ? (fMeta.group_name || 'Dossier') : 'Dossier';
                    const color = fMeta ? (fMeta.group_color || '#3b82f6') : '#3b82f6';
                    switch(action) {
                        case 'rename': this.openFolderSettings(this.selectedFolderId, name, color); break;
                        case 'delete': if(confirm('Supprimer ce dossier ?')) await this.deleteFile(this.selectedFolderId, 'group'); break;
                        case 'download': window.open(`${API_URL}?action=download_folder&group_id=${this.selectedFolderId}`, '_blank'); break;
                    }
                }
                this.selectedFile = null; this.selectedFolderId = null;
            });
        });
    },

    showContextMenu(e, itemId, type) {
        e.preventDefault();
        const menu = document.getElementById('context-menu');
        this.selectedFile = null; this.selectedFolderId = null;
        if (type === 'file') this.selectedFile = this.files.find(f => f.id === itemId);
        else this.selectedFolderId = itemId;
        
        let x = e.pageX; let y = e.pageY;
        if(x + 200 > window.innerWidth) x = window.innerWidth - 210;
        menu.style.left = `${x}px`; menu.style.top = `${y}px`;
        menu.classList.add('active');
    },

    // --- NAVIGATION & SÉCURITÉ (MODALE) ---
    async enterFolder(groupId, isLocked) {
        if (isLocked) {
            const pass = await this.askPassword("Ce dossier est protégé. Mot de passe :");
            if (!pass) return; 

            try {
                const res = await fetch(`${API_URL}?action=check_group_password`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ group_id: groupId, password: pass })
                });
                const data = await res.json();
                if (!data.success) { this.showToast("Mot de passe incorrect", "error"); return; }
            } catch (e) { this.showToast("Erreur vérification", "error"); return; }
        }
        this.currentFolder = groupId;
        this.loadFiles();
    },

    // --- MODALE MOT DE PASSE (PROMISE) ---
    askPassword(title) {
        return new Promise(resolve => {
            if(!document.getElementById('password-prompt-modal')) {
                const html = `
                <div id="password-prompt-modal" class="modal">
                    <div class="modal-content">
                        <div class="modal-header"><h3 id="pwd-modal-title">Sécurité</h3><button class="close-btn">&times;</button></div>
                        <div class="modal-body"><input type="password" id="pwd-modal-input" class="input-field" placeholder="Entrez le mot de passe" autofocus></div>
                        <div class="modal-footer"><button class="btn btn-secondary close-modal-btn">Annuler</button><button class="btn btn-primary" id="pwd-modal-confirm">Valider</button></div>
                    </div>
                </div>`;
                document.body.insertAdjacentHTML('beforeend', html);
            }
            const modal = document.getElementById('password-prompt-modal');
            const input = document.getElementById('pwd-modal-input');
            const confirm = document.getElementById('pwd-modal-confirm');
            const closers = modal.querySelectorAll('.close-btn, .close-modal-btn');

            document.getElementById('pwd-modal-title').textContent = title;
            input.value = '';
            modal.classList.add('active');
            input.focus();

            const cleanup = () => {
                modal.classList.remove('active');
                confirm.onclick = null;
                closers.forEach(b => b.onclick = null);
                input.onkeyup = null;
            };

            confirm.onclick = () => { if(input.value) { resolve(input.value); cleanup(); } };
            closers.forEach(b => b.onclick = () => { resolve(null); cleanup(); });
            input.onkeyup = (e) => { if(e.key === 'Enter') confirm.click(); };
        });
    },

    // --- TÉLÉCHARGEMENT ---
    async downloadFileWithAuth(fileId, hasPass) {
        let pass = '';
        if (hasPass == 1) { 
            pass = await this.askPassword("Mot de passe du fichier :"); 
            if(!pass) return; 
        }
        const url = `${API_URL}?action=download&id=${fileId}&password=${encodeURIComponent(pass)}`;
        this.copyLink(url); 
        window.open(url, '_blank');
    },

    // --- CRÉATION DOSSIER ---
    createFolder() {
        const name = document.getElementById('folder-name').value.trim();
        if(name) {
            this.currentFolder = this.generateUUID();
            // Création immédiate pour sauvegarder le nom
            this.apiRequest('update_group', {
                method: 'POST',
                body: JSON.stringify({ id: this.currentFolder, name: name, color: '#3b82f6' })
            }).then(() => {
                this.loadFiles();
                document.getElementById('folder-modal').classList.remove('active');
                document.getElementById('folder-name').value = '';
                this.showToast(`Dossier "${name}" créé`);
            });
        }
    },

    openFolderSettings(groupId, currentName, currentColor) {
        this.editingGroupId = groupId;
        if (!document.getElementById('folder-settings-modal')) {
            const html = `
            <div id="folder-settings-modal" class="modal"><div class="modal-content"><div class="modal-header"><h3>Paramètres</h3><button class="close-btn" onclick="document.getElementById('folder-settings-modal').classList.remove('active')">&times;</button></div><div class="modal-body"><div class="input-group"><label>Nom</label><input type="text" id="edit-folder-name" class="input-field"></div><div class="input-group"><label>Couleur</label><input type="color" id="edit-folder-color" class="input-field" style="height:40px;width:100%"></div><div class="input-group"><label>Mot de passe</label><input type="password" id="edit-folder-pass" class="input-field" placeholder="Nouveau mot de passe"></div></div><div class="modal-footer"><button class="btn btn-secondary" onclick="document.getElementById('folder-settings-modal').classList.remove('active')">Annuler</button><button class="btn btn-primary" id="save-settings-btn">Sauvegarder</button></div></div></div>`;
            document.body.insertAdjacentHTML('beforeend', html);
            document.getElementById('save-settings-btn').onclick = () => this.saveFolderSettings();
        }
        document.getElementById('edit-folder-name').value = currentName;
        document.getElementById('edit-folder-color').value = currentColor;
        document.getElementById('edit-folder-pass').value = '';
        document.getElementById('folder-settings-modal').classList.add('active');
    },

    async saveFolderSettings() {
        const name = document.getElementById('edit-folder-name').value;
        const color = document.getElementById('edit-folder-color').value;
        const pass = document.getElementById('edit-folder-pass').value;
        try {
            const res = await fetch(`${API_URL}?action=update_group`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${this.token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: this.editingGroupId, name: name, color: color, password: pass })
            });
            const data = await res.json();
            if (data.success) {
                document.getElementById('folder-settings-modal').classList.remove('active');
                this.showToast('Mis à jour');
                this.loadFiles();
            } else { alert(data.error); }
        } catch (e) { this.showToast("Erreur serveur", "error"); }
    },

    // --- UPLOAD & HELPERS ---
    async handleUpload() {
        const files = document.getElementById('file-input').files;
        if (!files.length) return;
        const gid = this.currentFolder || this.generateUUID();
        const btn = document.getElementById('confirm-upload');
        btn.disabled = true; btn.textContent = "Envoi...";
        
        let successCount = 0;
        for (let i = 0; i < files.length; i++) {
            const fd = new FormData();
            fd.append('file', files[i]); fd.append('group_id', gid);
            if(document.getElementById('password-check').checked) fd.append('password', document.getElementById('file-password').value);
            
            try {
                const res = await fetch(`${API_URL}?action=upload`, { method: 'POST', headers: { 'Authorization': `Bearer ${this.token}` }, body: fd });
                const d = await res.json();
                if(d.success) successCount++;
            } catch(e) {}
        }
        btn.disabled = false; btn.textContent = "Upload";
        document.getElementById('upload-modal').classList.remove('active');
        fileInput.value = '';
        if (successCount > 0) { this.showToast("Fichiers envoyés"); this.loadFiles(); }
    },

    async deleteFile(id, type) { 
        await this.apiRequest('delete', { method: 'POST', body: JSON.stringify({ id, type }) }); 
        this.currentView === 'trash' ? this.loadTrash() : this.loadFiles();
    },
    async deleteSelected() {
        if (!this.selectedItems.size || !confirm("Supprimer la sélection ?")) return;
        const promises = Array.from(this.selectedItems).map(id => this.apiRequest('delete', { method: 'POST', body: JSON.stringify({ id: id, type: 'file' }) }));
        await Promise.all(promises);
        this.clearSelection(); this.loadFiles();
    },
    async restoreItem(id) {
        if(!confirm("Restaurer ?")) return;
        await this.apiRequest('restore', { method: 'POST', body: JSON.stringify({ id }) });
        this.loadTrash();
    },
    openMoveModal() {
        if (!this.selectedItems.size) return;
        const folders = new Set(); this.files.forEach(f => { if(f.group_id) folders.add(f.group_id); });
        let html = `<div class="folder-option" onclick="App.confirmMove('root')"><i class="fas fa-home"></i> Racine</div>`;
        folders.forEach(gid => { if(gid!==this.currentFolder) {
            const fm = this.files.find(x => x.group_id === gid);
            html += `<div class="folder-option" onclick="App.confirmMove('${gid}')"><i class="fas fa-folder"></i> ${fm?fm.group_name:gid.substring(0,8)}</div>`; 
        }});
        const old = document.getElementById('move-modal'); if(old) old.remove();
        document.body.insertAdjacentHTML('beforeend', `<div id="move-modal" class="modal active"><div class="modal-content"><div class="modal-header"><h3>Déplacer</h3><button class="close-btn" onclick="document.getElementById('move-modal').remove()">&times;</button></div><div class="modal-body" style="max-height:300px;overflow-y:auto">${html}</div></div></div>`);
    },
    async confirmMove(tg) {
        document.getElementById('move-modal').remove();
        await this.apiRequest('move', { method: 'POST', body: JSON.stringify({ ids: Array.from(this.selectedItems), target_group_id: tg }) });
        this.clearSelection(); this.loadFiles();
    },
    async apiRequest(ep, opts={}) {
        const h = { 'Authorization': `Bearer ${this.token}`, 'Content-Type': 'application/json', ...opts.headers };
        if (opts.body instanceof FormData) delete h['Content-Type'];
        try { const r = await fetch(`${API_URL}?action=${ep}`, { ...opts, headers: h }); return await r.json(); } catch (e) { return { success: false, error: 'Erreur réseau' }; }
    },
    copyLink(url) { navigator.clipboard.writeText(url).then(()=>this.showToast("Lien copié")).catch(()=>prompt("Lien:",url)); },
    updateBreadcrumb() {
        const bc = document.querySelector('.breadcrumb');
        if(this.currentFolder) bc.innerHTML = `<span onclick="App.currentFolder=null;App.loadFiles()" style="cursor:pointer;color:blue">Accueil</span> / Dossier`;
        else bc.innerHTML = `Accueil`;
    },
    handleSearch(e) {
        const v = e.target.value.toLowerCase();
        document.querySelectorAll('.file-item').forEach(el => el.style.display = el.innerText.toLowerCase().includes(v) ? 'flex' : 'none');
    },
    toggleSelection(id) { this.selectedItems.has(id) ? this.selectedItems.delete(id) : this.selectedItems.add(id); this.renderFiles(); },
    clearSelection() { this.selectedItems.clear(); this.renderFiles(); },
    updateSelectionToolbar() {
        let bar = document.getElementById('selection-toolbar');
        if (!bar) {
            bar = document.createElement('div'); bar.id = 'selection-toolbar'; bar.className = 'selection-toolbar';
            bar.innerHTML = `<div class="toolbar-left"><span id="sel-cnt" style="font-weight:bold;margin-right:15px">0</span><button class="btn btn-secondary btn-sm" onclick="App.clearSelection()">Annuler</button></div><div class="toolbar-right" style="gap:10px;display:flex"><button class="btn btn-primary" onclick="App.openMoveModal()">Déplacer</button><button class="btn btn-danger" style="background:#dc3545;border:none;color:white" onclick="App.deleteSelected()">Supprimer</button></div>`;
            const tb = document.querySelector('.toolbar'); if(tb) tb.parentNode.insertBefore(bar, tb.nextSibling);
        }
        const c = this.selectedItems.size;
        bar.style.display = c > 0 ? 'flex' : 'none';
        if(c>0) document.getElementById('sel-cnt').textContent = `${c} élément(s)`;
    },
    setupDragAndDrop() {
        const dz = document.getElementById('drop-zone');
        const m = document.querySelector('.main-content');
        if(m && dz) {
            ['dragenter','dragover'].forEach(e => m.addEventListener(e, (ev) => { ev.preventDefault(); dz.classList.add('active'); }));
            ['dragleave','drop'].forEach(e => m.addEventListener(e, (ev) => { ev.preventDefault(); dz.classList.remove('active'); }));
            m.addEventListener('drop', (e) => { if(e.dataTransfer.files.length){ document.getElementById('file-input').files = e.dataTransfer.files; document.getElementById('upload-modal').classList.add('active'); }});
        }
    },
    showToast(msg, type='success') {
        let t = document.getElementById('toast');
        if(!t) { t = document.createElement('div'); t.id='toast'; t.className='toast'; document.body.appendChild(t); }
        t.textContent = msg; t.style.background = type==='error'?'#dc3545':'#333';
        t.classList.add('active'); setTimeout(()=>t.classList.remove('active'), 3000);
    },
    showMetadata(i) { alert(`Nom : ${i.name}\nTaille : ${this.formatFileSize(i.size)}`); },
    getFileIcon(n) { const x = n.split('.').pop().toLowerCase(); return ({'pdf':'fa-file-pdf','jpg':'fa-file-image'}[x] || 'fa-file'); },
    formatFileSize(b) { if(!b) return '0 B'; const i=Math.floor(Math.log(b)/Math.log(1024)); return (b/Math.pow(1024,i)).toFixed(2)+' '+['B','KB','MB','GB'][i]; },
    generateUUID() { return crypto.randomUUID(); }
};

// Styles dynamiques
const styleSheet = document.createElement("style");
styleSheet.innerText = `
.folder-item { position: relative; }
.btn-settings { background: rgba(255,255,255,0.9); border: 1px solid #ddd; padding: 5px 8px; border-radius: 50%; cursor: pointer; color: #666; display: none; }
.folder-item:hover .btn-settings { display: block; }
.btn-settings:hover { transform: scale(1.1); color: #000; background: white; }
.btn-copy { font-size: 12px; padding: 4px 8px; border: 1px solid #ddd; border-radius: 4px; background: #f8f9fa; cursor: pointer; }
.btn-copy:hover { background: #e2e6ea; }
.file-actions { opacity: 0; transition: opacity 0.2s; }
.file-item:hover .file-actions { opacity: 1; }
.selection-checkbox { position: absolute; top: 10px; left: 10px; width: 20px; height: 20px; border: 2px solid #ccc; border-radius: 4px; background: white; display: flex; align-items: center; justify-content: center; cursor: pointer; opacity: 0; transition: opacity 0.2s; z-index: 10; }
.file-item:hover .selection-checkbox, .file-item.selected .selection-checkbox { opacity: 1; }
.selection-checkbox.checked { background-color: #007bff; border-color: #007bff; color: white; }
.file-item.selected { border-color: #007bff; background-color: #e3f2fd; }
.selection-toolbar { display:none; justify-content: space-between; padding: 10px 20px; background: #e3f2fd; border-bottom: 1px solid #ddd; }
.folder-option { padding: 10px; border-bottom: 1px solid #eee; cursor: pointer; display: flex; align-items: center; gap: 10px; }
.folder-option:hover { background: #f5f5f5; }
.input-group { margin-bottom: 15px; } .input-group label { display: block; margin-bottom: 5px; font-size: 14px; font-weight: 500; }
`;
document.head.appendChild(styleSheet);

document.addEventListener('DOMContentLoaded', () => App.init());