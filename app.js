const STORAGE_KEY = 'photo-archive-collection-v1';

const stage = document.getElementById('archive-stage');
const photoCountLabel = document.getElementById('photo-count');
const addPhotosBtn = document.getElementById('add-photos-btn');
const fileInput = document.getElementById('photo-upload');
const lightbox = document.getElementById('lightbox');
const lightboxImage = document.getElementById('lightbox-image');
const lightboxDate = document.getElementById('lightbox-date');
const lightboxMessage = document.getElementById('lightbox-message');
const lightboxClose = document.getElementById('lightbox-close');
const lightboxDownload = document.getElementById('lightbox-download');
const lightboxDelete = document.getElementById('lightbox-delete');
const uploadModal = document.getElementById('upload-modal');
const uploadForm = document.getElementById('upload-form');
const uploadMessageInput = document.getElementById('upload-message');
const uploadFileCount = document.getElementById('upload-file-count');
const uploadClose = document.getElementById('upload-close');
const uploadCancel = document.getElementById('upload-cancel');

const state = {
  photos: [],
  pendingFiles: [],
  activePhotoId: null,
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function getViewport() {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
  };
}

function createId(prefix = 'photo') {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return `${prefix}-${window.crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function rectsOverlap(a, b) {
  return !(
    a.x + a.width < b.x ||
    b.x + b.width < a.x ||
    a.y + a.height < b.y ||
    b.y + b.height < a.y
  );
}

function buildPhotoRecord({ url, caption, positionX, positionY, rotation, scale, depth = 0, width, height, uploadedBy = 'friend', id = createId('photo'), isNew = false, uploadedAt = new Date().toISOString() }) {
  return {
    id,
    imageUrl: url,
    uploadedBy,
    uploadedAt,
    caption,
    positionX,
    positionY,
    rotation,
    scale,
    depth,
    width,
    height,
    zIndex: 10,
    isNew,
  };
}

function formatDate(dateIso) {
  const date = new Date(dateIso);
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

function savePhotos() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.photos));
}

function loadPhotos() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('No se pudieron cargar las fotos guardadas:', error);
    return [];
  }
}

function renderPhotoCards() {
  stage.innerHTML = '';
  const fragment = document.createDocumentFragment();

  [...state.photos]
    .sort((a, b) => a.zIndex - b.zIndex)
    .forEach((photo) => {
      const card = document.createElement('article');
      card.className = 'photo-card';
      if (photo.isNew) {
        card.classList.add('is-new');
      }

      card.setAttribute('tabindex', '0');
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', 'Abrir fotografía del archivo');
      card.style.setProperty('--x', `${photo.positionX}px`);
      card.style.setProperty('--y', `${photo.positionY}px`);
      card.style.setProperty('--depth', `${photo.depth || 0}px`);
      card.style.setProperty('--rotation', `${photo.rotation}deg`);
      card.style.setProperty('--scale', `${photo.scale}`);
      card.style.setProperty('--photo-width', `${photo.width}px`);
      card.style.setProperty('--photo-height', `${photo.height}px`);
      card.style.setProperty('--z-index', `${photo.zIndex}`);

      const image = document.createElement('img');
      image.src = photo.imageUrl;
      image.alt = 'Fotografía del archivo';
      image.loading = 'eager';
      image.decoding = 'async';

      card.appendChild(image);
      card.addEventListener('click', () => openLightbox(photo));
      card.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openLightbox(photo);
        }
      });

      fragment.appendChild(card);
    });

  stage.appendChild(fragment);
  updatePhotoCount();
}

function updatePhotoCount() {
  photoCountLabel.textContent = `${state.photos.length}`;
}

function generateStablePositionForNewPhoto({ width, height }) {
  const { width: viewportWidth, height: viewportHeight } = getViewport();
  const anchorZones = [
    [0.12, 0.12],
    [0.5, 0.16],
    [0.78, 0.2],
    [0.2, 0.52],
    [0.68, 0.5],
    [0.22, 0.8],
    [0.7, 0.76],
    [0.42, 0.64],
  ];

  const padding = 28;
  const maxX = viewportWidth - width - padding;
  const maxY = viewportHeight - height - padding;

  for (let attempt = 0; attempt < 280; attempt += 1) {
    const [anchorXRatio, anchorYRatio] = anchorZones[Math.floor(Math.random() * anchorZones.length)];
    const x = clamp(
      anchorXRatio * viewportWidth + randomBetween(-viewportWidth * 0.18, viewportWidth * 0.18),
      padding,
      maxX
    );
    const y = clamp(
      anchorYRatio * viewportHeight + randomBetween(-viewportHeight * 0.18, viewportHeight * 0.18),
      padding,
      maxY
    );

    const candidate = { x, y, width, height };
    const overlaps = state.photos.some((photo) => rectsOverlap(candidate, {
      x: photo.positionX,
      y: photo.positionY,
      width: photo.width,
      height: photo.height,
    }));

    if (!overlaps) {
      return {
        positionX: x,
        positionY: y,
        rotation: randomBetween(-8, 8),
        scale: 1,
        depth: randomBetween(-18, 45),
      };
    }
  }

  return {
    positionX: randomBetween(padding, Math.max(padding, maxX)),
    positionY: randomBetween(padding, Math.max(padding, maxY)),
    rotation: randomBetween(-8, 8),
    scale: 1,
    depth: randomBetween(-18, 45),
  };
}

function readImageDimensions(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const aspectRatio = image.naturalWidth / image.naturalHeight;
      const width = clamp(window.innerWidth < 640 ? 110 : 170, 90, 210);
      const height = width / aspectRatio;
      resolve({ width, height });
    };
    image.onerror = reject;
    image.src = url;
  });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('No se pudo leer la imagen'));
    reader.readAsDataURL(file);
  });
}

function openUploadModal(files) {
  state.pendingFiles = Array.from(files || []).filter((file) => file && file.type.startsWith('image/'));

  if (!state.pendingFiles.length) {
    return;
  }

  uploadFileCount.textContent = state.pendingFiles.length === 1 ? '1' : `${state.pendingFiles.length}`;
  uploadMessageInput.value = '';
  uploadModal.classList.add('is-open');
  uploadModal.setAttribute('aria-hidden', 'false');
  uploadMessageInput.focus();
}

function closeUploadModal() {
  uploadModal.classList.remove('is-open');
  uploadModal.setAttribute('aria-hidden', 'true');
  uploadForm.reset();
  state.pendingFiles = [];
  fileInput.value = '';
}

async function addPhotosFromSelection(files, message = '') {
  const acceptedFiles = Array.from(files).filter((file) => file && file.type.startsWith('image/'));

  if (!acceptedFiles.length) {
    return;
  }

  for (const file of acceptedFiles) {
    const dataUrl = await fileToDataUrl(file);
    const dimensions = await readImageDimensions(dataUrl);
    const position = generateStablePositionForNewPhoto({
      width: dimensions.width,
      height: dimensions.height,
    });

    const photo = buildPhotoRecord({
      id: createId('upload'),
      url: dataUrl,
      caption: message.trim() || 'Sin mensaje.',
      positionX: position.positionX,
      positionY: position.positionY,
      rotation: position.rotation,
      scale: position.scale,
      depth: position.depth,
      width: dimensions.width,
      height: dimensions.height,
      uploadedBy: 'you',
      uploadedAt: new Date().toISOString(),
      isNew: true,
    });

    photo.zIndex = state.photos.length + 1;
    state.photos.push(photo);
  }

  savePhotos();
  renderPhotoCards();
}

function openLightbox(photo) {
  state.activePhotoId = photo.id;
  lightboxImage.src = photo.imageUrl;
  lightboxDate.textContent = `Subido: ${formatDate(photo.uploadedAt)}`;
  lightboxMessage.textContent = photo.caption || 'Sin mensaje.';
  lightbox.classList.add('is-open');
  lightbox.setAttribute('aria-hidden', 'false');
}

function closeLightbox() {
  state.activePhotoId = null;
  lightbox.classList.remove('is-open');
  lightbox.setAttribute('aria-hidden', 'true');
  lightboxImage.src = '';
  lightboxDate.textContent = '';
  lightboxMessage.textContent = '';
}

function deleteActivePhoto() {
  if (!state.activePhotoId) {
    return;
  }

  state.photos = state.photos.filter((photo) => photo.id !== state.activePhotoId);
  savePhotos();
  closeLightbox();
  renderPhotoCards();
}

function downloadActivePhoto() {
  if (!state.activePhotoId) {
    return;
  }

  const photo = state.photos.find((item) => item.id === state.activePhotoId);
  if (!photo) {
    return;
  }

  const anchor = document.createElement('a');
  anchor.href = photo.imageUrl;
  anchor.download = `archive-photo-${photo.id}.jpg`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

addPhotosBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (event) => {
  const { files } = event.target;
  openUploadModal(files);
});

uploadForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!state.pendingFiles.length) {
    return;
  }

  const message = uploadMessageInput.value.trim();
  await addPhotosFromSelection(state.pendingFiles, message);
  closeUploadModal();
});

uploadClose.addEventListener('click', closeUploadModal);
uploadCancel.addEventListener('click', closeUploadModal);

uploadModal.addEventListener('click', (event) => {
  if (event.target === uploadModal || event.target.dataset.closeUpload === 'true') {
    closeUploadModal();
  }
});

lightboxClose.addEventListener('click', closeLightbox);
lightboxDownload.addEventListener('click', downloadActivePhoto);
lightboxDelete.addEventListener('click', deleteActivePhoto);
lightbox.addEventListener('click', (event) => {
  if (event.target === lightbox || event.target.dataset.close === 'true') {
    closeLightbox();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if (lightbox.classList.contains('is-open')) {
      closeLightbox();
    }

    if (uploadModal.classList.contains('is-open')) {
      closeUploadModal();
    }
  }
});

window.addEventListener('resize', () => {
  if (!state.photos.length) {
    return;
  }

  const currentPhotos = [...state.photos];
  state.photos = currentPhotos.map((photo) => ({
    ...photo,
    positionX: clamp(photo.positionX, 12, Math.max(12, getViewport().width - photo.width - 12)),
    positionY: clamp(photo.positionY, 12, Math.max(12, getViewport().height - photo.height - 12)),
  }));
  renderPhotoCards();
});

state.photos = loadPhotos();
renderPhotoCards();
