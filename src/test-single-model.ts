import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

// Create a simple scene
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  70,
  window.innerWidth / window.innerHeight,
  0.01,
  30
);
camera.position.set(0, 0, 3);

const canvas = document.createElement("canvas");
document.body.appendChild(canvas);
canvas.style.width = "100%";
canvas.style.height = "100vh";

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  canvas,
  alpha: true,
});
renderer.setSize(window.innerWidth, window.innerHeight);

const controls = new OrbitControls(camera, renderer.domElement);

// Add lights
const light = new THREE.DirectionalLight(0xffffff, 2);
light.position.set(2, 1, 0);
scene.add(light);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

// Create a sphere to represent the planet
const sphereGeometry = new THREE.IcosahedronGeometry(1, 20);
const sphereMaterial = new THREE.MeshStandardMaterial({
  color: 0x22aa22,
  roughness: 0.8,
});
const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
scene.add(sphere);

// Create status display
const statusElement = document.createElement("div");
statusElement.style.position = "absolute";
statusElement.style.top = "10px";
statusElement.style.left = "10px";
statusElement.style.color = "white";
statusElement.style.fontFamily = "Arial, sans-serif";
statusElement.style.padding = "10px";
statusElement.style.backgroundColor = "rgba(0,0,0,0.5)";
document.body.appendChild(statusElement);

// Function to log messages to the status display
function logStatus(message: string) {
  console.log(message);
  statusElement.innerHTML += `<div>${message}</div>`;
}

// Load and place a model on the sphere
async function loadAndPlaceModel() {
  logStatus("Loading model...");
  
  const loader = new GLTFLoader();
  
  try {
    // Load a tree model
    const gltf = await new Promise<THREE.Group>((resolve, reject) => {
      loader.load(
        "/lowpoly_nature/PineTree_1.gltf",
        (gltf) => resolve(gltf.scene),
        (progress) => console.log("Loading progress:", progress),
        (error) => reject(error)
      );
    });
    
    logStatus("Model loaded successfully");
    
    // Get the model
    const model = gltf;
    
    // Scale the model
    const scale = 0.5;
    model.scale.set(scale, scale, scale);
    
    // Position the model on the sphere surface
    const position = new THREE.Vector3(0, 1, 0);
    model.position.copy(position);
    
    // Orient the model to face outward from the sphere center
    const up = new THREE.Vector3(0, 1, 0);
    const normal = position.clone().normalize();
    const quaternion = new THREE.Quaternion().setFromUnitVectors(up, normal);
    model.quaternion.copy(quaternion);
    
    // Add the model to the scene
    sphere.add(model);
    
    logStatus("Model placed on sphere");
    
    // Add more models at different positions
    const positions = [
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(-1, 0, 0),
      new THREE.Vector3(0, 0, -1),
      new THREE.Vector3(0.7, 0.7, 0),
      new THREE.Vector3(-0.7, 0.7, 0),
      new THREE.Vector3(0, -1, 0),
    ];
    
    for (const position of positions) {
      const newModel = model.clone();
      
      // Position the model on the sphere surface
      const normalizedPosition = position.clone().normalize();
      newModel.position.copy(normalizedPosition);
      
      // Orient the model to face outward from the sphere center
      const quaternion = new THREE.Quaternion().setFromUnitVectors(up, normalizedPosition);
      newModel.quaternion.copy(quaternion);
      
      // Add the model to the scene
      sphere.add(newModel);
    }
    
    logStatus(`Added ${positions.length + 1} models to the sphere`);
    
  } catch (error) {
    logStatus(`Error loading model: ${error}`);
  }
}

// Animation loop
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

// Start the test
loadAndPlaceModel();
animate(); 