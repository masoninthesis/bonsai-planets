import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { loadModels } from "./worlds/models";

// Create a simple scene
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
document.body.appendChild(statusElement);

// Function to log messages to the status display
function logStatus(message: string) {
  console.log(message);
  statusElement.innerHTML += `<div>${message}</div>`;
}

// Load and display models
async function loadAndDisplayModels() {
  const modelTypes = ["PineTree", "CommonTree", "Rock", "Willow", "PalmTree"];
  
  for (let i = 0; i < modelTypes.length; i++) {
    const modelType = modelTypes[i];
    logStatus(`Loading ${modelType}...`);
    
    try {
      const models = await loadModels(modelType);
      
      if (models.length === 0) {
        logStatus(`❌ No models loaded for ${modelType}`);
        continue;
      }
      
      logStatus(`✅ Loaded ${models.length} variants of ${modelType}`);
      
      // Position models in a row
      for (let j = 0; j < models.length; j++) {
        const model = models[j];
        
        // Scale the model
        model.scale.set(0.025, 0.025, 0.025);
        
        // Position the model
        model.position.set(j * 2 - models.length, i * 2 - modelTypes.length, 0);
        
        // Add to scene
        scene.add(model);
        
        // Add a small sphere to mark the position
        const sphere = new THREE.Mesh(
          new THREE.SphereGeometry(0.1),
          new THREE.MeshBasicMaterial({ color: 0xff0000 })
        );
        sphere.position.copy(model.position);
        scene.add(sphere);
      }
    } catch (error) {
      logStatus(`❌ Error loading ${modelType}: ${error}`);
    }
  }
  
  logStatus("Finished loading models");
}

// Animation loop
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

// Start the test
loadAndDisplayModels();
animate(); 