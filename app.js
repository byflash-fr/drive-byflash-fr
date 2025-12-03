// app.js - Byflash Drive Frontend Logic v2.4 (Version Finale Corrigée)

const API_URL = 'https://api.byflash.fr/index.php'; // Vérifiez votre URL

const App = {
    token: null,
    userEmail: null,
    files: [],
    trash: [], // Stockage local de la corbeille
    currentView: 'files', // 'files' ou 'trash'
    currentFolder: null, // Null = Racine, Sinon = ID du groupe
    selectedFile: null, 
    selectedFolderId: null,
    selectedItems: new Set(),
    
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
        
        // Navigation Menu (CORRECTION ICI)
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => this.handleNavigation(e));
        });

        // Navigation & Upload
        document.getElementById('upload-btn').addEventListener('click', () => document.getElementById('upload-modal').classList.add('active'));
        document.getElementById('confirm-upload')?.addEventListener('click', () => this.handleUpload());
        document.getElementById('new-folder-btn')?.addEventListener('click', () => document.getElementById('folder-modal').classList.add('active'));
        document.getElementById('confirm-folder')?.addEventListener('click', () => this.createFolder());

        // Recherche
        document.getElementById('search-input')?.addEventListener('input', (e) => this.handleSearch(e));

        // Fermeture Modales
        document.querySelectorAll('.close-btn, .btn-secondary').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const modal = e.target.closest('.modal');
                // On ne ferme pas si c'est un bouton d'action ou de la toolbar
                if (modal && !e.target.classList.contains('btn-primary') && !e.target.classList.contains('btn-copy') && !e.target.closest('.selection-toolbar')) {
                    modal.classList.remove('active');
                }
            });
        });

        // Drag & Drop
        this.setupDragAndDrop();
        this.setupContextMenu(); 
        
        // Clic global
        document.addEventListener('click', (e) => {
            const cm = document.getElementById('context-menu');
            if(cm) cm.classList.remove('active');
            
            // Désélection si clic dans le vide (optionnel)
            if (!e.target.closest('.file-item') && !e.target.closest('.selection-toolbar') && !e.target.closest('.modal') && !e.target.closest('.nav-item')) {
                // this.clearSelection(); 
            }
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
        
        // Par défaut on charge les fichiers
        this.handleNavigation({ currentTarget: document.querySelector('.nav-item[data-view="files"]') });
    },

    // --- NAVIGATION (CORRECTION MAJEURE) ---
    handleNavigation(e) {
        if (!e || !e.currentTarget) return; // Sécurité
        if (e.preventDefault) e.preventDefault();

        const view = e.currentTarget.dataset.view;
        this.currentView = view;

        // Mise à jour visuelle du menu
        document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
        e.currentTarget.classList.add('active');

        const fileContainer = document.getElementById('file-container');
        const trashContainer = document.getElementById('trash-container');
        const uploadBtn = document.getElementById('upload-btn');
        const newFolderBtn = document.getElementById('new-folder-btn');
        const searchBox = document.querySelector('.search-box');
        const selectionToolbar = document.getElementById('selection-toolbar');

        if (view === 'files') {
            fileContainer.style.display = 'grid';
            trashContainer.style.display = 'none';
            if(uploadBtn) uploadBtn.style.display = 'inline-flex';
            if(newFolderBtn) newFolderBtn.style.display = 'inline-flex';
            if(searchBox) searchBox.style.visibility = 'visible';
            if (selectionToolbar && this.selectedItems.size > 0) selectionToolbar.style.display = 'flex';
            this.loadFiles();
        } else if (view === 'trash') {
            fileContainer.style.display = 'none';
            trashContainer.style.display = 'grid';
            if(uploadBtn) uploadBtn.style.display = 'none';
            if(newFolderBtn) newFolderBtn.style.display = 'none';
            if(searchBox) searchBox.style.visibility = 'hidden';
            if (selectionToolbar) selectionToolbar.style.display = 'none';
            this.loadTrash();
        }
    },

    // --- CHARGEMENT DES DONNÉES ---
    async loadFiles() {
        const spinner = document.getElementById('loading-spinner');
        if(spinner) spinner.style.display = 'block';

        const params = this.currentFolder ? `&group_id=${this.currentFolder}` : '';

        try {
            const res = await fetch(`${API_URL}?action=files${params}`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            
            if (res.status === 401) {
                this.handleLogout();
                return;
            }

            const data = await res.json();

            if (data.success) {
                this.files = data.files;
                this.renderFiles();
                this.updateBreadcrumb();
            } else {
                this.showToast(data.error || "Erreur chargement", "error");
            }
        } catch (error) {
            console.error(error);
            this.showToast("Erreur de connexion", "error");
        }

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

    // --- RENDU FICHIERS (DISPLAY) ---
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

        // Affichage Racines (Dossiers + Fichiers orphelins)
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
        // Affichage Contenu Dossier
        else {
            if (grouped[this.currentFolder]) {
                grouped[this.currentFolder].forEach(f => container.appendChild(this.createFileItem(f)));
            } else {
                container.innerHTML = '<div style="grid-column:1/-1; text-align:center;">Dossier vide</div>';
            }
        }
    },

    // --- RENDU CORBEILLE (DISPLAY) ---
    renderTrash() {
        const container = document.getElementById('trash-container');
        container.innerHTML = '';

        if (!this.trash || this.trash.length === 0) {
            container.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:#888; margin-top:50px;"><i class="fas fa-trash" style="font-size:48px; margin-bottom:10px;"></i><br>La corbeille est vide</div>';
            return;
        }

        this.trash.forEach(item => {
            const div = document.createElement('div');
            div.className = 'file-item';
            div.style.opacity = '0.7';
            div.style.cursor = 'default';
            
            const icon = item.item_type === 'group' ? 'fa-folder' : this.getFileIcon(item.original_name);
            const name = item.original_name || 'Élément supprimé';

            div.innerHTML = `
                <i class="fas ${icon} file-icon" style="color: #666;"></i>
                <div class="file-name">${name}</div>
                <div class="file-meta">Supprimé le ${new Date(item.created_at).toLocaleDateString()}</div>
                <button class="btn-sm btn-primary" onclick="App.restoreItem('${item.item_id}')" style="margin-top:10px;">
                    <i class="fas fa-trash-restore"></i> Restaurer
                </button>
            `;
            container.appendChild(div);
        });
    },

    // --- CRÉATION ÉLÉMENTS HTML ---
    createFolderItem(groupId, meta, count) {
        const div = document.createElement('div');
        div.className = 'file-item folder-item';
        
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
                <a href="${file.download_url}" class="btn-sm btn-primary" onclick="event.stopPropagation()" target="_blank" title="Télécharger">
                    <i class="fas fa-download"></i>
                </a>
            </div>
        `;
        
        // Gestion Clic (Sélection avec Ctrl) vs Clic Droit
        div.addEventListener('click', (e) => {
            if (e.ctrlKey || e.metaKey) {
                this.toggleSelection(file.id);
            } 
        });

        div.addEventListener('contextmenu', (e) => {
            if (!this.selectedItems.has(file.id)) {
                // Si on fait clic droit sur un élément non sélectionné, ça devient la cible unique
                // (Optionnel : this.clearSelection(); )
            }
            this.selectedFile = file; 
            this.showContextMenu(e, file.id, 'file');
        });

        return div;
    },

    // --- SÉLECTION MULTIPLE ---
    toggleSelection(id) {
        if (this.selectedItems.has(id)) {
            this.selectedItems.delete(id);
        } else {
            this.selectedItems.add(id);
        }
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
                    <span id="selection-count" style="font-weight:bold; margin-right:15px; color:#333;">0 élément(s)</span>
                    <button class="btn btn-secondary btn-sm" onclick="App.clearSelection()">Annuler</button>
                </div>
                <div class="toolbar-right" style="display:flex; gap:10px;">
                    <button class="btn btn-primary" onclick="App.openMoveModal()"><i class="fas fa-folder-open"></i> Déplacer</button>
                    <button class="btn btn-danger" style="background:#dc3545; color:white; border:none;" onclick="App.deleteSelected()"><i class="fas fa-trash"></i> Supprimer</button>
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
                        case 'download': await this.downloadFile(this.selectedFile); break;
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
                    const folderMeta = this.files.find(f => f.group_id === this.selectedFolderId);
                    const currentName = folderMeta ? (folderMeta.group_name || `Dossier`) : 'Dossier';
                    const currentColor = folderMeta ? (folderMeta.group_color || '#3b82f6') : '#3b82f6';

                    switch(action) {
                        case 'rename': this.openFolderSettings(this.selectedFolderId, currentName, currentColor); break;
                        case 'delete':
                            if(confirm('Supprimer ce dossier et tout son contenu ?')) await this.deleteFile(this.selectedFolderId, 'group');
                            break;
                        case 'download':
                            window.open(`${API_URL}?action=download_folder&group_id=${this.selectedFolderId}`, '_blank');
                            break;
                    }
                }
                this.selectedFile = null;
                this.selectedFolderId = null;
            });
        });
    },

    showContextMenu(e, itemId, type) {
        e.preventDefault();
        const menu = document.getElementById('context-menu');
        this.selectedFile = null;
        this.selectedFolderId = null;

        if (type === 'file') {
            this.selectedFile = this.files.find(f => f.id === itemId);
        } else {
            this.selectedFolderId = itemId;
        }

        let x = e.pageX;
        let y = e.pageY;
        if(x + 200 > window.innerWidth) x = window.innerWidth - 210;
        
        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;
        menu.classList.add('active');
    },

    // --- ACTIONS : DELETE / RESTORE / MOVE ---
    async deleteFile(id, type) { 
        await this.apiRequest('delete', { method: 'POST', body: JSON.stringify({ id: id, type: type }) }); 
        this.loadFiles();
    },

    async deleteSelected() {
        if (this.selectedItems.size === 0) return;
        if (!confirm(`Voulez-vous vraiment supprimer ${this.selectedItems.size} fichier(s) ?`)) return;

        const promises = Array.from(this.selectedItems).map(id => 
            this.apiRequest('delete', { method: 'POST', body: JSON.stringify({ id: id, type: 'file' }) })
        );

        await Promise.all(promises);
        this.showToast("Éléments supprimés");
        this.clearSelection();
        this.loadFiles();
    },

    async restoreItem(id) {
        if(!confirm("Restaurer cet élément ?")) return;
        try {
            const res = await fetch(`${API_URL}?action=restore`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${this.token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: id })
            });
            const data = await res.json();
            if (data.success) {
                this.showToast("Restauré avec succès");
                this.loadTrash();
            } else {
                this.showToast(data.error || "Erreur", "error");
            }
        } catch (e) { this.showToast("Erreur serveur", "error"); }
    },

    openMoveModal() {
        if (this.selectedItems.size === 0) return;
        const folders = new Set();
        this.files.forEach(f => { if (f.group_id) folders.add(f.group_id); });

        let folderOptions = `<div class="folder-option" onclick="App.confirmMove('root')"><i class="fas fa-home"></i> Racine</div>`;

        folders.forEach(groupId => {
            if (groupId !== this.currentFolder) {
                const fMeta = this.files.find(f => f.group_id === groupId);
                const name = fMeta ? (fMeta.group_name || groupId.substring(0,8)) : groupId;
                folderOptions += `<div class="folder-option" onclick="App.confirmMove('${groupId}')"><i class="fas fa-folder"></i> ${name}</div>`;
            }
        });

        const old = document.getElementById('move-modal');
        if(old) old.remove();

        const modalHTML = `
        <div id="move-modal" class="modal active">
            <div class="modal-content">
                <div class="modal-header"><h3>Déplacer vers...</h3><button class="close-btn" onclick="document.getElementById('move-modal').remove()">&times;</button></div>
                <div class="modal-body" style="max-height:300px;overflow-y:auto;">${folderOptions}</div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
    },

    async confirmMove(targetGroupId) {
        document.getElementById('move-modal').remove();
        try {
            const res = await fetch(`${API_URL}?action=move`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${this.token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ids: Array.from(this.selectedItems),
                    target_group_id: targetGroupId
                })
            });
            const data = await res.json();
            if (data.success) {
                this.showToast("Déplacé avec succès");
                this.clearSelection();
                this.loadFiles();
            } else { this.showToast(data.error || "Erreur", "error"); }
        } catch(e) { console.error(e); }
    },

    // --- UPLOAD & DOSSIER CREATE ---
    createFolder() {
        const name = document.getElementById('folder-name').value.trim();
        if(name) {
            // Création dossier virtuel : on crée un groupe sans fichiers au début
            // L'API actuelle crée les groupes à l'upload. 
            // Pour créer un dossier vide, il faudrait une action API dédiée ou on change juste le currentFolder
            // Astuce : on utilise currentFolder comme ID généré, le dossier sera "réel" au premier upload
            this.currentFolder = this.generateUUID();
            // Optionnel : Sauvegarder le nom immédiatement si API supporte
            // Ici on simule en mettant à jour le titre, mais sans fichier il ne s'affichera pas au refresh
            this.loadFiles(); 
            document.getElementById('folder-modal').classList.remove('active');
            document.getElementById('folder-name').value = '';
            this.showToast("Dossier prêt. Ajoutez des fichiers.");
        }
    },

    async handleUpload() {
        const fileInput = document.getElementById('file-input');
        const files = fileInput.files;
        if (files.length === 0) return;

        const groupId = this.currentFolder || this.generateUUID();
        const confirmBtn = document.getElementById('confirm-upload');
        confirmBtn.textContent = "Envoi...";
        confirmBtn.disabled = true;

        let successCount = 0;
        for (let i = 0; i < files.length; i++) {
            const formData = new FormData();
            formData.append('file', files[i]);
            formData.append('group_id', groupId);
            const pwdCheck = document.getElementById('password-check');
            const pwdInput = document.getElementById('file-password');
            if(pwdCheck && pwdCheck.checked && pwdInput.value) formData.append('password', pwdInput.value);

            try {
                const res = await fetch(`${API_URL}?action=upload`, {
                    method: 'POST', headers: { 'Authorization': `Bearer ${this.token}` }, body: formData
                });
                const data = await res.json();
                if(data.success) successCount++;
            } catch(e) { console.error(e); }
        }

        confirmBtn.textContent = "Upload";
        confirmBtn.disabled = false;
        document.getElementById('upload-modal').classList.remove('active');
        fileInput.value = '';

        if (successCount > 0) {
            this.showToast(`${successCount} fichier(s) envoyé(s)`);
            this.loadFiles();
        } else {
            this.showToast("Erreur lors de l'upload", "error");
        }
    },

    // --- NAVIGATION & SÉCURITÉ ---
    async enterFolder(groupId, isLocked) {
        if (isLocked) {
            const password = prompt("Dossier protégé. Mot de passe :");
            if (password === null) return; 
            try {
                const res = await fetch(`${API_URL}?action=check_group_password`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ group_id: groupId, password: password })
                });
                const data = await res.json();
                if (!data.success) { this.showToast("Mot de passe incorrect", "error"); return; }
            } catch (e) { this.showToast("Erreur vérification", "error"); return; }
        }
        this.currentFolder = groupId;
        this.loadFiles();
    },

    updateBreadcrumb() {
        const bc = document.querySelector('.breadcrumb');
        if(!bc) return;
        if (this.currentFolder) {
            bc.innerHTML = `<span class="breadcrumb-item" onclick="App.currentFolder=null; App.loadFiles()" style="cursor:pointer; color: #3b82f6;"><i class="fas fa-home"></i> Accueil</span> <span style="margin:0 5px;">/</span> <span class="breadcrumb-item active">Dossier</span>`;
        } else {
            bc.innerHTML = `<span class="breadcrumb-item active"><i class="fas fa-home"></i> Accueil</span>`;
        }
    },

    // --- PARAMÈTRES DOSSIER ---
    openFolderSettings(groupId, currentName, currentColor) {
        this.editingGroupId = groupId;
        if (!document.getElementById('folder-settings-modal')) {
            const modalHtml = `
            <div id="folder-settings-modal" class="modal">
                <div class="modal-content">
                    <div class="modal-header"><h3>Modifier le dossier</h3><button class="close-btn" onclick="document.getElementById('folder-settings-modal').classList.remove('active')">&times;</button></div>
                    <div class="modal-body">
                        <div class="input-group"><label>Nom</label><input type="text" id="edit-folder-name" class="input-field"></div>
                        <div class="input-group"><label>Couleur</label><input type="color" id="edit-folder-color" class="input-field" style="height:40px;width:100%"></div>
                        <div class="input-group"><label>Mot de passe</label><input type="password" id="edit-folder-pass" class="input-field" placeholder="Nouveau mot de passe (vide = pas de changement)"></div>
                    </div>
                    <div class="modal-footer"><button class="btn btn-secondary close-modal-btn" onclick="document.getElementById('folder-settings-modal').classList.remove('active')">Annuler</button><button class="btn btn-primary" id="save-folder-settings">Enregistrer</button></div>
                </div>
            </div>`;
            document.body.insertAdjacentHTML('beforeend', modalHtml);
            document.getElementById('save-folder-settings').onclick = () => this.saveFolderSettings();
        }
        document.getElementById('edit-folder-name').value = currentName;
        document.getElementById('edit-folder-color').value = currentColor;
        document.getElementById('edit-folder-pass').value = ''; 
        document.getElementById('folder-settings-modal').classList.add('active');
    },

    async saveFolderSettings() {
        const name = document.getElementById('edit-folder-name').value;
        const color = document.getElementById('edit-folder-color').value;
        const password = document.getElementById('edit-folder-pass').value;
        try {
            const res = await fetch(`${API_URL}?action=update_group`, {
                method: 'POST', headers: { 'Authorization': `Bearer ${this.token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: this.editingGroupId, name: name, color: color, password: password })
            });
            const data = await res.json();
            if (data.success) {
                document.getElementById('folder-settings-modal').classList.remove('active');
                this.showToast('Dossier mis à jour');
                this.loadFiles(); 
            } else { alert(data.error || "Erreur mise à jour"); }
        } catch (e) { this.showToast("Erreur serveur", "error"); }
    },

    // --- OUTILS ---
    async apiRequest(endpoint, options = {}) {
        const url = `${API_URL}?action=${endpoint}`;
        const headers = { 'Authorization': `Bearer ${this.token}`, 'Content-Type': 'application/json', ...options.headers };
        if (options.body instanceof FormData) delete headers['Content-Type'];
        try {
            const response = await fetch(url, { ...options, headers });
            return await response.json();
        } catch (error) { console.error(error); return { success: false, error: 'Erreur réseau' }; }
    },

    async downloadFile(file) {
        let password = '';
        if (file.has_password == 1) { password = prompt("Mot de passe fichier :"); if (!password) return; }
        const url = `${API_URL}?action=download&id=${file.id}&password=${encodeURIComponent(password)}`;
        this.copyLink(url); 
        window.open(url, '_blank');
    },

    copyLink(url) {
        navigator.clipboard.writeText(url).then(() => this.showToast("Lien copié !"))
        .catch(() => prompt("Copiez le lien :", url));
    },

    handleSearch(e) {
        const term = e.target.value.toLowerCase();
        document.querySelectorAll('.file-item').forEach(el => {
            const name = el.querySelector('.file-name').textContent.toLowerCase();
            el.style.display = name.includes(term) ? 'flex' : 'none';
        });
    },

    showMetadata(item, type) { alert(`Nom : ${item.name}\nTaille : ${this.formatFileSize(item.size)}`); },

    setupDragAndDrop() {
        const dropZone = document.getElementById('drop-zone');
        const main = document.querySelector('.main-content');
        if(!main || !dropZone) return;
        ['dragenter', 'dragover'].forEach(e => main.addEventListener(e, (evt) => { evt.preventDefault(); dropZone.classList.add('active'); }));
        ['dragleave', 'drop'].forEach(e => main.addEventListener(e, (evt) => { evt.preventDefault(); dropZone.classList.remove('active'); }));
        main.addEventListener('drop', (e) => {
            if (e.dataTransfer.files.length > 0) {
                document.getElementById('file-input').files = e.dataTransfer.files;
                document.getElementById('upload-modal').classList.add('active');
            }
        });
    },

    showToast(message, type = 'success') {
        let toast = document.getElementById('toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'toast';
            toast.className = 'toast';
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.style.backgroundColor = type === 'error' ? '#dc3545' : '#333';
        toast.classList.add('active');
        setTimeout(() => toast.classList.remove('active'), 3000);
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
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + ['B', 'KB', 'MB', 'GB'][i];
    },

    generateUUID() { return crypto.randomUUID(); }
};

// Styles dynamiques
const styleSheet = document.createElement("style");
styleSheet.innerText = `
    .file-item { position: relative; }
    .file-item.selected { border-color: #007bff; background-color: #e3f2fd; }
    .selection-checkbox {
        position: absolute; top: 10px; left: 10px; width: 20px; height: 20px;
        border: 2px solid #ccc; border-radius: 4px; background: white;
        display: flex; align-items: center; justify-content: center;
        cursor: pointer; opacity: 0; transition: opacity 0.2s; z-index: 10;
    }
    .file-item:hover .selection-checkbox, .file-item.selected .selection-checkbox { opacity: 1; }
    .selection-checkbox.checked { background-color: #007bff; border-color: #007bff; color: white; }
    .folder-item { position: relative; }
    .btn-settings { background: rgba(255,255,255,0.9); border: 1px solid #ddd; padding: 5px 8px; border-radius: 50%; cursor: pointer; color: #666; display: none; }
    .folder-item:hover .btn-settings { display: block; }
    .btn-settings:hover { transform: scale(1.1); color: #000; background: white; }
    .btn-copy { font-size: 12px; padding: 4px 8px; border: 1px solid #ddd; border-radius: 4px; background: #f8f9fa; cursor: pointer; }
    .btn-copy:hover { background: #e2e6ea; }
    .file-actions { opacity: 0; transition: opacity 0.2s; }
    .file-item:hover .file-actions { opacity: 1; }
    .selection-toolbar { display:none; justify-content: space-between; padding: 10px 20px; background: #e3f2fd; border-bottom: 1px solid #ddd; }
    .folder-option { padding: 10px; border-bottom: 1px solid #eee; cursor: pointer; display: flex; align-items: center; gap: 10px; }
    .folder-option:hover { background: #f5f5f5; }
`;
document.head.appendChild(styleSheet);

document.addEventListener('DOMContentLoaded', () => App.init());