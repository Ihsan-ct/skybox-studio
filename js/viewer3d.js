"use strict";
window.Viewer3D = (function () {
  let scene, camera, renderer;
  const faceMeshes = {};
  const faceTextures = {};
  const faceCanvases = {};
  let baseplateGroup, characterGroup, seamLinesGroup;
  let isInitialized = false;
  let isVisible = false;
  let renderRequested = false;
  let containerEl = null;

  // Kontrol kamera kustom (A3)
  let camYaw = 0;
  let camPitch = 0;
  let velYaw = 0;
  let velPitch = 0;
  let isInertiaRunning = false;
  const activePointers = new Map();
  let lastPinchDist = null;
  let lastX = 0, lastY = 0;
  let fovListener = null;

  const MAX_PITCH = 89 * Math.PI / 180;
  const D = 200;

  function updateCameraOrientation() {
    const cp = Math.cos(camPitch);
    const targetX = Math.sin(camYaw) * cp;
    const targetY = Math.sin(camPitch);
    const targetZ = -Math.cos(camYaw) * cp;
    camera.lookAt(targetX, targetY, targetZ);
  }

  function requestRender() {
    if (!renderRequested && isVisible && !document.hidden) {
      renderRequested = true;
      requestAnimationFrame(() => {
        renderRequested = false;
        if (renderer && scene && camera) {
          renderer.render(scene, camera);
        }
      });
    }
  }

  function startInertia() {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      velYaw = 0; velPitch = 0;
      return;
    }
    if (isInertiaRunning) return;
    isInertiaRunning = true;

    function step() {
      if (!isInertiaRunning) return;
      if (Math.abs(velYaw) < 0.0001 && Math.abs(velPitch) < 0.0001) {
        velYaw = 0; velPitch = 0;
        isInertiaRunning = false;
        return;
      }
      camYaw += velYaw;
      camPitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, camPitch + velPitch));
      velYaw *= 0.92;
      velPitch *= 0.92;
      updateCameraOrientation();
      requestRender();
      requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function init(container) {
    if (isInitialized) {
      isVisible = true;
      onResize();
      requestRender();
      return;
    }
    containerEl = container;
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Plane sedikit dioverlap 0.2% agar tidak ada retakan sub-pixel rasterisasi
    const planeGeo = new THREE.PlaneGeometry(D * 1.002, D * 1.002);

    // Konfigurasi sudut pandang PRD 5.1 & A1: Up [PI/2, 0, 0], Dn [-PI/2, 0, 0]
    const configs = [
      { k: 'Ft', pos: [0, 0, -D / 2], rot: [0, 0, 0] },
      { k: 'Bk', pos: [0, 0, D / 2], rot: [0, Math.PI, 0] },
      { k: 'Lf', pos: [-D / 2, 0, 0], rot: [0, Math.PI / 2, 0] },
      { k: 'Rt', pos: [D / 2, 0, 0], rot: [0, -Math.PI / 2, 0] },
      { k: 'Up', pos: [0, D / 2, 0], rot: [Math.PI / 2, 0, 0] },
      { k: 'Dn', pos: [0, -D / 2, 0], rot: [-Math.PI / 2, 0, 0] }
    ];

    configs.forEach(c => {
      const c2d = document.createElement('canvas');
      c2d.width = 512; c2d.height = 512;
      const ctx = c2d.getContext('2d');
      ctx.fillStyle = '#1b1e27'; ctx.fillRect(0, 0, 512, 512);
      faceCanvases[c.k] = c2d;

      const tex = new THREE.CanvasTexture(c2d);
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.generateMipmaps = false;
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      faceTextures[c.k] = tex;

      const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.FrontSide });
      const mesh = new THREE.Mesh(planeGeo, mat);
      mesh.position.set(...c.pos);
      mesh.rotation.set(...c.rot);
      scene.add(mesh);
      faceMeshes[c.k] = mesh;
    });

    // Wireframe Seam yang benar (C3: EdgesGeometry kubus 12 garis tepi)
    const seamBox = new THREE.BoxGeometry(D, D, D);
    const seamEdges = new THREE.EdgesGeometry(seamBox);
    const seamLineMat = new THREE.LineBasicMaterial({ color: 0x39ff14, linewidth: 2 });
    seamLinesGroup = new THREE.LineSegments(seamEdges, seamLineMat);
    seamLinesGroup.visible = false;
    scene.add(seamLinesGroup);

    // Baseplate Roblox
    baseplateGroup = new THREE.Group();
    const grid = new THREE.GridHelper(80, 40, 0x4a90d9, 0x343a4b);
    grid.position.y = -20;
    baseplateGroup.add(grid);
    scene.add(baseplateGroup);

    // Karakter Dummy Roblox Blocky 3D
    characterGroup = new THREE.Group();
    const matHead = new THREE.MeshLambertMaterial({ color: 0xffcd34 });
    const matTorso = new THREE.MeshLambertMaterial({ color: 0x0074d9 });
    const matArm = new THREE.MeshLambertMaterial({ color: 0xffcd34 });
    const matLeg = new THREE.MeshLambertMaterial({ color: 0x2ecc40 });

    const head = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), matHead); head.position.y = 4.6;
    const torso = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 1), matTorso); torso.position.y = 3;
    const armL = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), matArm); armL.position.set(-1.5, 3, 0);
    const armR = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), matArm); armR.position.set(1.5, 3, 0);
    const legL = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), matLeg); legL.position.set(-0.5, 1, 0);
    const legR = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), matLeg); legR.position.set(0.5, 1, 0);

    characterGroup.add(head, torso, armL, armR, legL, legR);
    characterGroup.position.set(0, -20, -10);
    characterGroup.scale.set(1.5, 1.5, 1.5);
    scene.add(characterGroup);

    const ambLight = new THREE.AmbientLight(0xffffff, 0.85);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.55);
    dirLight.position.set(5, 15, 10);
    scene.add(ambLight, dirLight);

    // Kontrol pointer drag & pinch kustom (A3)
    container.addEventListener('pointerdown', e => {
      container.setPointerCapture(e.pointerId);
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      velYaw = 0; velPitch = 0; isInertiaRunning = false;
      lastX = e.clientX; lastY = e.clientY;
      if (activePointers.size === 2) {
        const pts = Array.from(activePointers.values());
        lastPinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      }
    });

    container.addEventListener('pointermove', e => {
      if (!activePointers.has(e.pointerId)) return;
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (activePointers.size === 1) {
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        lastX = e.clientX; lastY = e.clientY;

        const sens = (camera.fov / 75) * 0.0035;
        camYaw -= dx * sens;
        camPitch += dy * sens;
        camPitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, camPitch));

        velYaw = -dx * sens * 0.8;
        velPitch = dy * sens * 0.8;

        updateCameraOrientation();
        requestRender();
      } else if (activePointers.size === 2) {
        const pts = Array.from(activePointers.values());
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        if (lastPinchDist !== null && lastPinchDist > 0) {
          const delta = (lastPinchDist - dist) * 0.15;
          setFov(camera.fov + delta);
        }
        lastPinchDist = dist;
      }
    });

    function onPointerEnd(e) {
      if (activePointers.has(e.pointerId)) {
        activePointers.delete(e.pointerId);
        try { container.releasePointerCapture(e.pointerId); } catch (_) {}
      }
      if (activePointers.size === 0) {
        lastPinchDist = null;
        startInertia();
      } else if (activePointers.size === 1) {
        const pt = Array.from(activePointers.values())[0];
        lastX = pt.x; lastY = pt.y;
        lastPinchDist = null;
      }
    }

    container.addEventListener('pointerup', onPointerEnd);
    container.addEventListener('pointercancel', onPointerEnd);

    container.addEventListener('wheel', e => {
      e.preventDefault();
      const delta = Math.sign(e.deltaY) * 3;
      setFov(camera.fov + delta);
    }, { passive: false });

    // ResizeObserver untuk responsif tanpa hardcoded id (A5)
    const ro = new ResizeObserver(() => {
      onResize();
    });
    ro.observe(container);

    // Tangani visibility tab browser (A5)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        isInertiaRunning = false;
      } else if (isVisible) {
        requestRender();
      }
    });

    // Tangani WebGL context lost & restored pada canvas three.js (A5)
    renderer.domElement.addEventListener('webglcontextlost', e => {
      e.preventDefault();
      if (window.MainApp && window.MainApp.addBanner) {
        window.MainApp.addBanner('warn', 'Konteks grafis 3D hilang. Memulihkan...');
      }
    });
    renderer.domElement.addEventListener('webglcontextrestored', () => {
      if (window.MainApp && window.MainApp.addBanner) {
        window.MainApp.addBanner('info', 'Konteks grafis 3D dipulihkan.');
      }
      requestRender();
    });

    camYaw = 0; camPitch = 0;
    updateCameraOrientation();
    isVisible = true;
    isInitialized = true;
    requestRender();
  }

  function onResize() {
    if (!containerEl || !renderer || !camera) return;
    const w = containerEl.clientWidth;
    const h = containerEl.clientHeight;
    if (w === 0 || h === 0) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    requestRender();
  }

  // A2: Perbarui isi kanvas yang sudah ada tanpa alokasi CanvasTexture baru
  function updateFaceTexture(faceKey, sourceCanvas) {
    const c2d = faceCanvases[faceKey];
    const tex = faceTextures[faceKey];
    if (!c2d || !tex) return;

    if (c2d.width !== sourceCanvas.width || c2d.height !== sourceCanvas.height) {
      c2d.width = sourceCanvas.width;
      c2d.height = sourceCanvas.height;
    }
    const ctx = c2d.getContext('2d');
    ctx.drawImage(sourceCanvas, 0, 0);
    tex.needsUpdate = true;
    requestRender();
  }

  function setBaseplate(show) {
    if (baseplateGroup) { baseplateGroup.visible = show; requestRender(); }
  }
  function setCharacter(show) {
    if (characterGroup) { characterGroup.visible = show; requestRender(); }
  }
  function setWireframe(show) {
    if (seamLinesGroup) { seamLinesGroup.visible = show; requestRender(); }
  }
  function setFov(fov) {
    if (!camera) return;
    const clamped = Math.max(40, Math.min(100, fov));
    camera.fov = clamped;
    camera.updateProjectionMatrix();
    if (fovListener) fovListener(clamped);
    requestRender();
  }

  function setVisible(val) {
    isVisible = val;
    if (val) {
      onResize();
      requestRender();
    } else {
      isInertiaRunning = false;
    }
  }

  return {
    init, onResize, updateFaceTexture, setBaseplate, setCharacter, setWireframe, setFov, setVisible, requestRender,
    onFovChange: fn => { fovListener = fn; }
  };
})();