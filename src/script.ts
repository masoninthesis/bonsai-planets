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
camera.position.set(0, 1.1, 2.5); // Position camera to look at the character
camera.up.set(0, 1, 0); // Set up vector to y-axis for proper orientation

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
// Enable orbit controls rotation
_.enableRotate = true;
_.enabled = true;
_.zoomSpeed = 0.5;
// Set target to the character position
_.target.set(0, 1.1, 0);

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
light.intensity = 3; // Increased intensity for better visibility
light.position.set(2, 2, 1); // Adjusted position for better shadows
scene.add(light);
light.castShadow = true;
light.shadow.mapSize.width = 1024; // Higher resolution shadows
light.shadow.mapSize.height = 1024;
light.shadow.camera.far = 10;
light.shadow.camera.near = 0.1;

light.shadow.bias = 0.001; // Reduced bias to minimize shadow artifacts
light.shadow.normalBias = 0.02; // Add normal bias to reduce shadow acne
light.shadow.camera.top = 2;
light.shadow.camera.right = 2;
light.shadow.camera.bottom = -2;
light.shadow.camera.left = -2;

// Add a secondary light from another angle
const secondaryLight = new THREE.DirectionalLight(0xffffcc, 1);
secondaryLight.position.set(-1, 0.5, -1);
scene.add(secondaryLight);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.3); // Increased ambient for better overall visibility
scene.add(ambientLight);

// Character variables
let character: THREE.Object3D | null = null;
let characterPosition = new Vector3(0, 1.1, 0); // Position character on top of planet (y-axis)
let isJumping = false;
let moveDirection = new Vector3(0, 0, 0);
const BASE_MOVE_SPEED = 0.02; // Base movement speed
const MIN_MOVE_SPEED = 0.005; // Minimum movement speed when zoomed in
let MOVE_SPEED = BASE_MOVE_SPEED; // Dynamic movement speed
const BASE_CHARACTER_SIZE = 0.05; // Base character size
const MAX_CHARACTER_SIZE = 0.1; // 200% size when zoomed out
const MIN_CHARACTER_SIZE = 0.025; // 50% size when zoomed in
let characterRotation = new THREE.Quaternion();

let total = 0;
let lastDelta = 0;

// Disable auto-rotation by default
let rotate = false;

// Debug options
let debugMode = false;
let debugRay: THREE.Line | null = null;

renderer.setAnimationLoop((delta) => {
  renderer.render(scene, camera);

  if (rotate) planetMesh.rotation.y += 0.001;

  if (lastDelta > 0) {
    total += delta - lastDelta;
  }
  lastDelta = delta;

  // Update character position if it exists
  if (character && planetMesh) {
    // Only update character if not jumping
    if (!isJumping) {
      updateCharacter();
    }
    
    // Debug visualization of terrain detection ray
    if (debugMode && characterPosition) {
      if (debugRay) scene.remove(debugRay);
      
      // Create debug ray
      const rayStart = characterPosition.clone().normalize().multiplyScalar(1.5);
      const rayEnd = new THREE.Vector3(0, 0, 0); // Planet center
      
      const debugGeometry = new THREE.BufferGeometry().setFromPoints([rayStart, rayEnd]);
      const debugMaterial = new THREE.LineBasicMaterial({ color: 0xff0000 });
      debugRay = new THREE.Line(debugGeometry, debugMaterial);
      scene.add(debugRay);
    }
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
  
  // Update orbit controls
  _.update();
});

// Function to update character position and camera
function updateCharacter() {
  if (!character || !planetMesh) return;
  
  // Calculate character speed and size based on camera distance
  const camDistance = camera.position.distanceTo(characterPosition);
  const zoomFactor = Math.min(Math.max((camDistance - _.minDistance) / (_.maxDistance - _.minDistance), 0), 1);
  
  // Update movement speed - slower when zoomed in
  MOVE_SPEED = MIN_MOVE_SPEED + (BASE_MOVE_SPEED - MIN_MOVE_SPEED) * zoomFactor;
  
  // Update character size - smaller when zoomed in, larger when zoomed out
  const newSize = MIN_CHARACTER_SIZE + (MAX_CHARACTER_SIZE - MIN_CHARACTER_SIZE) * zoomFactor;
  if (character.scale.x !== newSize / BASE_CHARACTER_SIZE) {
    character.scale.set(newSize / BASE_CHARACTER_SIZE, newSize / BASE_CHARACTER_SIZE, newSize / BASE_CHARACTER_SIZE);
  }
  
  // Store the previous position to reset if we don't find valid terrain
  const previousPosition = characterPosition.clone();
  
  // Create a raycaster to detect terrain height
  const raycaster = new THREE.Raycaster();
  
  // Start raycasting from slightly above the character's position in the direction of planet center
  const rayStart = characterPosition.clone().normalize().multiplyScalar(1.5); // Start outside the planet
  const rayDirection = rayStart.clone().negate().normalize(); // Point toward planet center
  
  raycaster.set(rayStart, rayDirection);
  
  // Only raycast against the main terrain mesh, not children (ocean, vegetation, etc.)
  // We need to filter out child objects since they aren't part of the terrain
  const intersects = raycaster.intersectObject(planetMesh, false); // false = don't check children
  
  // If we found terrain beneath us, adjust height
  if (intersects.length > 0 && intersects[0].distance < 3) {
    // Get the collision point and adjust character position
    const hitPoint = intersects[0].point;
    
    // Set character position to sit on terrain (adding small offset for the ball radius)
    characterPosition = hitPoint.clone().normalize().multiplyScalar(hitPoint.length() + newSize);
  } else {
    // Safety fallback: if no terrain found, keep previous position
    characterPosition = previousPosition;
  }
  
  // Apply movement by rotating the planet underneath the character
  if (moveDirection.lengthSq() > 0) {
    // Get camera-relative directions for intuitive controls
    const cameraForward = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    // Project onto the horizontal plane and normalize
    cameraForward.y = 0;
    cameraForward.normalize();
    
    const cameraRight = new Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    // Project onto the horizontal plane and normalize
    cameraRight.y = 0;
    cameraRight.normalize();
    
    // Create rotation axis from movement direction
    let rotationAxis = new Vector3();
    
    // Combine directions based on input - inverted for natural controls
    if (moveDirection.x !== 0) {
      rotationAxis.add(cameraForward.clone().multiplyScalar(moveDirection.x));
    }
    if (moveDirection.z !== 0) {
      rotationAxis.add(cameraRight.clone().multiplyScalar(-moveDirection.z));
    }
    
    // Apply rotation to planet if we have a valid rotation axis
    if (rotationAxis.lengthSq() > 0) {
      rotationAxis.normalize();
      const rotationAngle = MOVE_SPEED;
      
      // Rotate planet in the opposite direction of movement
      planetMesh.rotateOnWorldAxis(rotationAxis, -rotationAngle);
      
      // Update character position after rotation to maintain terrain contact
      const recastRay = new THREE.Raycaster();
      recastRay.set(
        characterPosition.clone().normalize().multiplyScalar(1.5), 
        characterPosition.clone().negate().normalize()
      );
      const recastHits = recastRay.intersectObject(planetMesh, false);
      
      if (recastHits.length > 0 && recastHits[0].distance < 3) {
        const newHitPoint = recastHits[0].point;
        characterPosition = newHitPoint.clone().normalize().multiplyScalar(newHitPoint.length() + newSize);
      }
      
      // Calculate rotation for ball rolling effect
      const rollAxis = rotationAxis.clone().cross(new Vector3(0, 1, 0)).normalize();
      const rollAngle = rotationAngle * 10;
      const deltaRotation = new THREE.Quaternion().setFromAxisAngle(rollAxis, rollAngle);
      characterRotation.premultiply(deltaRotation);
    }
  }
  
  // Update character position and rotation
  character.position.copy(characterPosition);
  character.quaternion.copy(characterRotation);
  
  // Update orbit controls target
  _.target.copy(characterPosition);
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
      // Jump effect - make the character jump away from planet center
      if (!isJumping) {
        isJumping = true;
        
        // Calculate current character size for proper jump effect
        const camDistance = camera.position.distanceTo(characterPosition);
        const zoomFactor = Math.min(Math.max((camDistance - _.minDistance) / (_.maxDistance - _.minDistance), 0), 1);
        const currentSize = MIN_CHARACTER_SIZE + (MAX_CHARACTER_SIZE - MIN_CHARACTER_SIZE) * zoomFactor;
        
        // Set jump velocity in the direction away from planet center
        const jumpDirection = characterPosition.clone().normalize();
        const jumpDistance = 0.15 * (currentSize / BASE_CHARACTER_SIZE); // Scale jump height with character size
        
        // Animation loop for the jump
        let jumpTime = 0;
        const jumpDuration = 300; // in milliseconds
        const jumpInterval = setInterval(() => {
          jumpTime += 16; // ~60fps
          
          // Parabolic jump motion
          const jumpProgress = jumpTime / jumpDuration;
          const heightFactor = 4 * jumpProgress * (1 - jumpProgress); // Parabolic curve that peaks at 0.5
          
          // Calculate jump offset (max at middle of jump)
          const offset = jumpDirection.clone().multiplyScalar(jumpDistance * heightFactor);
          
          // Apply offset to character position
          if (character) {
            // Store the actual position before adding jump offset
            const basePosition = characterPosition.clone().sub(offset);
            character.position.copy(basePosition.clone().add(offset));
          }
          
          if (jumpTime >= jumpDuration) {
            clearInterval(jumpInterval);
            isJumping = false;
          }
        }, 16);
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
    case "d":
      if (event.ctrlKey) {
        debugMode = !debugMode;
        console.log("Debug mode:", debugMode);
        
        // Clean up debug visualization if turning off
        if (!debugMode && debugRay) {
          scene.remove(debugRay);
          debugRay = null;
        }
      }
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
    // Create a ball character with more visible materials
    const geometry = new THREE.SphereGeometry(BASE_CHARACTER_SIZE, 32, 32);
    
    // Create a material that stands out against the planet terrain
    const material = new THREE.MeshStandardMaterial({ 
      color: 0xff5522,  // Bright orange color
      roughness: 0.3,
      metalness: 0.7,
      emissive: 0x331100,  // Slight glow
      emissiveIntensity: 0.2
    });
    
    character = new THREE.Mesh(geometry, material);
    
    // Enable shadows
    character.castShadow = true;
    character.receiveShadow = true;
    
    // Position character at the fixed center position initially
    characterPosition = new Vector3(0, 1.1, 0);
    character.position.copy(characterPosition);
    
    // Reset character rotation and velocity
    characterRotation = new THREE.Quaternion();
    moveDirection = new Vector3(0, 0, 0);
    isJumping = false;
    
    // Add character to the scene
    scene.add(character);
    
    // Set orbit controls target to the character
    _.target.copy(characterPosition);
    
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
      // Reset character position to start point above planet surface
      characterPosition = new Vector3(0, 1.1, 0);
      if (character) {
        character.position.copy(characterPosition);
        // Reset character rotation
        characterRotation = new THREE.Quaternion();
        moveDirection = new Vector3(0, 0, 0);
        isJumping = false;
      }
    }
    
    // Force terrain detection on the new planet after a small delay
    // (needed to ensure all planet meshes are properly loaded)
    setTimeout(() => {
      if (character && planetMesh) {
        // Calculate current character size
        const camDistance = camera.position.distanceTo(characterPosition);
        const zoomFactor = Math.min(Math.max((camDistance - _.minDistance) / (_.maxDistance - _.minDistance), 0), 1);
        const currentSize = MIN_CHARACTER_SIZE + (MAX_CHARACTER_SIZE - MIN_CHARACTER_SIZE) * zoomFactor;
        
        // Cast a ray down from the character to find terrain
        const raycaster = new THREE.Raycaster();
        const rayStart = new Vector3(0, 1.5, 0); // Start above planet
        const rayDirection = new Vector3(0, -1, 0); // Cast downward
        
        raycaster.set(rayStart, rayDirection);
        const intersects = raycaster.intersectObject(planetMesh, false);
        
        if (intersects.length > 0) {
          // Position character on detected terrain
          const hitPoint = intersects[0].point;
          characterPosition = hitPoint.clone().add(new Vector3(0, currentSize, 0)); // Add current ball radius
          character.position.copy(characterPosition);
          
          // Update orbit controls target
          _.target.copy(characterPosition);
          
          console.log("Character positioned on new planet terrain");
        }
      }
    }, 500);
    
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
