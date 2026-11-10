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
  let camCb = null;   // dipanggil tiap render: readout koordinat kamera (HUD Studio)

  let camYaw = 0;
  let camPitch = -0.12;
  const orbitFocus = new THREE.Vector3(0, -17.5, 0);   // fokus: karakter/spawn
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
    camera.lookAt(
      orbitFocus.x + Math.sin(camYaw) * cp * 8,
      orbitFocus.y + Math.sin(camPitch) * 8,
      orbitFocus.z - Math.cos(camYaw) * cp * 8
    );
  }

  function requestRender() {
    if (!renderRequested && isVisible && !document.hidden) {
      renderRequested = true;
      requestAnimationFrame(() => {
        renderRequested = false;
        if (renderer && scene && camera) {
          renderer.render(scene, camera);
          if (camCb) camCb(camera.position, camera.fov);
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
    camera.position.set(0, -10, 22);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const planeGeo = new THREE.PlaneGeometry(D, D);

    // Konfigurasi sudut pandang terverifikasi: Up [PI/2, 0, 0], Dn [-PI/2, 0, 0]
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

      const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.FrontSide, depthWrite: false });
      const mesh = new THREE.Mesh(planeGeo, mat);
      mesh.position.set(...c.pos);
      mesh.rotation.set(...c.rot);
      scene.add(mesh);
      faceMeshes[c.k] = mesh;
    });

    // Wireframe Seam (depthTest: false dan renderOrder: 999)
    const seamBox = new THREE.BoxGeometry(D, D, D);
    const seamEdges = new THREE.EdgesGeometry(seamBox);
    const seamLineMat = new THREE.LineBasicMaterial({
      color: 0x39ff14,
      linewidth: 2,
      depthTest: false,
      depthWrite: false
    });
    seamLinesGroup = new THREE.LineSegments(seamEdges, seamLineMat);
    seamLinesGroup.renderOrder = 999;
    seamLinesGroup.visible = false;
    scene.add(seamLinesGroup);

    // Baseplate Roblox klasik (plat abu-abu bertekstur stud-grid) + SpawnLocation
    baseplateGroup = new THREE.Group();

    function makeStudTexture() {
      const c = document.createElement('canvas'); c.width = c.height = 256;
      const g = c.getContext('2d');
      g.fillStyle = '#6f7378'; g.fillRect(0, 0, 256, 256);
      for (let yy = 0; yy < 8; yy++) {
        for (let xx = 0; xx < 8; xx++) {
          const cx = xx * 32 + 16, cy = yy * 32 + 16;
          g.fillStyle = '#7d8187';
          g.beginPath(); g.arc(cx, cy, 11, 0, Math.PI * 2); g.fill();
          g.strokeStyle = 'rgba(0,0,0,0.22)'; g.lineWidth = 2;
          g.beginPath(); g.arc(cx, cy, 11, 0, Math.PI * 2); g.stroke();
          g.strokeStyle = 'rgba(255,255,255,0.10)';
          g.beginPath(); g.arc(cx, cy - 1, 10, 0, Math.PI * 2); g.stroke();
        }
      }
      g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 2;
      for (let i = 0; i <= 8; i++) {
        g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, 256); g.stroke();
        g.beginPath(); g.moveTo(0, i * 32); g.lineTo(256, i * 32); g.stroke();
      }
      const t = new THREE.CanvasTexture(c);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(48, 48);
      return t;
    }

    function makeSpawnTexture() {
      const c = document.createElement('canvas'); c.width = c.height = 256;
      const g = c.getContext('2d');
      g.fillStyle = '#9ea1a6'; g.fillRect(0, 0, 256, 256);
      g.fillStyle = '#8b8e94'; g.fillRect(10, 10, 236, 236);
      g.strokeStyle = '#5c5f64'; g.lineWidth = 8;
      g.strokeRect(14, 14, 228, 228);
      g.fillStyle = '#767a80';
      g.beginPath(); g.arc(128, 128, 62, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#5c5f64'; g.lineWidth = 6;
      g.beginPath(); g.arc(128, 128, 62, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#4d5055';
      for (let k = 0; k < 4; k++) {
        const a = k * Math.PI / 2 + Math.PI / 4;
        const cx = 128 + Math.cos(a) * 38, cy = 128 + Math.sin(a) * 38;
        g.save(); g.translate(cx, cy); g.rotate(a);
        g.beginPath(); g.moveTo(10, 0); g.lineTo(-6, -9); g.lineTo(-6, 9); g.closePath(); g.fill();
        g.restore();
      }
      return new THREE.CanvasTexture(c);
    }

    const plateTex = makeStudTexture();
    const plateMats = [
      new THREE.MeshLambertMaterial({ color: 0x5b5f66 }),
      new THREE.MeshLambertMaterial({ color: 0x5b5f66 }),
      new THREE.MeshLambertMaterial({ map: plateTex }),
      new THREE.MeshLambertMaterial({ color: 0x4a4d52 }),
      new THREE.MeshLambertMaterial({ color: 0x5b5f66 }),
      new THREE.MeshLambertMaterial({ color: 0x5b5f66 })
    ];
    const plate = new THREE.Mesh(new THREE.BoxGeometry(190, 4, 190), plateMats);
    plate.position.set(0, -22, 0);
    plate.receiveShadow = true;
    baseplateGroup.add(plate);

    const spawnTex = makeSpawnTexture();
    const spawn = new THREE.Mesh(
      new THREE.BoxGeometry(12, 1.2, 12),
      [
        new THREE.MeshLambertMaterial({ color: 0x8b8e94 }),
        new THREE.MeshLambertMaterial({ color: 0x8b8e94 }),
        new THREE.MeshLambertMaterial({ map: spawnTex }),
        new THREE.MeshLambertMaterial({ color: 0x6f7278 }),
        new THREE.MeshLambertMaterial({ color: 0x8b8e94 }),
        new THREE.MeshLambertMaterial({ color: 0x8b8e94 })
      ]
    );
    spawn.position.set(0, -21.4, 0);
    spawn.receiveShadow = true;
    baseplateGroup.add(spawn);

    scene.add(baseplateGroup);

    // Karakter noob klasik (R6) berdiri di spawn, lengkap wajah & bayangan
    characterGroup = new THREE.Group();

    function makeFaceTexture() {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const g = c.getContext('2d');
      g.fillStyle = '#f5cd30'; g.fillRect(0, 0, 128, 128);
      g.fillStyle = '#1b1b1b';
      g.beginPath(); g.ellipse(43, 52, 9, 13, 0, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.ellipse(85, 52, 9, 13, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#1b1b1b'; g.lineWidth = 7; g.lineCap = 'round';
      g.beginPath(); g.arc(64, 66, 30, 0.35 * Math.PI, 0.65 * Math.PI); g.stroke();
      return new THREE.CanvasTexture(c);
    }

    const noob = {
      head: 0xf5cd30, torso: 0x0d69ac, arm: 0xf5cd30, leg: 0xa4bd47
    };
    const headMats = [
      new THREE.MeshLambertMaterial({ color: noob.head }),
      new THREE.MeshLambertMaterial({ color: noob.head }),
      new THREE.MeshLambertMaterial({ color: noob.head }),
      new THREE.MeshLambertMaterial({ color: noob.head }),
      new THREE.MeshLambertMaterial({ map: makeFaceTexture() }),
      new THREE.MeshLambertMaterial({ color: noob.head })
    ];
    const head = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), headMats);
    head.position.y = 5.6; head.castShadow = true;
    const torso = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 1), new THREE.MeshLambertMaterial({ color: noob.torso }));
    torso.position.y = 4; torso.castShadow = true;
    const armL = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshLambertMaterial({ color: noob.arm }));
    armL.position.set(-1.5, 4, 0); armL.castShadow = true;
    const armR = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshLambertMaterial({ color: noob.arm }));
    armR.position.set(1.5, 4, 0); armR.castShadow = true;
    const legL = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshLambertMaterial({ color: noob.leg }));
    legL.position.set(-0.5, 2, 0); legL.castShadow = true;
    const legR = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshLambertMaterial({ color: noob.leg }));
    legR.position.set(0.5, 2, 0); legR.castShadow = true;

    characterGroup.add(head, torso, armL, armR, legL, legR);
    characterGroup.position.set(0, -20, 0);
    scene.add(characterGroup);

    const ambLight = new THREE.AmbientLight(0xdfe6f2, 0.75);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.85);
    dirLight.position.set(18, 34, 22);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(1024, 1024);
    dirLight.shadow.camera.left = -60; dirLight.shadow.camera.right = 60;
    dirLight.shadow.camera.top = 60; dirLight.shadow.camera.bottom = -60;
    dirLight.shadow.camera.far = 120;
    scene.add(ambLight, dirLight);

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

    const ro = new ResizeObserver(() => { onResize(); });
    ro.observe(container);

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) isInertiaRunning = false;
      else if (isVisible) requestRender();
    });

    renderer.domElement.addEventListener('webglcontextlost', e => {
      e.preventDefault();
      if (window.MainApp && window.MainApp.on3DContextLost) {
        window.MainApp.on3DContextLost();
      }
    });
    renderer.domElement.addEventListener('webglcontextrestored', () => {
      if (window.MainApp && window.MainApp.on3DContextRestored) {
        window.MainApp.on3DContextRestored();
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
    if (val) { onResize(); requestRender(); }
    else { isInertiaRunning = false; }
  }

  return {
    init, onResize, updateFaceTexture, setBaseplate, setCharacter, setWireframe, setFov, setVisible, requestRender,
    onFovChange: fn => { fovListener = fn; },
    onCameraMove: fn => { camCb = fn; }
  };
})();