"use strict";
window.Viewer3D = (function () {
  let scene, camera, renderer, controls;
  const faceMeshes = {};
  let baseplateGroup, characterGroup;
  let isInitialized = false;

  function init(container) {
    if (isInitialized) return;
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(0, 0, 0.1);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableZoom = true;
    controls.enablePan = false;
    controls.rotateSpeed = -0.35;
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    const D = 200;
    const planeGeo = new THREE.PlaneGeometry(D, D);
    const configs = [
      { k: 'Ft', pos: [0, 0, -D / 2], rot: [0, 0, 0] },
      { k: 'Bk', pos: [0, 0, D / 2], rot: [0, Math.PI, 0] },
      { k: 'Lf', pos: [-D / 2, 0, 0], rot: [0, Math.PI / 2, 0] },
      { k: 'Rt', pos: [D / 2, 0, 0], rot: [0, -Math.PI / 2, 0] },
      { k: 'Up', pos: [0, D / 2, 0], rot: [Math.PI / 2, 0, Math.PI] },
      { k: 'Dn', pos: [0, -D / 2, 0], rot: [-Math.PI / 2, 0, Math.PI] }
    ];

    configs.forEach(c => {
      const mat = new THREE.MeshBasicMaterial({ color: 0x1b1e27, side: THREE.FrontSide });
      const mesh = new THREE.Mesh(planeGeo, mat);
      mesh.position.set(...c.pos);
      mesh.rotation.set(...c.rot);
      scene.add(mesh);
      faceMeshes[c.k] = mesh;
    });

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
    characterGroup.position.set(0, -20, -10); // di atas baseplate
    characterGroup.scale.set(1.5, 1.5, 1.5);
    scene.add(characterGroup);

    // Pencahayaan untuk karakter
    const ambLight = new THREE.AmbientLight(0xffffff, 0.8);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
    dirLight.position.set(5, 15, 10);
    scene.add(ambLight, dirLight);

    function animate() {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }
    animate();

    window.addEventListener('resize', onResize);
    isInitialized = true;
  }

  function onResize() {
    const el = document.getElementById('stage3d');
    if (!el || !renderer || !camera) return;
    camera.aspect = el.clientWidth / el.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(el.clientWidth, el.clientHeight);
  }

  function updateFaceTexture(faceKey, canvasSource) {
    if (!faceMeshes[faceKey]) return;
    const tex = new THREE.CanvasTexture(canvasSource);
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    faceMeshes[faceKey].material.map = tex;
    faceMeshes[faceKey].material.color.setHex(0xffffff);
    faceMeshes[faceKey].material.needsUpdate = true;
  }

  function setBaseplate(show) { if (baseplateGroup) baseplateGroup.visible = show; }
  function setCharacter(show) { if (characterGroup) characterGroup.visible = show; }
  function setWireframe(show) {
    Object.values(faceMeshes).forEach(m => {
      m.material.wireframe = show;
      m.material.needsUpdate = true;
    });
  }
  function setFov(fov) {
    if (!camera) return;
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }

  return { init, onResize, updateFaceTexture, setBaseplate, setCharacter, setWireframe, setFov };
})();
