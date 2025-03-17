import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Planet } from "./worlds/planet";
import { Stars } from "./worlds/stars";
import { planetPresets } from "./worlds/presets";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Mesh } from "three";

const presets = ["beach", "forest", "snowForest"];

const width = window.innerWidth,
  height = window.innerHeight;

const canvas = document.getElementById("root");

if (!canvas) {
  throw new Error("Canvas not found");
}
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, width / height, 0.01, 30);
camera.position.set(0, 0, 2.5);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  canvas,
  alpha: true,
});

renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;

const _ = new OrbitControls(camera, renderer.domElement);

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

let total = 0;
let lastDelta = 0;

let rotate = true;

renderer.setAnimationLoop((delta) => {
  renderer.render(scene, camera);

  if (rotate) planetMesh.rotation.y += 0.001;

  if (lastDelta > 0) {
    total += delta - lastDelta;
  }
  lastDelta = delta;

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
});

let stars = new Stars();

scene.add(stars);

// add keydown event listener
document.addEventListener("keydown", (event) => {
  if (event.key === "1") {
    createPlanet("beach");
  } else if (event.key === "2") {
    createPlanet("forest");
  } else if (event.key === "3") {
    createPlanet("snowForest");
  }

  if (event.key === " ") {
    rotate = !rotate;
  }
});

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

async function createPlanet(preset: string | undefined = undefined) {
  if (!preset) {
    preset = presets[Math.floor(Math.random() * presets.length)];
  }

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
    
    // Manually add models to the planet if needed
    if (mesh.children.length < 3) { // Only ocean and atmosphere
      console.log("No vegetation detected, manually adding models");
      await planet.addManualModels(mesh);
    }
    
    // Directly add a model to the scene as a test
    const loader = new GLTFLoader();
    loader.load(
      "/lowpoly_nature/PineTree_1.gltf",
      (gltf) => {
        console.log("Loaded test model");
        const model = gltf.scene;
        model.scale.set(0.025, 0.025, 0.025);
        model.position.set(0, 1.5, 0);
        scene.add(model);
        console.log("Added test model to scene");
      },
      undefined,
      (error) => {
        console.error("Error loading test model:", error);
      }
    );
    
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
