# ☁️ Byflash Drive

**Byflash Drive** is a modern, fast, and secure web-based file management application. Designed as a **Progressive Web App (PWA)**, it offers a smooth user experience similar to a native application, allowing you to store, organize, and protect your digital documents.

## ✨ Key Features

### 🔐 Authentication & Security

  * **Secure Login:** Authentication system via email and password through the Byflash API.
  * **Password Protection:**
      * **Folders:** Ability to lock access to specific folders with a password.
      * **Files:** Option to protect the download of sensitive files with a password during upload.
  * **Logout:** Secure session management with local token removal.

### 📂 Advanced File Management

  * **Intuitive Upload:**
      * Classic upload button.
      * **Drag & Drop:** Drag and drop files directly into the interface.
  * **File Operations:**
      * Download (secure or public).
      * Rename files and folders.
      * Move files to other folders.
      * Delete (send to trash).
  * **Folder Management:** Create new folders and smooth navigation (Breadcrumb trail).
  * **Trash:** Recovery system for deleted files with a restore option.

### 🖥️ User Interface & Experience (UI/UX)

  * **Multiple Views:**
      * **Grid View:** Visual display with icons adapted to the file type (PDF, Word, Image, Video, etc.).
      * **List View:** Detailed display with sorting capabilities by Name, Size, or Date.
  * **Context Menu:** Custom right-click menu on files and folders for quick access to actions (Download, Rename, Info, Delete).
  * **Search:** Real-time search bar to filter displayed items.
  * **Multi-selection:** Ability to select multiple files (via Ctrl/Cmd or checkboxes) for bulk actions (deletion, moving).
  * **Metadata:** Detailed visualization of file information (Size, Date, Download count, Protection status).

### 📱 Accessibility & Technology

  * **Responsive Design:** Adaptive interface working on desktop, tablet, and mobile (with collapsible sidebar).
  * **PWA (Progressive Web App):**
      * Installable on desktop or mobile home screen.
      * Uses a Service Worker for cache management and performance.
  * **User Feedback:** "Toast" notifications to confirm actions and loading indicators (Spinner).

## 🛠️ Tech Stack

  * **Frontend:** HTML5, CSS3 (CSS Variables, Flexbox/Grid), JavaScript (ES6+, Vanilla JS).
  * **API:** Connection to a REST PHP API (`api.byflash.fr`).
  * **Icons:** FontAwesome.
  * **Architecture:** Lightweight Single Page Application (SPA).

## 🚀 Installation and Usage

Since the application is a static SPA (the backend is remote), installation is very simple.

1.  **Clone the repository:**

    ```bash
    git clone https://github.com/your-username/byflash-drive.git
    ```

2.  **Launch the application:**
    Simply open the `index.html` file in your browser or serve the folder via a local server (e.g., Live Server on VS Code, Apache, Nginx).

3.  **PWA Configuration (Optional):**
    For the PWA to fully function (installation), the site must be served via **HTTPS** (or `localhost`). Ensure the `sw.js` file is accessible at the root.

## 📄 License

This project is licensed under the **MIT License**. See the [LICENSE.txt](https://www.google.com/search?q=LICENSE.txt) file for details.

-----

*Copyright © 2025 Byflash.*