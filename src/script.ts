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
const camera = new THREE.PerspectiveCamera(70, width / height, 0.001, 30);
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
_.minDistance = 0.05; // Allow extremely close zoom
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
// Movement direction (Updated by keydown/keyup events)
let moveDirection = new Vector3(0, 0, 0);
// Last non-zero movement direction (stores the last direction the character was moving)
const lastMoveDirection = new Vector3(0, 0, 1); // Default forward
const BASE_MOVE_SPEED = 0.02; // Base movement speed
const MIN_MOVE_SPEED = 0.0005; // Ultra-slow movement speed for extreme close-ups
let MOVE_SPEED = BASE_MOVE_SPEED; // Dynamic movement speed
const BASE_CHARACTER_SIZE = 0.05; // Base character size
const MAX_CHARACTER_SIZE = 0.1; // 200% size when zoomed out
const MIN_CHARACTER_SIZE = 0.005; // 10% size when zoomed in extremely close
let characterRotation = new THREE.Quaternion();
let animationTime = 0; // For running animation

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
    animationTime += delta; // Update animation time continuously
  }
  lastDelta = delta;

  // Update character position if it exists
  if (character && planetMesh) {
    // Only update character if not jumping
    if (!isJumping) {
      updateCharacter();
      updateRunningAnimation(); // Add running animation
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
  let zoomFactor = Math.min(Math.max((camDistance - _.minDistance) / (_.maxDistance - _.minDistance), 0), 1);
  zoomFactor = Math.pow(zoomFactor, 0.7); // Non-linear scaling
  
  // Update movement speed - slower when zoomed in
  MOVE_SPEED = MIN_MOVE_SPEED + (BASE_MOVE_SPEED - MIN_MOVE_SPEED) * zoomFactor;
  
  // Update character size - smaller when zoomed in, larger when zoomed out
  const newSize = MIN_CHARACTER_SIZE + (MAX_CHARACTER_SIZE - MIN_CHARACTER_SIZE) * zoomFactor;
  if (character.scale.x !== newSize / BASE_CHARACTER_SIZE) {
    character.scale.set(newSize / BASE_CHARACTER_SIZE, newSize / BASE_CHARACTER_SIZE, newSize / BASE_CHARACTER_SIZE);
  }
  
  // Store the previous position to reset if no terrain is found
  const previousPosition = characterPosition.clone();
  
  // Raycast to detect terrain height
  const raycaster = new THREE.Raycaster();
  const rayStart = characterPosition.clone().normalize().multiplyScalar(1.5); // Start outside planet
  const rayDirection = rayStart.clone().negate().normalize(); // Toward planet center
  raycaster.set(rayStart, rayDirection);
  
  // Only raycast against the main terrain mesh, not children
  const intersects = raycaster.intersectObject(planetMesh, false);
  
  if (intersects.length > 0 && intersects[0].distance < 3) {
    const hitPoint = intersects[0].point;
    characterPosition = hitPoint.clone().normalize().multiplyScalar(hitPoint.length() + newSize * 0.5);
  } else {
    characterPosition = previousPosition;
  }
  
  // Apply movement by rotating the planet
  if (moveDirection.lengthSq() > 0) {
    // Get camera-relative directions
    const cameraForward = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    cameraForward.y = 0;
    cameraForward.normalize();
    
    const cameraRight = new Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    cameraRight.y = 0;
    cameraRight.normalize();
    
    // Create rotation axis from movement direction
    let rotationAxis = new Vector3();
    let bunnyForward = new Vector3(); // Direction the bunny should face
    
    // Determine movement direction and bunny orientation
    if (moveDirection.z > 0) {
      // Forward (W/Up): Bunny faces away from camera (back to camera)
      rotationAxis.add(cameraRight.clone().multiplyScalar(-1));
      bunnyForward.copy(cameraForward.clone().negate()); // COMPLETELY REVERSED THIS
    } else if (moveDirection.z < 0) {
      // Backward (S/Down): Bunny faces toward camera
      rotationAxis.add(cameraRight.clone());
      bunnyForward.copy(cameraForward); // COMPLETELY REVERSED THIS
    }
    
    if (moveDirection.x < 0) {
      // Left (A/Left): Bunny shows left profile (faces right relative to camera)
      rotationAxis.add(cameraForward.clone().negate());
      bunnyForward.copy(cameraRight);
    } else if (moveDirection.x > 0) {
      // Right (D/Right): Bunny shows right profile (faces left relative to camera)
      rotationAxis.add(cameraForward.clone());
      bunnyForward.copy(cameraRight).negate();
    }
    
    // Apply planet rotation if there's movement
    if (rotationAxis.lengthSq() > 0) {
      rotationAxis.normalize();
      const rotationAngle = MOVE_SPEED;
      planetMesh.rotateOnWorldAxis(rotationAxis, -rotationAngle);
      
      // Recast ray to update position after rotation
      const recastRay = new THREE.Raycaster();
      recastRay.set(
        characterPosition.clone().normalize().multiplyScalar(1.5),
        characterPosition.clone().negate().normalize()
      );
      const recastHits = recastRay.intersectObject(planetMesh, false);
      
      if (recastHits.length > 0 && recastHits[0].distance < 3) {
        const newHitPoint = recastHits[0].point;
        characterPosition = newHitPoint.clone().normalize().multiplyScalar(newHitPoint.length() + newSize * 0.5);
      }
      
      // Orient the bunny
      if (character && bunnyForward.lengthSq() > 0) {
        // Define bunny's up direction (radial from planet center)
        const bunnyUp = characterPosition.clone().normalize();
        
        // Ensure bunnyForward is perpendicular to bunnyUp
        bunnyForward.sub(bunnyUp.clone().multiplyScalar(bunnyForward.dot(bunnyUp))).normalize();
        
        // Calculate right vector for proper orientation
        const bunnyRight = new Vector3().crossVectors(bunnyForward, bunnyUp).normalize();
        
        // Recalculate forward to ensure orthogonality
        bunnyForward.crossVectors(bunnyUp, bunnyRight).normalize();
        
        // Create rotation matrix with negation since model faces +Z
        const rotMatrix = new THREE.Matrix4().makeBasis(
          bunnyRight,
          bunnyUp,
          bunnyForward.clone().negate()
        );
        const targetRotation = new THREE.Quaternion().setFromRotationMatrix(rotMatrix);
        
        // Smoothly interpolate rotation
        characterRotation.slerp(targetRotation, 0.15);
      }
    }
  } else {
    // If no movement, use last direction for orientation but ensure up alignment
    const bunnyUp = characterPosition.clone().normalize();
    
    // Use lastMoveDirection to determine the forward direction 
    // when no movement keys are pressed
    let bunnyForward = new Vector3();
    
    // Get camera-relative directions for converting lastMoveDirection
    const cameraForward = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    cameraForward.y = 0;
    cameraForward.normalize();
    
    const cameraRight = new Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    cameraRight.y = 0;
    cameraRight.normalize();
    
    // Convert lastMoveDirection to world space
    if (lastMoveDirection.z > 0) {
      bunnyForward.copy(cameraForward.clone().negate());
    } else if (lastMoveDirection.z < 0) {
      bunnyForward.copy(cameraForward);
    }
    
    if (lastMoveDirection.x < 0) {
      bunnyForward.copy(cameraRight);
    } else if (lastMoveDirection.x > 0) {
      bunnyForward.copy(cameraRight).negate();
    }
    
    // Ensure bunnyForward is non-zero
    if (bunnyForward.lengthSq() < 0.01) {
      // Use current orientation as fallback
      bunnyForward = new Vector3(0, 0, 1).applyQuaternion(characterRotation);
    }
    
    // Ensure bunnyForward is perpendicular to bunnyUp
    bunnyForward.sub(bunnyUp.clone().multiplyScalar(bunnyForward.dot(bunnyUp))).normalize();
    
    // Calculate right vector for proper orientation
    const bunnyRight = new Vector3().crossVectors(bunnyForward, bunnyUp).normalize();
    
    // Recalculate forward to ensure orthogonality
    bunnyForward.crossVectors(bunnyUp, bunnyRight).normalize();
    
    // Create rotation matrix
    const rotMatrix = new THREE.Matrix4().makeBasis(bunnyRight, bunnyUp, bunnyForward.negate());
    const targetRotation = new THREE.Quaternion().setFromRotationMatrix(rotMatrix);
    
    // Smoothly interpolate rotation (using very small factor to maintain current orientation)
    characterRotation.slerp(targetRotation, 0.05);
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
      // Save last direction when key is pressed
      lastMoveDirection.set(0, 0, 1);
      break;
    case "ArrowDown":
    case "s":
      moveDirection.z = -1;
      // Save last direction when key is pressed
      lastMoveDirection.set(0, 0, -1);
      break;
    case "ArrowLeft":
    case "a":
      moveDirection.x = -1;
      // Save last direction when key is pressed
      lastMoveDirection.set(-1, 0, 0);
      break;
    case "ArrowRight":
    case "d":
      moveDirection.x = 1;
      // Save last direction when key is pressed
      lastMoveDirection.set(1, 0, 0);
      break;
    case " ":
      // Jump effect - make the bunny jump away from planet center
      if (!isJumping) {
        isJumping = true;
        
        // Calculate current character size for proper jump effect
        const camDistance = camera.position.distanceTo(characterPosition);
        let zoomFactor = Math.min(Math.max((camDistance - _.minDistance) / (_.maxDistance - _.minDistance), 0), 1);
        zoomFactor = Math.pow(zoomFactor, 0.7); // Apply non-linear scaling
        const currentSize = MIN_CHARACTER_SIZE + (MAX_CHARACTER_SIZE - MIN_CHARACTER_SIZE) * zoomFactor;
        
        // Set jump velocity in the direction away from planet center
        const jumpDirection = characterPosition.clone().normalize();
        const jumpDistance = 0.2 * (currentSize / BASE_CHARACTER_SIZE); // Increased jump height for bunny
        
        // Store initial character rotation
        const initialRotation = character ? character.quaternion.clone() : new THREE.Quaternion();
        
        // Animation loop for the jump
        let jumpTime = 0;
        const jumpDuration = 400; // Longer jump duration for bunny
        const jumpInterval = setInterval(() => {
          jumpTime += 16; // ~60fps
          
          // Parabolic jump motion
          const jumpProgress = jumpTime / jumpDuration;
          const heightFactor = 4 * jumpProgress * (1 - jumpProgress); // Parabolic curve that peaks at 0.5
          
          // Calculate jump offset (max at middle of jump)
          const offset = jumpDirection.clone().multiplyScalar(jumpDistance * heightFactor);
          
          // Process movement during jump
          if (character && planetMesh && moveDirection.lengthSq() > 0) {
            // Apply movement by rotating the planet, similar to updateCharacter
            // Get camera-relative directions
            const cameraForward = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
            cameraForward.y = 0;
            cameraForward.normalize();
            
            const cameraRight = new Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
            cameraRight.y = 0;
            cameraRight.normalize();
            
            // Create rotation axis from movement direction
            let rotationAxis = new Vector3();
            let bunnyForward = new Vector3(); // Direction the bunny should face
            
            // Determine movement direction and bunny orientation
            if (moveDirection.z > 0) {
              rotationAxis.add(cameraRight.clone().multiplyScalar(-1));
              bunnyForward.copy(cameraForward.clone().negate());
            } else if (moveDirection.z < 0) {
              rotationAxis.add(cameraRight.clone());
              bunnyForward.copy(cameraForward);
            }
            
            if (moveDirection.x < 0) {
              rotationAxis.add(cameraForward.clone().negate());
              bunnyForward.copy(cameraRight);
            } else if (moveDirection.x > 0) {
              rotationAxis.add(cameraForward.clone());
              bunnyForward.copy(cameraRight).negate();
            }
            
            // Apply planet rotation if there's movement
            if (rotationAxis.lengthSq() > 0) {
              rotationAxis.normalize();
              const airMoveFactor = 0.7; // Slightly reduced control in air
              const rotationAngle = MOVE_SPEED * airMoveFactor;
              planetMesh.rotateOnWorldAxis(rotationAxis, -rotationAngle);
              
              // Update characterPosition based on planet rotation
              // This will help maintain a consistent position relative to the planet
              const raycaster = new THREE.Raycaster();
              raycaster.set(
                characterPosition.clone().normalize().multiplyScalar(1.5),
                characterPosition.clone().negate().normalize()
              );
              const hits = raycaster.intersectObject(planetMesh, false);
              
              if (hits.length > 0 && hits[0].distance < 3) {
                const hitPoint = hits[0].point;
                characterPosition = hitPoint.clone().normalize().multiplyScalar(hitPoint.length() + currentSize * 0.5);
              }
              
              // Update character orientation to match movement direction
              if (bunnyForward.lengthSq() > 0) {
                // Define bunny's up direction (radial from planet center)
                const bunnyUp = characterPosition.clone().normalize();
                
                // Ensure bunnyForward is perpendicular to bunnyUp
                bunnyForward.sub(bunnyUp.clone().multiplyScalar(bunnyForward.dot(bunnyUp))).normalize();
                
                // Calculate right vector for proper orientation
                const bunnyRight = new Vector3().crossVectors(bunnyForward, bunnyUp).normalize();
                
                // Recalculate forward to ensure orthogonality
                bunnyForward.crossVectors(bunnyUp, bunnyRight).normalize();
                
                // Create rotation matrix with negation since model faces +Z
                const rotMatrix = new THREE.Matrix4().makeBasis(
                  bunnyRight,
                  bunnyUp,
                  bunnyForward.clone().negate()
                );
                const targetRotation = new THREE.Quaternion().setFromRotationMatrix(rotMatrix);
                
                // Combine with jump tilt
                const characterUp = characterPosition.clone().normalize();
                const tiltAxis = new THREE.Vector3().crossVectors(characterUp, new THREE.Vector3(0, 1, 0)).normalize();
                
                if (tiltAxis.lengthSq() > 0.01) {
                  let tiltAngle = 0;
                  if (jumpProgress < 0.5) {
                    tiltAngle = Math.PI * 0.15 * (jumpProgress * 2);
                  } else {
                    tiltAngle = Math.PI * 0.15 * (2 - jumpProgress * 2);
                  }
                  
                  const tiltQuaternion = new THREE.Quaternion().setFromAxisAngle(tiltAxis, tiltAngle);
                  targetRotation.multiply(tiltQuaternion);
                }
                
                // Apply smoothed rotation
                character.quaternion.slerp(targetRotation, 0.15);
              }
            }
          }
          
          // Apply jump offset to character position
          if (character) {
            // Add the jump offset to make character jump away from planet
            character.position.copy(characterPosition.clone().add(offset));
            
            // If not moving, apply default jump rotation
            if (moveDirection.lengthSq() === 0) {
              // Get the character's up vector (direction from planet center to character)
              const characterUp = characterPosition.clone().normalize();
              
              // Get camera-relative directions for orientation
              const cameraForward = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
              cameraForward.y = 0;
              cameraForward.normalize();
              
              const cameraRight = new Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
              cameraRight.y = 0;
              cameraRight.normalize();
              
              // Use lastMoveDirection for orientation
              let bunnyForward = new Vector3();
              
              // Convert lastMoveDirection to world space
              if (lastMoveDirection.z > 0) {
                bunnyForward.copy(cameraForward.clone().negate());
              } else if (lastMoveDirection.z < 0) {
                bunnyForward.copy(cameraForward);
              }
              
              if (lastMoveDirection.x < 0) {
                bunnyForward.copy(cameraRight);
              } else if (lastMoveDirection.x > 0) {
                bunnyForward.copy(cameraRight).negate();
              }
              
              // Ensure bunnyForward is non-zero
              if (bunnyForward.lengthSq() < 0.01) {
                // Use current orientation as fallback
                bunnyForward = new Vector3(0, 0, 1).applyQuaternion(initialRotation);
              }
              
              // Ensure bunnyForward is perpendicular to bunnyUp
              bunnyForward.sub(characterUp.clone().multiplyScalar(bunnyForward.dot(characterUp))).normalize();
              
              // Create proper orientation with tilt
              const bunnyRight = new Vector3().crossVectors(bunnyForward, characterUp).normalize();
              bunnyForward.crossVectors(characterUp, bunnyRight).normalize();
              
              // Create a rotation for the tilt while maintaining proper direction
              const tiltAxis = new Vector3().crossVectors(characterUp, bunnyForward).normalize();
              
              if (tiltAxis.lengthSq() > 0.01) {  // Ensure we have a valid rotation axis
                // Calculate tilt angle based on jump progress
                let tiltAngle = 0;
                
                if (jumpProgress < 0.5) {
                  // Forward tilt for ascent (0 to max)
                  tiltAngle = Math.PI * 0.15 * (jumpProgress * 2);
                } else {
                  // Backward tilt for descent (max to 0)
                  tiltAngle = Math.PI * 0.15 * (2 - jumpProgress * 2);
                }
                
                // Create rotation matrix and quaternion for proper orientation
                const rotMatrix = new THREE.Matrix4().makeBasis(
                  bunnyRight,
                  characterUp,
                  bunnyForward.clone().negate()
                );
                const directionRotation = new THREE.Quaternion().setFromRotationMatrix(rotMatrix);
                
                // Create tilt quaternion
                const tiltQuaternion = new THREE.Quaternion().setFromAxisAngle(tiltAxis, tiltAngle);
                
                // Combine direction and tilt
                directionRotation.multiply(tiltQuaternion);
                
                // Apply the combined rotation
                character.quaternion.copy(directionRotation);
              }
            }
          }
          
          if (jumpTime >= jumpDuration) {
            clearInterval(jumpInterval);
            isJumping = false;
            
            // Restore original rotation
            if (character) {
              // Smoothly return to the pre-jump rotation using characterRotation (which is updated in updateCharacter)
              character.quaternion.copy(characterRotation);
              
              // Reset any animation poses
              resetBunnyPose();
            }
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
    // Create a low poly bunny character
    character = new THREE.Group();
    
    // Create bunny body (elongated for bunny shape)
    const bodyGeometry = new THREE.CylinderGeometry(BASE_CHARACTER_SIZE * 0.5, BASE_CHARACTER_SIZE * 0.6, BASE_CHARACTER_SIZE * 1.2, 8);
    const bodyMaterial = new THREE.MeshStandardMaterial({ 
      color: 0xf5f5f5,  // White color
      roughness: 0.7,
      metalness: 0.1
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.name = "body"; // Add name for animation
    body.position.set(0, 0, 0);
    body.rotation.x = Math.PI / 2; // Rotate to align with forward direction
    body.castShadow = true;
    body.receiveShadow = true;
    character.add(body);
    
    // Create bunny head (slightly flatter)
    const headGeometry = new THREE.SphereGeometry(BASE_CHARACTER_SIZE * 0.5, 8, 6);
    const headMaterial = new THREE.MeshStandardMaterial({ 
      color: 0xf5f5f5,  // White color
      roughness: 0.7,
      metalness: 0.1
    });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.name = "head"; // Add name for animation
    head.position.set(0, BASE_CHARACTER_SIZE * 0.7, BASE_CHARACTER_SIZE * 0.6);
    head.scale.set(0.9, 0.8, 1);
    head.castShadow = true;
    head.receiveShadow = true;
    character.add(head);
    
    // Create bunny ears (tapered and longer)
    const earGeometry = new THREE.ConeGeometry(BASE_CHARACTER_SIZE * 0.15, BASE_CHARACTER_SIZE * 1, 5);
    const earMaterial = new THREE.MeshStandardMaterial({ 
      color: 0xe0e0e0,  // Slightly darker white for contrast
      roughness: 0.7,
      metalness: 0.1
    });
    
    // Left ear
    const leftEar = new THREE.Mesh(earGeometry, earMaterial);
    leftEar.name = "leftEar"; // Add name for animation
    leftEar.position.set(-BASE_CHARACTER_SIZE * 0.25, BASE_CHARACTER_SIZE * 1.2, BASE_CHARACTER_SIZE * 0.6);
    leftEar.rotation.z = Math.PI / 12;
    leftEar.castShadow = true;
    leftEar.receiveShadow = true;
    character.add(leftEar);
    
    // Right ear
    const rightEar = new THREE.Mesh(earGeometry, earMaterial);
    rightEar.name = "rightEar"; // Add name for animation
    rightEar.position.set(BASE_CHARACTER_SIZE * 0.25, BASE_CHARACTER_SIZE * 1.2, BASE_CHARACTER_SIZE * 0.6);
    rightEar.rotation.z = -Math.PI / 12;
    rightEar.castShadow = true;
    rightEar.receiveShadow = true;
    character.add(rightEar);
    
    // Create bunny tail (smaller and fluffier)
    const tailGeometry = new THREE.SphereGeometry(BASE_CHARACTER_SIZE * 0.2, 6, 6);
    const tailMaterial = new THREE.MeshStandardMaterial({ 
      color: 0xffffff,  // Bright white color
      roughness: 0.7,
      metalness: 0.1
    });
    const tail = new THREE.Mesh(tailGeometry, tailMaterial);
    tail.name = "tail"; // Add name for animation
    tail.position.set(0, BASE_CHARACTER_SIZE * 0.4, -BASE_CHARACTER_SIZE * 0.6);
    tail.castShadow = true;
    tail.receiveShadow = true;
    character.add(tail);
    
    // Create bunny nose
    const noseGeometry = new THREE.SphereGeometry(BASE_CHARACTER_SIZE * 0.08, 6, 6);
    const noseMaterial = new THREE.MeshStandardMaterial({ 
      color: 0xff9999,  // Pink color
      roughness: 0.7,
      metalness: 0.1
    });
    const nose = new THREE.Mesh(noseGeometry, noseMaterial);
    nose.name = "nose"; // Add name for animation
    nose.position.set(0, BASE_CHARACTER_SIZE * 0.7, BASE_CHARACTER_SIZE * 0.9);
    nose.castShadow = true;
    nose.receiveShadow = true;
    character.add(nose);
    
    // Create bunny eyes
    const eyeGeometry = new THREE.SphereGeometry(BASE_CHARACTER_SIZE * 0.06, 6, 6);
    const eyeMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x000000,  // Black color
      roughness: 0.5,
      metalness: 0.2
    });
    
    // Left eye
    const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    leftEye.name = "leftEye"; // Add name for animation
    leftEye.position.set(-BASE_CHARACTER_SIZE * 0.15, BASE_CHARACTER_SIZE * 0.8, BASE_CHARACTER_SIZE * 0.85);
    leftEye.castShadow = true;
    leftEye.receiveShadow = true;
    character.add(leftEye);
    
    // Right eye
    const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    rightEye.name = "rightEye"; // Add name for animation
    rightEye.position.set(BASE_CHARACTER_SIZE * 0.15, BASE_CHARACTER_SIZE * 0.8, BASE_CHARACTER_SIZE * 0.85);
    rightEye.castShadow = true;
    rightEye.receiveShadow = true;
    character.add(rightEye);
    
    // Add whiskers (simple lines)
    const whiskerMaterial = new THREE.LineBasicMaterial({ color: 0xaaaaaa });
    
    // Left whiskers
    const leftWhisker1Geometry = new THREE.BufferGeometry().setFromPoints([
      new Vector3(-BASE_CHARACTER_SIZE * 0.2, BASE_CHARACTER_SIZE * 0.7, BASE_CHARACTER_SIZE * 0.9),
      new Vector3(-BASE_CHARACTER_SIZE * 0.4, BASE_CHARACTER_SIZE * 0.65, BASE_CHARACTER_SIZE * 0.9)
    ]);
    const leftWhisker1 = new THREE.Line(leftWhisker1Geometry, whiskerMaterial);
    leftWhisker1.name = "leftWhisker1"; // Add name for animation
    character.add(leftWhisker1);
    
    const leftWhisker2Geometry = new THREE.BufferGeometry().setFromPoints([
      new Vector3(-BASE_CHARACTER_SIZE * 0.2, BASE_CHARACTER_SIZE * 0.7, BASE_CHARACTER_SIZE * 0.9),
      new Vector3(-BASE_CHARACTER_SIZE * 0.4, BASE_CHARACTER_SIZE * 0.75, BASE_CHARACTER_SIZE * 0.9)
    ]);
    const leftWhisker2 = new THREE.Line(leftWhisker2Geometry, whiskerMaterial);
    leftWhisker2.name = "leftWhisker2"; // Add name for animation
    character.add(leftWhisker2);
    
    // Right whiskers
    const rightWhisker1Geometry = new THREE.BufferGeometry().setFromPoints([
      new Vector3(BASE_CHARACTER_SIZE * 0.2, BASE_CHARACTER_SIZE * 0.7, BASE_CHARACTER_SIZE * 0.9),
      new Vector3(BASE_CHARACTER_SIZE * 0.4, BASE_CHARACTER_SIZE * 0.65, BASE_CHARACTER_SIZE * 0.9)
    ]);
    const rightWhisker1 = new THREE.Line(rightWhisker1Geometry, whiskerMaterial);
    rightWhisker1.name = "rightWhisker1"; // Add name for animation
    character.add(rightWhisker1);
    
    const rightWhisker2Geometry = new THREE.BufferGeometry().setFromPoints([
      new Vector3(BASE_CHARACTER_SIZE * 0.2, BASE_CHARACTER_SIZE * 0.7, BASE_CHARACTER_SIZE * 0.9),
      new Vector3(BASE_CHARACTER_SIZE * 0.4, BASE_CHARACTER_SIZE * 0.75, BASE_CHARACTER_SIZE * 0.9)
    ]);
    const rightWhisker2 = new THREE.Line(rightWhisker2Geometry, whiskerMaterial);
    rightWhisker2.name = "rightWhisker2"; // Add name for animation
    character.add(rightWhisker2);
    
    // Create bunny feet (more defined)
    const footGeometry = new THREE.SphereGeometry(BASE_CHARACTER_SIZE * 0.2, 6, 6);
    const footMaterial = new THREE.MeshStandardMaterial({ 
      color: 0xf0f0f0,  // Slightly darker white
      roughness: 0.7,
      metalness: 0.1
    });
    
    // Front left foot
    const frontLeftFoot = new THREE.Mesh(footGeometry, footMaterial);
    frontLeftFoot.name = "frontLeftFoot"; // Add name for animation
    frontLeftFoot.position.set(-BASE_CHARACTER_SIZE * 0.3, -BASE_CHARACTER_SIZE * 0.4, BASE_CHARACTER_SIZE * 0.4);
    frontLeftFoot.scale.set(0.8, 0.6, 1.2);
    frontLeftFoot.castShadow = true;
    frontLeftFoot.receiveShadow = true;
    character.add(frontLeftFoot);
    
    // Front right foot
    const frontRightFoot = new THREE.Mesh(footGeometry, footMaterial);
    frontRightFoot.name = "frontRightFoot"; // Add name for animation
    frontRightFoot.position.set(BASE_CHARACTER_SIZE * 0.3, -BASE_CHARACTER_SIZE * 0.4, BASE_CHARACTER_SIZE * 0.4);
    frontRightFoot.scale.set(0.8, 0.6, 1.2);
    frontRightFoot.castShadow = true;
    frontRightFoot.receiveShadow = true;
    character.add(frontRightFoot);
    
    // Back left foot
    const backLeftFoot = new THREE.Mesh(footGeometry, footMaterial);
    backLeftFoot.name = "backLeftFoot"; // Add name for animation
    backLeftFoot.position.set(-BASE_CHARACTER_SIZE * 0.3, -BASE_CHARACTER_SIZE * 0.4, -BASE_CHARACTER_SIZE * 0.4);
    backLeftFoot.scale.set(0.8, 0.6, 1.2);
    backLeftFoot.castShadow = true;
    backLeftFoot.receiveShadow = true;
    character.add(backLeftFoot);
    
    // Back right foot
    const backRightFoot = new THREE.Mesh(footGeometry, footMaterial);
    backRightFoot.name = "backRightFoot"; // Add name for animation
    backRightFoot.position.set(BASE_CHARACTER_SIZE * 0.3, -BASE_CHARACTER_SIZE * 0.4, -BASE_CHARACTER_SIZE * 0.4);
    backRightFoot.scale.set(0.8, 0.6, 1.2);
    backRightFoot.castShadow = true;
    backRightFoot.receiveShadow = true;
    character.add(backRightFoot);
    
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
    
    console.log("Improved bunny character created and added to scene");
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
        let zoomFactor = Math.min(Math.max((camDistance - _.minDistance) / (_.maxDistance - _.minDistance), 0), 1);
        zoomFactor = Math.pow(zoomFactor, 0.7); // Apply non-linear scaling
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

// Function to update the running animation
function updateRunningAnimation() {
  if (!character || isJumping || moveDirection.lengthSq() === 0) {
    // Reset animation when not moving
    resetBunnyPose();
    return;
  }

  const speedFactor = MOVE_SPEED / BASE_MOVE_SPEED; // Scale animation speed with movement
  const cycleTime = animationTime * speedFactor * 2; // Slower cycle for gentler hop (reduced from 5)

  // Access bunny parts
  const body = character.getObjectByName("body");
  const head = character.getObjectByName("head");
  const leftEar = character.getObjectByName("leftEar");
  const rightEar = character.getObjectByName("rightEar");
  const frontLeftFoot = character.getObjectByName("frontLeftFoot");
  const frontRightFoot = character.getObjectByName("frontRightFoot");
  const backLeftFoot = character.getObjectByName("backLeftFoot");
  const backRightFoot = character.getObjectByName("backRightFoot");

  if (!body || !head || !leftEar || !rightEar || !frontLeftFoot || !frontRightFoot || !backLeftFoot || !backRightFoot) {
    return; // Skip if any part is missing
  }

  // Calculate hop cycle with smoother easing curve for gentler motion
  // Use a modified sine wave that's smoother at the bottom and more gentle at the top
  const rawHopCycle = Math.sin(cycleTime);
  
  // Apply cubic easing to create a more gentle hop
  // This smooths the transitions at the bottom of the hop
  const hopCycle = rawHopCycle > 0 ? Math.pow(rawHopCycle, 2) : 0;
  
  // Reduce hop height for subtler motion (reduced from 0.07 to 0.04)
  const hopHeight = hopCycle * 0.04 * BASE_CHARACTER_SIZE;
  
  // Add hop offset to character's position - lifting entire character during hop
  if (character && characterPosition) {
    const upDirection = characterPosition.clone().normalize();
    const characterHopOffset = upDirection.multiplyScalar(hopHeight);
    character.position.copy(characterPosition.clone().add(characterHopOffset));
  }

  // Body bounce and tilt with gentler amplitude
  const bounce = hopCycle * 0.02 * BASE_CHARACTER_SIZE; // Reduced amplitude
  body.position.y = bounce;
  body.rotation.x = Math.PI / 2 + Math.sin(cycleTime) * 0.05; // Reduced tilt

  // Head bob with gentler motion, slightly leading the body
  head.position.y = BASE_CHARACTER_SIZE * 0.7 + bounce * 0.5;
  head.rotation.x = Math.sin(cycleTime + Math.PI / 4) * 0.03; // Reduced rotation

  // Subtle ear flop
  leftEar.rotation.z = Math.PI / 12 + Math.sin(cycleTime - 0.2) * 0.1; // Reduced flop amplitude
  rightEar.rotation.z = -Math.PI / 12 - Math.sin(cycleTime - 0.2) * 0.1;

  // Gentler leg animation for hopping motion
  const legCycle = Math.sin(cycleTime);
  const legLift = Math.max(0, legCycle) * 0.15 * BASE_CHARACTER_SIZE; // Reduced lift height
  
  // Front legs movement
  const frontLegPhase = Math.max(0, Math.sin(cycleTime));
  frontLeftFoot.position.y = -BASE_CHARACTER_SIZE * 0.4 + legLift * 0.6;
  frontLeftFoot.rotation.x = frontLegPhase * 0.3; // Reduced rotation
  
  frontRightFoot.position.y = -BASE_CHARACTER_SIZE * 0.4 + legLift * 0.6;
  frontRightFoot.rotation.x = frontLegPhase * 0.3;

  // Back legs provide the main hopping force
  // Slightly delayed from front legs for natural movement sequence
  const backLegPhase = Math.max(0, Math.sin(cycleTime - 0.3));
  const backLegLift = backLegPhase * 0.2 * BASE_CHARACTER_SIZE; // Reduced lift
  
  backLeftFoot.position.y = -BASE_CHARACTER_SIZE * 0.4 + backLegLift;
  backLeftFoot.rotation.x = -backLegPhase * 0.4; // Reduced rotation
  
  backRightFoot.position.y = -BASE_CHARACTER_SIZE * 0.4 + backLegLift;
  backRightFoot.rotation.x = -backLegPhase * 0.4;
  
  // Very subtle tail wiggle during hop
  const tail = character.getObjectByName("tail");
  if (tail) {
    tail.rotation.y = Math.sin(cycleTime * 1.5) * 0.1; // Reduced wiggle
  }
}

// Function to reset bunny pose to default
function resetBunnyPose() {
  if (!character) return;

  const body = character.getObjectByName("body");
  const head = character.getObjectByName("head");
  const leftEar = character.getObjectByName("leftEar");
  const rightEar = character.getObjectByName("rightEar");
  const frontLeftFoot = character.getObjectByName("frontLeftFoot");
  const frontRightFoot = character.getObjectByName("frontRightFoot");
  const backLeftFoot = character.getObjectByName("backLeftFoot");
  const backRightFoot = character.getObjectByName("backRightFoot");

  if (!body || !head || !leftEar || !rightEar || !frontLeftFoot || !frontRightFoot || !backLeftFoot || !backRightFoot) {
    return; // Skip if any part is missing
  }

  body.position.y = 0;
  body.rotation.x = Math.PI / 2; // Keep the cylinder aligned with forward direction
  head.position.y = BASE_CHARACTER_SIZE * 0.7;
  head.rotation.x = 0;
  leftEar.rotation.z = Math.PI / 12;
  rightEar.rotation.z = -Math.PI / 12;
  frontLeftFoot.position.y = -BASE_CHARACTER_SIZE * 0.4;
  frontLeftFoot.rotation.x = 0;
  frontRightFoot.position.y = -BASE_CHARACTER_SIZE * 0.4;
  frontRightFoot.rotation.x = 0;
  backLeftFoot.position.y = -BASE_CHARACTER_SIZE * 0.4;
  backLeftFoot.rotation.x = 0;
  backRightFoot.position.y = -BASE_CHARACTER_SIZE * 0.4;
  backRightFoot.rotation.x = 0;
}
