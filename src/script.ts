import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Planet } from "./worlds/planet";
import { Stars } from "./worlds/stars";
import { planetPresets } from "./worlds/presets";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Mesh, Vector3 } from "three";

const presets = ["beach", "forest", "snowForest"];

const width = window.innerWidth,
  height = window.innerHeight;

const canvas = document.getElementById("root");

if (!canvas) {
  throw new Error("Canvas not found");
}
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, width / height, 0.01, 30);
camera.position.set(0, 3, 0); // Position camera above for top-down view
camera.up.set(0, 0, 1); // Set up vector to z-axis for proper orientation

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  canvas,
  alpha: true,
});

renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;

const _ = new OrbitControls(camera, renderer.domElement);
_.enablePan = false;
_.minDistance = 0.5;
_.maxDistance = 5;
_.enableDamping = true;
_.dampingFactor = 0.1;
// Disable orbit controls rotation
_.enableRotate = false;
_.enabled = true;
_.zoomSpeed = 0.5;

let hasPlanet = false;

let sphereGeometry = new THREE.IcosahedronGeometry(1, 20);
let sphereMaterial = new THREE.MeshStandardMaterial({
  color: "white",
  wireframe: true,
  wireframeLinewidth: 10,
});
let planetMesh: THREE.Mesh = new THREE.Mesh(sphereGeometry, sphereMaterial);
scene.add(planetMesh);

const light = new THREE.DirectionalLight();
light.intensity = 2;
light.position.set(2, 1, 0);
scene.add(light);
light.castShadow = true;
light.shadow.mapSize.width = 512;
light.shadow.mapSize.height = 512;
light.shadow.camera.far = 10;
light.shadow.camera.near = 0.1;

light.shadow.bias = 0.01;
light.shadow.camera.top = 2;
light.shadow.camera.right = 2;
light.shadow.camera.bottom = -2;
light.shadow.camera.left = -2;

const ambientLight = new THREE.AmbientLight(0xffffff, 0.1);
scene.add(ambientLight);

// Character variables
let character: THREE.Object3D | null = null;
let characterPosition = new Vector3(0, 1.1, 0); // Position character on top of planet (y-axis)
let isJumping = false;
let moveDirection = new Vector3(0, 0, 0);
const MOVE_SPEED = 0.02; // Movement speed
let characterRotation = new THREE.Quaternion();

let total = 0;
let lastDelta = 0;

// Disable auto-rotation by default
let rotate = false;

renderer.setAnimationLoop((delta) => {
  renderer.render(scene, camera);

  if (rotate) planetMesh.rotation.y += 0.001;

  if (lastDelta > 0) {
    total += delta - lastDelta;
  }
  lastDelta = delta;

  // Update character position if it exists
  if (character && planetMesh) {
    updateCharacter();
  }

  // Animate water level with a subtle sine wave
  if (planetMesh && planetMesh.children.length > 0) {
    // First child is the ocean mesh
    const oceanMesh = planetMesh.children[0] as Mesh;
    if (oceanMesh.morphTargetInfluences && oceanMesh.morphTargetInfluences.length > 0) {
      // Animate the morph target influence with a sine wave (more subtle)
      oceanMesh.morphTargetInfluences[0] = Math.sin(total * 0.0003) * 0.3 + 0.3;
    }
    
    // Update caustics material if it exists
    if (oceanMesh.material && (oceanMesh.material as any).update) {
      (oceanMesh.material as any).update();
    }
  }

  if (!hasPlanet) {
    console.log("Creating planet");
    createPlanet("beach");
    hasPlanet = true;
  }
  
  // Ensure camera stays in position looking down at the planet
  camera.position.set(0, 3, 0);
  camera.up.set(0, 0, 1); // Set up vector to z-axis for proper orientation
  camera.lookAt(new Vector3(0, 0, 0));
});

// Function to update character position and camera
function updateCharacter() {
  if (!character || !planetMesh) return;
  
  // Keep character fixed at the center position on top of planet (y-axis)
  characterPosition = new Vector3(0, 1.1, 0);
  
  // Apply movement by rotating the planet underneath the character
  if (moveDirection.lengthSq() > 0) {
    // Calculate rotation axis and angle based on input
    let rotationAxis = new Vector3();
    
    if (moveDirection.x !== 0) {
      // Left/right movement rotates around the y axis
      rotationAxis.add(new Vector3(0, 1, 0).multiplyScalar(-moveDirection.x));
    }
    if (moveDirection.z !== 0) {
      // Forward/backward movement rotates around the x axis
      rotationAxis.add(new Vector3(1, 0, 0).multiplyScalar(moveDirection.z));
    }
    
    // Normalize rotation axis and apply rotation to planet
    if (rotationAxis.lengthSq() > 0) {
      rotationAxis.normalize();
      const rotationAngle = MOVE_SPEED;
      planetMesh.rotateOnWorldAxis(rotationAxis, rotationAngle);
      
      // Calculate rotation for ball rolling effect
      const rollAxis = new Vector3(1, 0, 0).cross(rotationAxis).normalize();
      const rollAngle = rotationAngle * 10;
      const deltaRotation = new THREE.Quaternion().setFromAxisAngle(rollAxis, rollAngle);
      characterRotation.premultiply(deltaRotation);
    }
  }
  
  // Update character position and rotation
  character.position.copy(characterPosition);
  character.quaternion.copy(characterRotation);
}

// Add keyboard controls
document.addEventListener("keydown", (event) => {
  switch (event.key) {
    case "ArrowUp":
    case "w":
      moveDirection.z = 1;
      break;
    case "ArrowDown":
    case "s":
      moveDirection.z = -1;
      break;
    case "ArrowLeft":
    case "a":
      moveDirection.x = -1;
      break;
    case "ArrowRight":
    case "d":
      moveDirection.x = 1;
      break;
    case " ":
      // Jump effect - make the planet smaller briefly
      if (!isJumping) {
        isJumping = true;
        const originalScale = planetMesh.scale.clone();
        // Shrink the planet
        planetMesh.scale.multiplyScalar(0.9);
        // Return to original size after a delay
        setTimeout(() => {
          planetMesh.scale.copy(originalScale);
          isJumping = false;
        }, 300);
      }
      break;
    case "r":
      rotate = !rotate;
      break;
    case "1":
      createPlanet("beach");
      break;
    case "2":
      createPlanet("forest");
      break;
    case "3":
      createPlanet("snowForest");
      break;
  }
});

document.addEventListener("keyup", (event) => {
  switch (event.key) {
    case "ArrowUp":
    case "w":
      if (moveDirection.z > 0) moveDirection.z = 0;
      break;
    case "ArrowDown":
    case "s":
      if (moveDirection.z < 0) moveDirection.z = 0;
      break;
    case "ArrowLeft":
    case "a":
      if (moveDirection.x < 0) moveDirection.x = 0;
      break;
    case "ArrowRight":
    case "d":
      if (moveDirection.x > 0) moveDirection.x = 0;
      break;
  }
});

let stars = new Stars();

scene.add(stars);

// button press
let button = document.getElementById("button");
if (button) {
  console.log("Button found");
  button.addEventListener("click", () => {
    let randomPreset = presets[Math.floor(Math.random() * presets.length)];
    createPlanet(randomPreset);
  });
}

// Add event listeners for the new buttons
const beachButton = document.getElementById("beach");
if (beachButton) {
  beachButton.addEventListener("click", () => {
    createPlanet("beach");
  });
}

const forestButton = document.getElementById("forest");
if (forestButton) {
  forestButton.addEventListener("click", () => {
    createPlanet("forest");
  });
}

const snowButton = document.getElementById("snow");
if (snowButton) {
  snowButton.addEventListener("click", () => {
    createPlanet("snowForest");
  });
}

const randomButton = document.getElementById("random");
if (randomButton) {
  randomButton.addEventListener("click", () => {
    let randomPreset = presets[Math.floor(Math.random() * presets.length)];
    createPlanet(randomPreset);
  });
}

// Function to create a character
async function createCharacter() {
  if (character) {
    scene.remove(character);
  }
  
  try {
    // Create a simple ball character
    const geometry = new THREE.SphereGeometry(0.05, 32, 32);
    const material = new THREE.MeshStandardMaterial({ 
      color: 0x3366ff,
      roughness: 0.4,
      metalness: 0.3
    });
    character = new THREE.Mesh(geometry, material);
    
    // Position character on top of the planet
    characterPosition = new Vector3(0, 1.1, 0);
    character.position.copy(characterPosition);
    
    // Reset character rotation and velocity
    characterRotation = new THREE.Quaternion();
    moveDirection = new Vector3(0, 0, 0);
    isJumping = false;
    
    // Add character to the scene
    scene.add(character);
    
    // Set camera position to view the planet and character
    camera.position.set(0, 3, 0);
    camera.up.set(0, 0, 1); // Set up vector to z-axis for proper orientation
    camera.lookAt(new Vector3(0, 0, 0));
    
    console.log("Ball character created and added to scene");
  } catch (error) {
    console.error("Error creating character:", error);
  }
}

async function createPlanet(preset: string | undefined = undefined) {
  if (!preset) {
    preset = presets[Math.floor(Math.random() * presets.length)];
  }

  // Save character state
  const hadCharacter = character !== null;
  
  console.log("Creating planet with preset:", preset);
  console.time("planet");
  const planet = new Planet({
    detail: 60,
    ...planetPresets[preset],
  });
  console.log("Planet instance created, calling create()");
  try {
    let mesh = await planet.create();
    console.log("Planet mesh created:", mesh);
    scene.remove(planetMesh);
    scene.add(mesh);
    planetMesh = mesh;
    
    // Center the planet at the origin
    planetMesh.position.set(0, 0, 0);
    
    // Create character or restore it
    if (!hadCharacter) {
      createCharacter();
    } else {
      // Reset character position on top of planet
      characterPosition = new Vector3(0, 1.1, 0);
      if (character) {
        character.position.copy(characterPosition);
        // Reset character rotation
        characterRotation = new THREE.Quaternion();
        moveDirection = new Vector3(0, 0, 0);
        isJumping = false;
      }
      
      // Set camera position to view the planet and character
      camera.position.set(0, 3, 0);
      camera.up.set(0, 0, 1); // Set up vector to z-axis for proper orientation
      camera.lookAt(new Vector3(0, 0, 0));
    }
    
    // Manually add models to the planet if needed
    if (mesh.children.length < 3) { // Only ocean and atmosphere
      console.log("No vegetation detected, manually adding models");
      await planet.addManualModels(mesh);
    }
    
    console.timeEnd("planet");
  } catch (error) {
    console.error("Error creating planet:", error);
    // Create a fallback planet if there's an error
    const geometry = new THREE.IcosahedronGeometry(1, 4);
    const material = new THREE.MeshStandardMaterial({ 
      color: preset === "beach" ? 0x66aaff : preset === "forest" ? 0x33aa66 : 0xeeeeff,
      roughness: 0.8
    });
    const fallbackMesh = new THREE.Mesh(geometry, material);
    scene.remove(planetMesh);
    scene.add(fallbackMesh);
    planetMesh = fallbackMesh;
    console.timeEnd("planet");
  }
}

function updateSize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}

updateSize();
window.addEventListener("resize", updateSize);
