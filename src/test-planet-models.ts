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

// Create a planet
const planetGeometry = new THREE.IcosahedronGeometry(1, 20);
const planetMaterial = new THREE.MeshStandardMaterial({
  color: 0x22aa22,
  roughness: 0.8,
});
const planet = new THREE.Mesh(planetGeometry, planetMaterial);
scene.add(planet);

// Function to load a model
async function loadModel(path: string): Promise<THREE.Group> {
  const loader = new GLTFLoader();
  
  return new Promise((resolve, reject) => {
    loader.load(
      path,
      (gltf) => {
        logStatus(`Loaded model: ${path}`);
        resolve(gltf.scene);
      },
      undefined,
      (error) => {
        logStatus(`Error loading model: ${error}`);
        reject(error);
      }
    );
  });
}

// Function to place a model on the planet
function placeModelOnPlanet(model: THREE.Object3D, position: THREE.Vector3) {
  // Scale the model
  model.scale.set(0.025, 0.025, 0.025);
  
  // Position the model on the planet surface
  const normalizedPosition = position.clone().normalize();
  model.position.copy(normalizedPosition);
  
  // Orient the model to face outward from the planet center
  const up = new THREE.Vector3(0, 1, 0);
  const quaternion = new THREE.Quaternion().setFromUnitVectors(up, normalizedPosition);
  model.quaternion.copy(quaternion);
  
  // Add the model to the planet
  planet.add(model);
  
  // Add a small sphere to mark the position
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.02),
    new THREE.MeshBasicMaterial({ color: 0xff0000 })
  );
  sphere.position.copy(normalizedPosition);
  planet.add(sphere);
  
  logStatus(`Placed model at position: ${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)}`);
}

// Load and place models on the planet
async function loadAndPlaceModels() {
  logStatus("Loading models...");
  
  try {
    // Define positions around the planet
    const positions = [
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(-1, 0, 0),
      new THREE.Vector3(0, 0, -1),
      new THREE.Vector3(0.7, 0.7, 0),
      new THREE.Vector3(-0.7, 0.7, 0),
      new THREE.Vector3(0, -1, 0),
    ];
    
    // Load models
    const pineTree = await loadModel("/lowpoly_nature/PineTree_1.gltf");
    const commonTree = await loadModel("/lowpoly_nature/CommonTree_1.gltf");
    const rock = await loadModel("/lowpoly_nature/Rock_1.gltf");
    
    // Place pine trees
    positions.forEach((position, index) => {
      if (index < 3) {
        const model = pineTree.clone();
        placeModelOnPlanet(model, position);
      } else if (index < 6) {
        const model = commonTree.clone();
        placeModelOnPlanet(model, position);
      } else {
        const model = rock.clone();
        placeModelOnPlanet(model, position);
      }
    });
    
    logStatus("All models placed on planet");
  } catch (error) {
    logStatus(`Error: ${error}`);
  }
}

// Animation loop
function animate() {
  requestAnimationFrame(animate);
  
  // Rotate the planet
  planet.rotation.y += 0.001;
  
  controls.update();
  renderer.render(scene, camera);
}

// Start the test
loadAndPlaceModels();
animate(); 