// app.js - Byflash Drive Frontend Logic v3.2 (Version Complète Corrigée)

const API_URL = 'https://api.byflash.fr/index.php';

const App = {
    token: null,
    userEmail: null,
    files: [],
    trash: [],
    currentView: 'files',
    currentFolder: null,
    selectedFile: null,
    selectedFolderId: null,
    selectedItems: new Set(),
    editingGroupId: null,
    sortBy: 'name',
    sortOrder: 'asc',
    
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
        document.getElementById('login-form').addEventListener('submit', (e) => this.handleLogin(e));
        document.getElementById('logout-btn').addEventListener('click', () => this.handleLogout());
        
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => this.handleNavigation(e));
        });

        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchView(e));
        });

        document.getElementById('upload-btn').addEventListener('click', () => document.getElementById('upload-modal').classList.add('active'));
        document.getElementById('confirm-upload')?.addEventListener('click', () => this.handleUpload());
        
        const newFolderBtn = document.getElementById('new-folder-btn');
        if(newFolderBtn) {
            newFolderBtn.addEventListener('click', () => {
                document.getElementById('folder-name').value = '';
                document.getElementById('folder-modal').classList.add('active');
            });
        }
        document.getElementById('confirm-folder')?.addEventListener('click', () => this.createFolder());

        document.getElementById('search-input')?.addEventListener('input', (e) => this.handleSearch(e));

        document.querySelectorAll('.close-btn, .btn-secondary').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const modal = e.target.closest('.modal');
                if (modal && !e.target.classList.contains('btn-primary') && !e.target.classList.contains('btn-copy') && !e.target.closest('.selection-toolbar')) {
                    modal.classList.remove('active');
                }
            });
        });
        
        const closeMetadataBtn = document.getElementById('close-metadata');
        if (closeMetadataBtn) {
            closeMetadataBtn.addEventListener('click', () => {
                document.getElementById('metadata-modal').classList.remove('active');
            });
        }

        this.setupDragAndDrop();
        this.setupContextMenu(); 
        
        document.addEventListener('click', (e) => {
            const cm = document.getElementById('context-menu');
            if(cm) cm.classList.remove('active');
        });
    },

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
        
        this.handleNavigation({ currentTarget: document.querySelector('.nav-item[data-view="files"]') });
    },

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

        fileContainer.style.display = 'none';
        trashContainer.style.display = 'none';

        if (view === 'files') {
            fileContainer.style.display = 'grid';
            this.applyCurrentViewStyle();
            
            if(uploadBtn) uploadBtn.style.display = 'inline-flex';
            if(newFolderBtn) newFolderBtn.style.display = 'inline-flex';
            if(searchBox) searchBox.style.visibility = 'visible';
            if (selectionToolbar && this.selectedItems.size > 0) selectionToolbar.style.display = 'flex';
            
            this.loadFiles();
        } else if (view === 'trash') {
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
        const viewType = btn.dataset.view;
        
        document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        localStorage.setItem('view_preference', viewType);
        this.applyCurrentViewStyle();
        
        // IMPORTANT : Recharger les fichiers pour recréer les éléments HTML avec la bonne structure
        this.renderFiles();
    },

    applyCurrentViewStyle() {
        const viewType = localStorage.getItem('view_preference') || 'grid';
        const container = document.getElementById('file-container');
        
        document.querySelectorAll('.view-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.view === viewType);
        });

        if (viewType === 'list') {
            container.classList.add('file-list');
            container.classList.remove('file-grid');
            
            // Ajouter les en-têtes de tri si pas déjà présents
            if (!document.querySelector('.list-header')) {
                const header = document.createElement('div');
                header.className = 'list-header';
                header.innerHTML = `
                    <div class="list-header-checkbox"></div>
                    <div class="list-header-content">
                        <div class="sort-header" data-column="name" onclick="App.sortFiles('name')">
                            <span>Nom</span>
                            <i class="fas fa-sort sort-icon"></i>
                        </div>
                        <div class="sort-header" data-column="size" onclick="App.sortFiles('size')">
                            <span>Taille</span>
                            <i class="fas fa-sort sort-icon"></i>
                        </div>
                        <div class="sort-header" data-column="date" onclick="App.sortFiles('date')">
                            <span>Date</span>
                            <i class="fas fa-sort sort-icon"></i>
                        </div>
                        <div class="list-header-actions">Actions</div>
                    </div>
                `;
                container.parentElement.insertBefore(header, container);
            }
            this.updateSortIndicators();
        } else {
            container.classList.add('file-grid');
            container.classList.remove('file-list');
            
            // Supprimer les en-têtes si on revient en grille
            const header = document.querySelector('.list-header');
            if (header) header.remove();
        }
    },

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

    sortFiles(column) {
        if (this.sortBy === column) {
            this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortBy = column;
            this.sortOrder = 'asc';
        }
        
        this.files.sort((a, b) => {
            let valA, valB;
            
            switch(column) {
                case 'name':
                    valA = a.name || a.group_name || '';
                    valB = b.name || b.group_name || '';
                    break;
                case 'size':
                    valA = a.size || 0;
                    valB = b.size || 0;
                    break;
                case 'date':
                    valA = new Date(a.created_at || 0).getTime();
                    valB = new Date(b.created_at || 0).getTime();
                    break;
                default:
                    return 0;
            }
            
            if (typeof valA === 'string') {
                valA = valA.toLowerCase();
                valB = valB.toLowerCase();
            }
            
            if (valA < valB) return this.sortOrder === 'asc' ? -1 : 1;
            if (valA > valB) return this.sortOrder === 'asc' ? 1 : -1;
            return 0;
        });
        
        this.renderFiles();
        this.updateSortIndicators();
    },

    updateSortIndicators() {
        document.querySelectorAll('.sort-header').forEach(header => {
            const icon = header.querySelector('.sort-icon');
            if (icon) {
                if (header.dataset.column === this.sortBy) {
                    icon.className = `fas fa-sort-${this.sortOrder === 'asc' ? 'up' : 'down'} sort-icon`;
                    icon.style.opacity = '1';
                } else {
                    icon.className = 'fas fa-sort sort-icon';
                    icon.style.opacity = '0.3';
                }
            }
        });
    },

    renderFiles() {
        const container = document.getElementById('file-container');
        const viewType = localStorage.getItem('view_preference') || 'grid';
        container.innerHTML = '';
        this.updateSelectionToolbar();

        if (!this.files || this.files.length === 0) {
            const emptyMsg = viewType === 'list' 
                ? '<div style="text-align:center; color:#888; margin-top:50px; padding: 20px;">Aucun élément</div>'
                : '<div style="grid-column:1/-1; text-align:center; color:#888; margin-top:50px;">Aucun élément</div>';
            container.innerHTML = emptyMsg;
            return;
        }

        const grouped = {};
        this.files.forEach(f => {
            const gid = f.group_id || 'root';
            if (!grouped[gid]) grouped[gid] = [];
            grouped[gid].push(f);
        });

        if (!this.currentFolder) {
            Object.keys(grouped).forEach(groupId => {
                if (groupId !== 'root') {
                    const meta = grouped[groupId][0]; 
                    container.appendChild(this.createFolderItem(groupId, meta, grouped[groupId].length));
                }
            });
            if (grouped['root']) {
                grouped['root'].forEach(f => container.appendChild(this.createFileItem(f)));
            }
        } 
        else {
            if (grouped[this.currentFolder]) {
                grouped[this.currentFolder].forEach(f => container.appendChild(this.createFileItem(f)));
            } else {
                const emptyMsg = viewType === 'list' 
                    ? '<div style="text-align:center; color:#888; padding: 20px;">Dossier vide</div>'
                    : '<div style="grid-column:1/-1; text-align:center;">Dossier vide</div>';
                container.innerHTML = emptyMsg;
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

    createFolderItem(groupId, meta, count) {
        const div = document.createElement('div');
        div.className = 'file-item folder-item';
        
        const folderName = meta.group_name || `Dossier ${groupId.substring(0,6)}`;
        const folderColor = meta.group_color || '#3b82f6'; 
        const isLocked = meta.is_group_protected == 1; 
        const downloadUrl = `${API_URL}?action=download_folder&group_id=${groupId}`;
        const viewType = localStorage.getItem('view_preference') || 'grid';

        if (viewType === 'list') {
            div.innerHTML = `
                <div class="file-list-content">
                    <div class="file-list-icon">
                        <i class="fas fa-folder" style="color: ${folderColor};"></i>
                        ${isLocked ? '<i class="fas fa-lock" style="font-size:10px; position:absolute; bottom:0; right:0; color:#555;"></i>' : ''}
                    </div>
                    <div class="file-list-name" style="font-weight:bold;">${folderName}</div>
                    <div class="file-list-size">${count} fichier(s)</div>
                    <div class="file-list-date">-</div>
                    <div class="file-list-actions">
                        <button class="btn-icon btn-copy" onclick="event.stopPropagation(); App.copyLink('${downloadUrl}')" title="Copier lien">
                            <i class="fas fa-link"></i>
                        </button>
                        <button class="btn-icon btn-settings" onclick="event.stopPropagation(); App.openFolderSettings('${groupId}', '${this.escapeHtml(folderName)}', '${folderColor}')" title="Paramètres">
                            <i class="fas fa-cog"></i>
                        </button>
                    </div>
                </div>
            `;
        } else {
            div.innerHTML = `
                <div class="file-icon-wrapper" style="position:relative">
                    <i class="fas fa-folder file-icon" style="color: ${folderColor};"></i>
                    ${isLocked ? '<i class="fas fa-lock" style="position:absolute; bottom:5px; right:-5px; font-size:12px; color:#555; background:white; padding:3px; border-radius:50%; border:1px solid #eee;"></i>' : ''}
                </div>
                <div class="file-name" title="${folderName}" style="font-weight:bold;">${folderName}</div>
                <div class="file-meta">${count} fichier(s)</div>
                
                <div class="file-actions" style="margin-top:10px; width:100%; display:flex; justify-content:center; gap:5px;">
                    <button class="btn-sm btn-secondary btn-copy" onclick="event.stopPropagation(); App.copyLink('${downloadUrl}')" title="Copier lien de téléchargement">
                        <i class="fas fa-link"></i> Copier
                    </button>
                </div>
                
                <div class="folder-actions" style="position: absolute; top: 10px; right: 10px;">
                    <button class="btn-icon btn-settings" onclick="event.stopPropagation(); App.openFolderSettings('${groupId}', '${this.escapeHtml(folderName)}', '${folderColor}')" title="Paramètres">
                        <i class="fas fa-cog"></i>
                    </button>
                </div>
            `;
        }

        div.addEventListener('click', () => this.enterFolder(groupId, isLocked));
        div.addEventListener('contextmenu', (e) => this.showContextMenu(e, groupId, 'folder'));
        return div;
    },

    createFileItem(file) {
        const div = document.createElement('div');
        div.className = `file-item ${this.selectedItems.has(file.id) ? 'selected' : ''}`;
        
        const iconClass = this.getFileIcon(file.name);
        const isSelected = this.selectedItems.has(file.id);
        const viewType = localStorage.getItem('view_preference') || 'grid';

        const checkboxHtml = `
            <div class="selection-checkbox ${isSelected ? 'checked' : ''}" 
                 onclick="event.stopPropagation(); App.toggleSelection('${file.id}')">
                 <i class="fas fa-check"></i>
            </div>
        `;

        if (viewType === 'list') {
            div.innerHTML = `
                ${checkboxHtml}
                <div class="file-list-content">
                    <div class="file-list-icon">
                        <i class="fas ${iconClass}"></i>
                    </div>
                    <div class="file-list-name">${file.name}</div>
                    <div class="file-list-size">${this.formatFileSize(file.size)}</div>
                    <div class="file-list-date">${new Date(file.created_at).toLocaleDateString()}</div>
                    <div class="file-list-actions">
                        <button class="btn-icon btn-copy" onclick="event.stopPropagation(); App.copyLink('${file.download_url}')" title="Copier lien">
                            <i class="fas fa-link"></i>
                        </button>
                        <button class="btn-icon btn-download" onclick="event.stopPropagation(); App.downloadFileWithAuth('${file.id}', ${file.has_password})" title="Télécharger">
                            <i class="fas fa-download"></i>
                        </button>
                    </div>
                </div>
            `;
        } else {
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
        }
        
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
                        case 'metadata': this.showMetadata(this.selectedFolderId, 'folder'); break;
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

    async downloadFileWithAuth(fileId, hasPass) {
        let pass = '';
        if (hasPass == 1) { 
            pass = await this.askPassword("Mot de passe du fichier :"); 
            if(!pass) return; 
        }
        const url = `${API_URL}?action=download&id=${fileId}&password=${encodeURIComponent(pass)}`;
        window.open(url, '_blank');
    },

    createFolder() {
        const name = document.getElementById('folder-name').value.trim();
        if(name) {
            this.currentFolder = this.generateUUID();
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

    async handleUpload() {
        const fileInput = document.getElementById('file-input');
        const files = fileInput.files;
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
        const folders = new Set(); 
        this.files.forEach(f => { if(f.group_id) folders.add(f.group_id); });
        let html = `<div class="folder-option" onclick="App.confirmMove('root')"><i class="fas fa-home"></i> Racine</div>`;
        folders.forEach(gid => { 
            if(gid!==this.currentFolder) {
                const fm = this.files.find(x => x.group_id === gid);
                html += `<div class="folder-option" onclick="App.confirmMove('${gid}')"><i class="fas fa-folder"></i> ${fm?fm.group_name:gid.substring(0,8)}</div>`; 
            }
        });
        const old = document.getElementById('move-modal'); 
        if(old) old.remove();
        document.body.insertAdjacentHTML('beforeend', `<div id="move-modal" class="modal active"><div class="modal-content"><div class="modal-header"><h3>Déplacer</h3><button class="close-btn" onclick="document.getElementById('move-modal').remove()">&times;</button></div><div class="modal-body" style="max-height:300px;overflow-y:auto">${html}</div></div></div>`);
    },
    
    async confirmMove(tg) {
        document.getElementById('move-modal').remove();
        await this.apiRequest('move', { method: 'POST', body: JSON.stringify({ ids: Array.from(this.selectedItems), target_group_id: tg }) });
        this.clearSelection(); 
        this.loadFiles();
    },
    
    async apiRequest(ep, opts={}) {
        const h = { 'Authorization': `Bearer ${this.token}`, 'Content-Type': 'application/json', ...opts.headers };
        if (opts.body instanceof FormData) delete h['Content-Type'];
        try { 
            const r = await fetch(`${API_URL}?action=${ep}`, { ...opts, headers: h }); 
            return await r.json(); 
        } catch (e) { 
            return { success: false, error: 'Erreur réseau' }; 
        }
    },
    
    copyLink(url) { 
        navigator.clipboard.writeText(url)
            .then(() => this.showToast("Lien copié dans le presse-papier"))
            .catch(() => {
                const textArea = document.createElement("textarea");
                textArea.value = url;
                textArea.style.position = "fixed";
                textArea.style.left = "-999999px";
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                try {
                    document.execCommand('copy');
                    this.showToast("Lien copié");
                } catch (err) {
                    prompt("Copiez ce lien :", url);
                }
                document.body.removeChild(textArea);
            });
    },
    
    updateBreadcrumb() {
        const bc = document.querySelector('.breadcrumb');
        if(this.currentFolder) bc.innerHTML = `<span onclick="App.currentFolder=null;App.loadFiles()" style="cursor:pointer;color:blue">Accueil</span> / Dossier`;
        else bc.innerHTML = `Accueil`;
    },
    
    handleSearch(e) {
        const v = e.target.value.toLowerCase();
        document.querySelectorAll('.file-item').forEach(el => el.style.display = el.innerText.toLowerCase().includes(v) ? 'flex' : 'none');
    },
    
    setupDragAndDrop() {
        const dz = document.getElementById('drop-zone');
        const m = document.querySelector('.main-content');
        if(m && dz) {
            ['dragenter','dragover'].forEach(e => m.addEventListener(e, (ev) => { ev.preventDefault(); dz.classList.add('active'); }));
            ['dragleave','drop'].forEach(e => m.addEventListener(e, (ev) => { ev.preventDefault(); dz.classList.remove('active'); }));
            m.addEventListener('drop', (e) => { 
                if(e.dataTransfer.files.length){ 
                    document.getElementById('file-input').files = e.dataTransfer.files; 
                    document.getElementById('upload-modal').classList.add('active'); 
                }
            });
        }
    },
    
    showToast(msg, type='success') {
        let t = document.getElementById('toast');
        if(!t) { 
            t = document.createElement('div'); 
            t.id='toast'; 
            t.className='toast'; 
            document.body.appendChild(t); 
        }
        t.textContent = msg; 
        t.style.background = type==='error'?'#dc3545':'#333';
        t.classList.add('active'); 
        setTimeout(()=>t.classList.remove('active'), 3000);
    },
    
    showMetadata(item, type) {
        const modal = document.getElementById('metadata-modal');
        const content = document.getElementById('metadata-content');
        
        let html = '';
        if (type === 'file') {
            html = `
                <div class="metadata-row"><div class="metadata-label">Nom</div><div class="metadata-value">${item.name}</div></div>
                <div class="metadata-row"><div class="metadata-label">Taille</div><div class="metadata-value">${this.formatFileSize(item.size)}</div></div>
                <div class="metadata-row"><div class="metadata-label">Téléchargements</div><div class="metadata-value">${item.download_count || 0}</div></div>
                <div class="metadata-row"><div class="metadata-label">Date d'ajout</div><div class="metadata-value">${new Date(item.created_at).toLocaleString()}</div></div>
                <div class="metadata-row"><div class="metadata-label">Protégé</div><div class="metadata-value">${item.has_password ? 'Oui' : 'Non'}</div></div>
                <div class="metadata-row"><div class="metadata-label">Lien</div><div class="metadata-value"><button class="btn-sm btn-secondary" onclick="App.copyLink('${item.download_url}')">Copier le lien</button></div></div>
            `;
        } else {
            const folderMeta = this.files.find(f => f.group_id === item);
            const fileCount = this.files.filter(f => f.group_id === item).length;
            const folderName = folderMeta?.group_name || 'Dossier';
            const folderColor = folderMeta?.group_color || '#3b82f6';
            const downloadUrl = `${API_URL}?action=download_folder&group_id=${item}`;
            
            html = `
                <div class="metadata-row"><div class="metadata-label">Nom</div><div class="metadata-value">${folderName}</div></div>
                <div class="metadata-row"><div class="metadata-label">Couleur</div><div class="metadata-value"><span style="display:inline-block;width:20px;height:20px;background:${folderColor};border-radius:4px;vertical-align:middle;"></span> ${folderColor}</div></div>
                <div class="metadata-row"><div class="metadata-label">Fichiers</div><div class="metadata-value">${fileCount} fichier(s)</div></div>
                <div class="metadata-row"><div class="metadata-label">Protégé</div><div class="metadata-value">${folderMeta?.is_group_protected ? 'Oui' : 'Non'}</div></div>
                <div class="metadata-row"><div class="metadata-label">Lien de téléchargement</div><div class="metadata-value"><button class="btn-sm btn-secondary" onclick="App.copyLink('${downloadUrl}')">Copier le lien</button></div></div>
            `;
        }
        
        content.innerHTML = html;
        modal.classList.add('active');
    },
    
    getFileIcon(n) { 
        const x = n.split('.').pop().toLowerCase(); 
        return ({'pdf':'fa-file-pdf','jpg':'fa-file-image','jpeg':'fa-file-image','png':'fa-file-image','gif':'fa-file-image','doc':'fa-file-word','docx':'fa-file-word','xls':'fa-file-excel','xlsx':'fa-file-excel','mp4':'fa-file-video','avi':'fa-file-video','mov':'fa-file-video'}[x] || 'fa-file'); 
    },
    
    formatFileSize(b) { 
        if(!b) return '0 B'; 
        const i=Math.floor(Math.log(b)/Math.log(1024)); 
        return (b/Math.pow(1024,i)).toFixed(2)+' '+['B','KB','MB','GB'][i]; 
    },
    
    generateUUID() { 
        return crypto.randomUUID(); 
    },
    
    escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    }
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
.btn-sm { font-size: 12px; padding: 6px 10px; }
.file-actions { opacity: 0; transition: opacity 0.2s; }
.file-item {display:flex; justi}
.file-item:hover .file-actions { opacity: 1; }
.selection-checkbox { position: absolute; top: 10px; left: 10px; width: 20px; height: 20px; border: 2px solid #ccc; border-radius: 4px; background: white; display: flex; align-items: center; justify-content: center; cursor: pointer; opacity: 0; transition: opacity 0.2s; z-index: 10; }
.file-item:hover .selection-checkbox, .file-item.selected .selection-checkbox { opacity: 1; }
.selection-checkbox.checked { background-color: #007bff; border-color: #007bff; color: white; }
.file-item.selected { border-color: #007bff; background-color: #e3f2fd; }
.selection-toolbar { display:none; justify-content: space-between; padding: 10px 20px; background: #e3f2fd; border-bottom: 1px solid #ddd; }
.folder-option { padding: 10px; border-bottom: 1px solid #eee; cursor: pointer; display: flex; align-items: center; gap: 10px; }
.folder-option:hover { background: #f5f5f5; }
.input-group { margin-bottom: 15px; } 
.input-group label { display: block; margin-bottom: 5px; font-size: 14px; font-weight: 500; }
.metadata-row { padding: 12px 0; border-bottom: 1px solid #eee; display: flex; align-items: flex-start; }
.metadata-label { min-width: 150px; font-weight: 600; color: #555; }
.metadata-value { flex: 1; color: #333; }

/* VUE LISTE */
.list-header { display: none; padding: 10px 30px; background: #f8f9fa; border-bottom: 2px solid #ddd; font-weight: 600; color: #555; position: sticky; top: 0; z-index: 100; }
.list-header-content { display: flex; align-items: center; gap: 10px; padding-left: 30px; }
.list-header-checkbox { width: 30px; }
.sort-header { cursor: pointer; user-select: none; display: flex; align-items: center; gap: 5px; padding: 5px 10px; border-radius: 4px; transition: background 0.2s; }
.sort-header:hover { background: rgba(0, 0, 0, 0.05); }
.sort-icon { font-size: 12px; opacity: 0.3; transition: opacity 0.2s; }
.sort-header:hover .sort-icon { opacity: 0.6; }

/* Structure de la liste */
.file-list { display: flex !important; flex-direction: column; gap: 0 !important; padding: 0 30px !important; }
.file-list + .list-header { display: block; }
.file-list .file-item { 
    flex-direction: row !important; 
    padding: 12px 0 !important; 
    border-radius: 0 !important; 
    border: none !important; 
    border-bottom: 1px solid #eee !important; 
    text-align: left !important; 
    align-items: center !important; 
    min-height: auto !important;
    height: auto !important;
}
.file-list .file-item:hover { background-color: #f8f9fa !important; transform: none !important; box-shadow: none !important; }
.file-list .file-item.selected { background-color: #e3f2fd !important; }

/* Contenu en vue liste */
.file-list-content { 
    display: flex !important; 
    align-items: center !important; 
    gap: 10px !important; 
    width: 100% !important; 
    padding-left: 30px !important; 
}
.file-list-icon { 
    width: 40px !important; 
    min-width: 40px !important; 
    display: flex !important; 
    align-items: center !important; 
    justify-content: center !important; 
    font-size: 20px !important; 
    position: relative !important; 
}
.file-list-icon i.fa-folder { color: #fbbf24; }
.file-list-icon i.fa-file-pdf { color: #ef4444; }
.file-list-icon i.fa-file-image { color: #8b5cf6; }
.file-list-icon i.fa-file-word { color: #3b82f6; }
.file-list-icon i.fa-file-excel { color: #10b981; }
.file-list-icon i.fa-file-video { color: #f97316; }
.file-list-name { 
    flex: 1 !important; 
    min-width: 0 !important; 
    font-size: 14px !important; 
    white-space: nowrap !important; 
    overflow: hidden !important; 
    text-overflow: ellipsis !important; 
    padding-right: 10px !important; 
    display: block !important;
}
.file-list-size { 
    width: 100px !important; 
    min-width: 100px !important; 
    text-align: right !important; 
    font-size: 13px !important; 
    color: #666 !important; 
    display: block !important;
}
.file-list-date { 
    width: 120px !important; 
    min-width: 120px !important; 
    text-align: right !important; 
    font-size: 13px !important; 
    color: #666 !important; 
    display: block !important;
}
.file-list-actions { 
    width: 100px !important; 
    min-width: 100px !important; 
    display: flex !important; 
    gap: 5px !important; 
    justify-content: flex-end !important; 
    align-items: center !important; 
}

/* En-têtes alignés */
.list-header-content > .sort-header:nth-child(1) { flex: 1; min-width: 0; }
.list-header-content > .sort-header:nth-child(2) { width: 100px; justify-content: flex-end; }
.list-header-content > .sort-header:nth-child(3) { width: 120px; justify-content: flex-end; }
.list-header-actions { width: 100px; text-align: right; }

/* Boutons en vue liste */
.btn-icon { background: transparent; border: none; padding: 6px 8px; border-radius: 4px; cursor: pointer; color: #666; transition: all 0.2s; }
.btn-icon:hover { background: rgba(0, 0, 0, 0.1); color: #000; }

/* Checkbox en vue liste */
.file-list .selection-checkbox { left: 0; opacity: 0; }
.file-list .file-item:hover .selection-checkbox, .file-list .file-item.selected .selection-checkbox { opacity: 1; }

/* Actions visibilité */
.file-list .file-list-actions { opacity: 0.6; }
.file-list .file-item:hover .file-list-actions { opacity: 1; }

@media (max-width: 768px) {
    .file-list-size, .file-list-date, .list-header-content > .sort-header:nth-child(2), .list-header-content > .sort-header:nth-child(3) { display: none; }
    .file-list-actions, .list-header-actions { width: 60px; }
    .file-list-content { padding-left: 10px; }
}
`;
document.head.appendChild(styleSheet);

document.addEventListener('DOMContentLoaded', () => App.init());