// Nom du stock de fichiers (cache)
const CACHE_NAME = 'byflash';
// Liste des fichiers à garder en mémoire (à adapter à ton site)
const ASSETS_TO_CACHE = [

];

// 1. Installation : Le standardiste stocke les fichiers
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Fichiers mis en cache');
        return cache.addAll(ASSETS_TO_CACHE);
      })
  );
});

// 2. Interception : Le standardiste sert les fichiers
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Si le fichier est dans le cache, on le rend. Sinon, on va le chercher sur internet.
        return response || fetch(event.request);
      })
  );
});