
const map = document.getElementById("map");
const viewport = document.getElementById("map-viewport");
const points = [...document.querySelectorAll(".point")];
const cityButtons = [...document.querySelectorAll(".city-button")];

const popupOverlay = document.getElementById("popup-overlay");
const popupImage = document.getElementById("popup-image");
const popupText = document.getElementById("popup-text");
const popupClose = document.getElementById("popup-close");

const guideOverlay = document.getElementById("guide-overlay");
const openGuide = document.getElementById("open-guide");
const guideClose = document.getElementById("guide-close");
const guideStart = document.getElementById("guide-start");

const zoomInButton = document.getElementById("zoom-in");
const zoomOutButton = document.getElementById("zoom-out");
const zoomResetButton = document.getElementById("zoom-reset");
const zoomLevel = document.getElementById("zoom-level");

const graphToggle = document.getElementById("graph-toggle");
const graphOverlay = document.getElementById("graph-overlay");

const pointClickSound = new Audio("Sound.mp3");
pointClickSound.preload = "auto";
pointClickSound.volume = 0.15;

function playPointSound() {
  pointClickSound.currentTime = 0;
  pointClickSound.play().catch(() => {});
}

let mapPin = document.getElementById("map-pin-cursor");

if (!mapPin) {
  mapPin = document.createElement("div");
  mapPin.id = "map-pin-cursor";
  mapPin.className = "map-pin-cursor";
  mapPin.setAttribute("aria-hidden", "true");
  document.body.appendChild(mapPin);
}

const MAP_WIDTH = 1650;
const MAP_HEIGHT = 1250;
const MIN_ZOOM = 0.35;
const MAX_ZOOM = 2.5;

const cityByImage = {
  "bookone.png": "sel",
  "booktwo.png": "flr",
  "collage.png": "stl",
  "didot.png": "stl",
  "diptyque.png": "sel",
  "gustavklimt.png": "nyc",
  "marbledvase.png": "nyc",
  "neue.png": "stl",
  "santospirto.png": "flr",
  "website1.png": "flr",
  "website2.png": "stl",
  "website3.png": "flr",
  "website4.png": "nyc",
  "website5.png": "sel",
  "oyster.png": "nyc"
};

points.forEach(point => {
  const filename = point.querySelector("img")
    ?.getAttribute("src")
    ?.split("/")
    .pop()
    ?.toLowerCase();

  if (cityByImage[filename]) {
    point.dataset.city = cityByImage[filename];
  }
});

let zoom = 1;
let panX = 0;
let panY = 0;
let highestZ = 10;
let activeAction = null;
let lastFocused = null;
let backgroundDrag = null;
let pinchState = null;
let activeCity = "all";
let mouseX = 0;
let mouseY = 0;
let mouseInside = false;

const touchPoints = new Map();

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function hidePin() {
  mapPin.classList.remove("visible");
}

function updatePin(event) {
  if (event.pointerType && event.pointerType !== "mouse") return;

  mouseX = event.clientX;
  mouseY = event.clientY;
  mouseInside = true;

  mapPin.style.left = `${mouseX}px`;
  mapPin.style.top = `${mouseY}px`;

  const target = document.elementFromPoint(mouseX, mouseY);
  const overMap = Boolean(target?.closest(".map-viewport"));
  const overHandle = Boolean(target?.closest(".resize-handle"));

  const modalOpen =
    popupOverlay.classList.contains("active") ||
    guideOverlay.classList.contains("active");

  mapPin.classList.toggle(
    "visible",
    mouseInside &&
    overMap &&
    !overHandle &&
    !modalOpen &&
    !activeAction &&
    !backgroundDrag &&
    !pinchState
  );
}

function refreshPin() {
  if (!mouseInside) return;

  updatePin({
    clientX: mouseX,
    clientY: mouseY,
    pointerType: "mouse"
  });
}

document.addEventListener("pointermove", updatePin);

document.documentElement.addEventListener("pointerleave", () => {
  mouseInside = false;
  hidePin();
});

viewport.addEventListener("pointerenter", updatePin);

function renderMap() {
  map.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;

  zoomLevel.textContent = `${Math.round(zoom * 100)}%`;

  viewport.style.backgroundPosition =
    `${panX}px ${panY}px, ${panX}px ${panY}px, ${panX}px ${panY}px, ${panX}px ${panY}px`;

  viewport.style.backgroundSize =
    `${240 * zoom}px ${240 * zoom}px,
     ${240 * zoom}px ${240 * zoom}px,
     ${24 * zoom}px ${24 * zoom}px,
     ${24 * zoom}px ${24 * zoom}px`;
}

function resetView() {
  zoom = clamp(
    Math.min(
      (viewport.clientWidth - 80) / MAP_WIDTH,
      (viewport.clientHeight - 100) / MAP_HEIGHT,
      1
    ),
    MIN_ZOOM,
    MAX_ZOOM
  );

  panX = (viewport.clientWidth - MAP_WIDTH * zoom) / 2;
  panY = (viewport.clientHeight - MAP_HEIGHT * zoom) / 2;

  renderMap();
}

function zoomAt(nextZoom, clientX, clientY) {
  const newZoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
  const rect = viewport.getBoundingClientRect();

  const x = clientX - rect.left;
  const y = clientY - rect.top;

  const mapX = (x - panX) / zoom;
  const mapY = (y - panY) / zoom;

  panX = x - mapX * newZoom;
  panY = y - mapY * newZoom;
  zoom = newZoom;

  renderMap();
}

function zoomFromCenter(factor) {
  const rect = viewport.getBoundingClientRect();

  zoomAt(
    zoom * factor,
    rect.left + rect.width / 2,
    rect.top + rect.height / 2
  );
}

zoomInButton.addEventListener("click", () => zoomFromCenter(1.2));
zoomOutButton.addEventListener("click", () => zoomFromCenter(1 / 1.2));
zoomResetButton.addEventListener("click", resetView);

viewport.addEventListener("wheel", event => {
  if (
    popupOverlay.classList.contains("active") ||
    guideOverlay.classList.contains("active")
  ) return;

  event.preventDefault();

  if (event.ctrlKey || event.metaKey) {
    zoomAt(
      zoom * Math.exp(-event.deltaY * 0.008),
      event.clientX,
      event.clientY
    );
  } else {
    panX -= event.deltaX;
    panY -= event.deltaY;
    renderMap();
  }
}, { passive: false });

function positionPoint(point, x, y) {
  point.style.left = `${x}px`;
  point.style.top = `${y}px`;
}

function bringForward(point) {
  highestZ += 1;
  point.style.zIndex = highestZ;
}

function createResizeHandles(point) {
  const wrap = point.querySelector(".image-wrap");

  ["nw", "ne", "sw", "se"].forEach(corner => {
    const handle = document.createElement("span");
    handle.className = `resize-handle ${corner}`;
    handle.dataset.corner = corner;
    wrap.appendChild(handle);
  });
}

function illuminatePoint(point) {
  const image = point.querySelector("img");
  if (!image) return;

  point.classList.remove("illuminating", "oyster-glow");
  void point.offsetWidth;

  if (image.src.toLowerCase().includes("oyster")) {
    point.classList.add("oyster-glow");
  }

  point.classList.add("illuminating");
}

function openPopup(point) {
  const image = point.querySelector("img");
  const info = point.querySelector(".info");

  if (!image || !info) return;

  playPointSound();

  lastFocused = document.activeElement;

  popupImage.replaceChildren(image.cloneNode(true));
  popupText.innerHTML = info.innerHTML;

  const location = popupText.querySelector(".info-location");

  if (location) {
    const city = point.dataset.city;
    const parts = location.textContent.split("·").map(part => part.trim());

    if (parts.length > 1) {
      parts.shift();
      location.textContent = parts.join(" · ");
    } else {
      location.textContent = "";
    }

    const dot = document.createElement("span");
    dot.className = `popup-city-dot ${city}-dot`;
    dot.setAttribute("aria-label", {
      nyc: "New York",
      stl: "St. Louis",
      flr: "Florence",
      sel: "Seoul"
    }[city] || "");

    location.prepend(dot);
  }

  illuminatePoint(point);

  popupOverlay.classList.add("active");
  popupOverlay.setAttribute("aria-hidden", "false");

  hidePin();
  popupClose.focus();
}

function closePopup() {
  popupOverlay.classList.remove("active");
  popupOverlay.setAttribute("aria-hidden", "true");
  lastFocused?.focus?.();
  refreshPin();
}

function showGuide() {
  lastFocused = document.activeElement;

  guideOverlay.classList.add("active");
  guideOverlay.setAttribute("aria-hidden", "false");

  hidePin();
  guideClose.focus();
}

function closeGuide() {
  guideOverlay.classList.remove("active");
  guideOverlay.setAttribute("aria-hidden", "true");
  lastFocused?.focus?.();
  refreshPin();
}

function beginPointAction(event, point) {
  if (event.pointerType === "mouse" && event.button !== 0) return;

  const handle = event.target.closest(".resize-handle");
  const wrap = point.querySelector(".image-wrap");
  const image = wrap.querySelector("img");
  const width = wrap.offsetWidth;

  const ratio = image.naturalWidth && image.naturalHeight
    ? image.naturalWidth / image.naturalHeight
    : width / Math.max(1, wrap.offsetHeight);

  bringForward(point);

  activeAction = {
    type: handle ? "resize" : "image",
    point,
    wrap,
    pointerId: event.pointerId,
    corner: handle?.dataset.corner,
    startX: event.clientX,
    startY: event.clientY,
    initialX: point.offsetLeft,
    initialY: point.offsetTop,
    initialWidth: width,
    ratio,
    moved: false
  };

  hidePin();
  point.setPointerCapture(event.pointerId);
  point.classList.add("dragging");

  event.preventDefault();
  event.stopPropagation();
}

function movePointAction(event) {
  if (!activeAction || activeAction.pointerId !== event.pointerId) return;

  const action = activeAction;

  const dx = (event.clientX - action.startX) / zoom;
  const dy = (event.clientY - action.startY) / zoom;

  if (Math.hypot(dx, dy) > 4) action.moved = true;
  if (!action.moved) return;

  if (action.type === "image") {
    positionPoint(
      action.point,
      action.initialX + dx,
      action.initialY + dy
    );
    return;
  }

  const corner = action.corner;
  const xDirection = corner.includes("e") ? 1 : -1;
  const yDirection = corner.includes("s") ? 1 : -1;

  const horizontalChange = dx * xDirection;
  const verticalChange = dy * yDirection * action.ratio;

  const change = Math.abs(horizontalChange) >= Math.abs(verticalChange)
    ? horizontalChange
    : verticalChange;

  const width = clamp(action.initialWidth + change, 45, 500);
  const oldHeight = action.initialWidth / action.ratio;
  const newHeight = width / action.ratio;

  let x = action.initialX;
  let y = action.initialY;

  if (corner.includes("w")) x += action.initialWidth - width;
  if (corner.includes("n")) y += oldHeight - newHeight;

  action.wrap.style.width = `${width}px`;
  positionPoint(action.point, x, y);
}

function finishPointAction(event) {
  if (!activeAction || activeAction.pointerId !== event.pointerId) return;

  const action = activeAction;

  action.point.classList.remove("dragging");

  if (action.point.hasPointerCapture(event.pointerId)) {
    action.point.releasePointerCapture(event.pointerId);
  }

  activeAction = null;

  if (
    !action.moved &&
    action.type === "image" &&
    event.type === "pointerup"
  ) {
    openPopup(action.point);
  } else {
    updatePin(event);
  }
}

points.forEach(point => {
  createResizeHandles(point);

  point.tabIndex = 0;
  point.setAttribute("role", "button");

  point.setAttribute(
    "aria-label",
    point.querySelector(".info h2")?.textContent || "Open image"
  );

  point.addEventListener("pointerdown", event => {
    beginPointAction(event, point);
  });

  point.addEventListener("pointermove", movePointAction);
  point.addEventListener("pointerup", finishPointAction);
  point.addEventListener("pointercancel", finishPointAction);

  point.addEventListener("keydown", event => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openPopup(point);
    }
  });
});

function arrangeCity(city) {
  points.forEach(point => {
    const visible = city === "all" || point.dataset.city === city;

    point.classList.toggle("filtered-out", !visible);
    point.style.display = visible ? "" : "none";
    point.tabIndex = visible ? 0 : -1;
  });

  refreshPin();
}

cityButtons.forEach(button => {
  button.addEventListener("click", () => {
    activeCity = button.dataset.city;

    cityButtons.forEach(item => {
      const selected = item === button;

      item.classList.toggle("active", selected);
      item.setAttribute("aria-pressed", String(selected));
    });

    arrangeCity(activeCity);
  });
});

viewport.addEventListener("pointerdown", event => {
  if (event.target.closest(".point")) return;
  if (event.pointerType === "mouse" && event.button !== 0) return;

  if (event.pointerType === "touch") {
    touchPoints.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY
    });

    if (touchPoints.size === 2) {
      const touches = [...touchPoints.values()];

      pinchState = {
        distance: Math.hypot(
          touches[1].x - touches[0].x,
          touches[1].y - touches[0].y
        ),
        zoom
      };

      backgroundDrag = null;
    }
  }

  if (!pinchState) {
    backgroundDrag = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      panX,
      panY
    };
  }

  hidePin();
  viewport.setPointerCapture(event.pointerId);
  viewport.classList.add("panning");
});

viewport.addEventListener("pointermove", event => {
  if (
    event.pointerType === "touch" &&
    touchPoints.has(event.pointerId)
  ) {
    touchPoints.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY
    });
  }

  if (pinchState && touchPoints.size === 2) {
    const touches = [...touchPoints.values()];

    const distance = Math.hypot(
      touches[1].x - touches[0].x,
      touches[1].y - touches[0].y
    );

    const centerX = (touches[0].x + touches[1].x) / 2;
    const centerY = (touches[0].y + touches[1].y) / 2;

    zoomAt(
      pinchState.zoom * distance / pinchState.distance,
      centerX,
      centerY
    );

    return;
  }

  if (
    !backgroundDrag ||
    backgroundDrag.pointerId !== event.pointerId
  ) return;

  panX = backgroundDrag.panX + event.clientX - backgroundDrag.x;
  panY = backgroundDrag.panY + event.clientY - backgroundDrag.y;

  renderMap();
});

function finishBackgroundAction(event) {
  touchPoints.delete(event.pointerId);

  if (touchPoints.size < 2) pinchState = null;

  if (backgroundDrag?.pointerId === event.pointerId) {
    backgroundDrag = null;
  }

  if (viewport.hasPointerCapture(event.pointerId)) {
    viewport.releasePointerCapture(event.pointerId);
  }

  if (!backgroundDrag && !pinchState) {
    viewport.classList.remove("panning");
  }

  updatePin(event);
}

viewport.addEventListener("pointerup", finishBackgroundAction);
viewport.addEventListener("pointercancel", finishBackgroundAction);

popupClose.addEventListener("click", closePopup);

popupOverlay.addEventListener("click", event => {
  if (event.target === popupOverlay) closePopup();
});

openGuide.addEventListener("click", showGuide);
guideClose.addEventListener("click", closeGuide);
guideStart.addEventListener("click", closeGuide);

guideOverlay.addEventListener("click", event => {
  if (event.target === guideOverlay) closeGuide();
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    if (popupOverlay.classList.contains("active")) {
      closePopup();
    }

    if (guideOverlay.classList.contains("active")) {
      closeGuide();
    }
  }
});

graphToggle.addEventListener("click", () => {
  const isVisible = graphOverlay.classList.toggle("visible");

  graphToggle.classList.toggle("active", isVisible);
  graphToggle.setAttribute("aria-pressed", String(isVisible));
  graphToggle.setAttribute(
    "aria-label",
    isVisible ? "Hide graph" : "Show graph"
  );
  graphToggle.title = isVisible ? "Hide graph" : "Show graph";
  graphOverlay.setAttribute("aria-hidden", String(!isVisible));
});

window.addEventListener("load", () => {
  resetView();
  arrangeCity(activeCity);
});

window.addEventListener("resize", resetView);
