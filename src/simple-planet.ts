import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Planet } from "./worlds/planet";
import { planetPresets } from "./worlds/presets";
import { Stars } from "./worlds/stars";

// Set up the scene
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  70,
  window.innerWidth / window.innerHeight,
  0.01,
  30
);
camera.position.set(0, 0, 2.5);

// Set up the renderer
const canvas = document.getElementById("root") as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  canvas,
  alpha: true,
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;

// Add orbit controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.rotateSpeed = 0.5;

// Add lighting
const light = new THREE.DirectionalLight(0xffffff, 2);
light.position.set(2, 1, 0);
scene.add(light);
light.castShadow = true;
light.shadow.mapSize.width = 512;
light.shadow.mapSize.height = 512;
light.shadow.camera.far = 10;
light.shadow.camera.near = 0.1;

const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

// Add stars
const stars = new Stars();
scene.add(stars);

// Create a placeholder sphere
const sphereGeometry = new THREE.IcosahedronGeometry(1, 2);
const sphereMaterial = new THREE.MeshStandardMaterial({
  color: "white",
  wireframe: true,
});
const placeholder = new THREE.Mesh(sphereGeometry, sphereMaterial);
scene.add(placeholder);

// Status display
const statusElement = document.getElementById("status");
function updateStatus(message: string) {
  if (statusElement) {
    statusElement.textContent = message;
  }
  console.log(message);
}

// Create the planet
let planetMesh: THREE.Mesh | null = null;
let isRotating = true;

// Create a simple planet without vegetation
async function createSimplePlanet(preset = "beach") {
  updateStatus(`Creating simple planet with ${preset} preset...`);
  
  try {
    // Create a basic sphere
    const geometry = new THREE.IcosahedronGeometry(1, 6);
    
    // Create a material with a texture based on the preset
    let color = 0x3366ff; // Default blue
    
    if (preset === "beach") {
      color = 0x66aaff;
    } else if (preset === "forest") {
      color = 0x33aa66;
    } else if (preset === "snowForest") {
      color = 0xeeeeff;
    }
    
    const material = new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.8,
      metalness: 0.2,
    });
    
    // Create the mesh
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    
    // Add some noise to the geometry vertices to make it look more natural
    const vertices = geometry.attributes.position;
    const count = vertices.count;
    
    for (let i = 0; i < count; i++) {
      const x = vertices.getX(i);
      const y = vertices.getY(i);
      const z = vertices.getZ(i);
      
      const noise = Math.random() * 0.05;
      const vector = new THREE.Vector3(x, y, z).normalize();
      vector.multiplyScalar(1 + noise);
      
      vertices.setXYZ(i, vector.x, vector.y, vector.z);
    }
    
    geometry.computeVertexNormals();
    
    // Add an atmosphere
    const atmosphereGeometry = new THREE.IcosahedronGeometry(1.1, 6);
    const atmosphereMaterial = new THREE.MeshBasicMaterial({
      color: 0x88aaff,
      transparent: true,
      opacity: 0.2,
      side: THREE.BackSide,
    });
    
    const atmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
    mesh.add(atmosphere);
    
    updateStatus("Planet created successfully!");
    
    // Remove the placeholder and add the planet
    scene.remove(placeholder);
    
    // Remove the old planet if it exists
    if (planetMesh) {
      scene.remove(planetMesh);
    }
    
    scene.add(mesh);
    planetMesh = mesh;
    
    return mesh;
  } catch (error) {
    updateStatus(`Error creating planet: ${error}`);
    console.error("Error creating planet:", error);
    return null;
  }
}

// Animation loop
function animate() {
  requestAnimationFrame(animate);
  
  // Rotate the planet if enabled
  if (planetMesh && isRotating) {
    planetMesh.rotation.y += 0.002;
  }
  
  // Update controls
  controls.update();
  
  // Render the scene
  renderer.render(scene, camera);
}

// Handle window resize
function updateSize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", updateSize);

// Add keyboard controls
document.addEventListener("keydown", (event) => {
  if (event.key === " ") {
    isRotating = !isRotating;
    updateStatus(`Rotation ${isRotating ? "enabled" : "disabled"}`);
  } else if (event.key === "1") {
    createSimplePlanet("beach");
  } else if (event.key === "2") {
    createSimplePlanet("forest");
  } else if (event.key === "3") {
    createSimplePlanet("snowForest");
  }
});

// Add button event listeners
document.getElementById("toggle-rotation")?.addEventListener("click", () => {
  isRotating = !isRotating;
  updateStatus(`Rotation ${isRotating ? "enabled" : "disabled"}`);
});

document.getElementById("beach-preset")?.addEventListener("click", () => {
  createSimplePlanet("beach");
});

document.getElementById("forest-preset")?.addEventListener("click", () => {
  createSimplePlanet("forest");
});

document.getElementById("snow-preset")?.addEventListener("click", () => {
  createSimplePlanet("snowForest");
});

// Start the animation loop
animate();

// Create the initial planet
createSimplePlanet("beach"); 