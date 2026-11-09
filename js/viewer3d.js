"use strict";
window.Viewer3D = (function () {
  let scene, camera, renderer, controls;
  const faceMeshes = {};
  let baseplateGroup;
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

    baseplateGroup = new THREE.Group();
    const grid = new THREE.GridHelper(80, 40, 0x4a90d9, 0x343a4b);
    grid.position.y = -20;
    baseplateGroup.add(grid);
    scene.add(baseplateGroup);

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

  function setBaseplate(show) {
    if (baseplateGroup) baseplateGroup.visible = show;
  }

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

  return { init, onResize, updateFaceTexture, setBaseplate, setWireframe, setFov };
})();
