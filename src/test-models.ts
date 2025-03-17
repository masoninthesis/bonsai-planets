import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { loadModels, getModels } from "./worlds/models";

// Create a simple scene to test model loading
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  70,
  window.innerWidth / window.innerHeight,
  0.01,
  30
);
camera.position.set(0, 0, 5);

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

// Create a grid helper
const gridHelper = new THREE.GridHelper(10, 10);
scene.add(gridHelper);

// Create status display
const statusElement = document.createElement("div");
statusElement.style.position = "absolute";
statusElement.style.top = "10px";
statusElement.style.left = "10px";
statusElement.style.color = "white";
statusElement.style.fontFamily = "Arial, sans-serif";
statusElement.style.padding = "10px";
statusElement.style.backgroundColor = "rgba(0,0,0,0.5)";
statusElement.style.maxWidth = "400px";
statusElement.style.maxHeight = "80vh";
statusElement.style.overflow = "auto";
document.body.appendChild(statusElement);

// Function to log messages to the status display
function logStatus(message: string) {
  console.log(message);
  statusElement.innerHTML += `<div>${message}</div>`;
}

// Function to load and display a model
async function loadAndDisplayModel(modelName: string) {
  try {
    logStatus(`Loading model: ${modelName}`);
    const models = await loadModels(modelName);
    
    if (models.length > 0) {
      logStatus(`Successfully loaded ${models.length} variants of ${modelName}`);
      
      // Position models in a row
      models.forEach((model, index) => {
        model.position.set(index * 2 - (models.length - 1), 0, 0);
        scene.add(model);
      });
      
      return true;
    } else {
      logStatus(`⚠️ No models loaded for ${modelName}`);
      return false;
    }
  } catch (error) {
    logStatus(`❌ Error loading model ${modelName}: ${error}`);
    return false;
  }
}

// Get all available models
const availableModels = getModels();
logStatus(`Available models: ${availableModels.join(", ")}`);

// List of models to test
const modelsToTest = [
  "PineTree",
  "CommonTree",
  "Rock",
  "Willow",
  "PalmTree"
];

// Load models one by one
async function loadAllModels() {
  logStatus("Starting model loading test...");
  
  let loadedCount = 0;
  
  for (const modelName of modelsToTest) {
    const success = await loadAndDisplayModel(modelName);
    
    if (success) {
      loadedCount++;
    }
  }
  
  logStatus(`Loaded ${loadedCount}/${modelsToTest.length} models`);
  
  if (loadedCount === 0) {
    logStatus("❌ No models loaded. Check the console for errors.");
    logStatus("Possible issues:");
    logStatus("1. Models path is incorrect");
    logStatus("2. GLTF files are not accessible");
    logStatus("3. CORS issues if loading from a different domain");
  }
}

// Animation loop
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

// Start the test
loadAllModels();
animate(); 