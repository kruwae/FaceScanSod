const CACHE_NAME = 'facescansod-v4';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/scan.html',
  '/login.html',
  '/register.html',
  '/config.html',
  '/report.html',
  '/js/security.js',
  'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.js',
  'https://cdn.jsdelivr.net/npm/sweetalert2@11',
  'https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;600;700&display=swap'
];

// Add model files to cache explicitly
const MODEL_FILES = [
  '/models/ssd_mobilenetv1_model-weights_manifest.json',
  '/models/ssd_mobilenetv1_model-shard1',
  '/models/face_landmark_68_model-weights_manifest.json',
  '/models/face_landmark_68_model-shard1',
  '/models/face_recognition_model-weights_manifest.json',
  '/models/face_recognition_model-shard1',
  '/models/face_recognition_model-shard2'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Load explicitly set assets
      return cache.addAll([...STATIC_ASSETS, ...MODEL_FILES]);
    }).catch(err => {
      console.error('SW Install Error:', err);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // Always fetch dynamic API directly from Network
  if (e.request.url.includes('script.google.com') || e.request.url.includes('script.googleusercontent.com')) {
    e.respondWith(fetch(e.request).catch(err => {
      console.warn('API Fetch Failed', err);
      throw err;
    }));
    return;
  }

  // Treat Models and Static resources as Cache-First
  e.respondWith(
    caches.match(e.request).then(cachedResponse => {
      return cachedResponse || fetch(e.request).then(response => {
        // Cache new successful GET requests 
        if (e.request.method === 'GET' && response.status === 200) {
          const resClone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, resClone));
        }
        return response;
      });
    }).catch(() => {
      // Fallback
    })
  );
});
