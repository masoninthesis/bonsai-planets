import {
  BufferGeometry,
  Float32BufferAttribute,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  Vector3,
  IcosahedronGeometry,
  SphereGeometry,
  MeshBasicMaterial
} from "three";
import { Biome, type BiomeOptions } from "./biome";
import { loadModels } from "./models";

import { PlanetMaterialWithCaustics } from "./materials/OceanCausticsMaterial";
import { createAtmosphereMaterial } from "./materials/AtmosphereMaterial";
import { createBufferGeometry } from "./helper/helper";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

// Helper function to handle both ArrayBuffer and regular arrays
function createGeometryFromData(positions: ArrayBuffer | number[], colors: ArrayBuffer | number[], normals: ArrayBuffer | number[]) {
  // Check if we're dealing with ArrayBuffer or regular arrays
  if (positions instanceof ArrayBuffer) {
    return createBufferGeometry(
      positions as unknown as number[], 
      colors as unknown as number[], 
      normals as unknown as number[]
    );
  } else {
    // Create a new buffer geometry
    const geometry = new BufferGeometry();
    
    // Add attributes
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
    geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
    
    return geometry;
  }
}

export type PlanetOptions = {
  scatter?: number;

  ground?: number;

  detail?: number;

  atmosphere?: {
    enabled?: boolean;
    color?: Vector3;
    height?: number;
  };

  material?: "normal" | "caustics";

  biome?: BiomeOptions;

  shape?: "sphere" | "plane";
};

export class Planet {
  worker: Worker;

  callbacks: Record<number, (data: Mesh) => void>;
  requestId: number;

  biome: Biome;

  biomeOptions: BiomeOptions;
  options: PlanetOptions;

  vegetationPositions?: Record<string, Vector3[]>;

  shape: "sphere" | "plane" = "sphere";

  tempQuaternion = new Quaternion();

  constructor(options: PlanetOptions = {}) {
    this.shape = options.shape ?? this.shape;
    options.shape = this.shape;

    this.options = options;

    this.biome = new Biome(options.biome);
    this.biomeOptions = this.biome.options;

    console.log("Creating web worker for planet generation");
    this.worker = new Worker(new URL("worker.ts", import.meta.url), {
      type: "module",
    });
    this.worker.onmessage = this.handleMessage.bind(this);
    this.callbacks = {};
    this.requestId = 0;
    console.log("Web worker created");
  }

  handleMessage(event: {
    data: {
      type: "geometry" | "error";
      data?: {
        positions: number[];
        colors: number[];
        normals: number[];
        oceanPositions: number[];
        oceanColors: number[];
        oceanNormals: number[];
        vegetation: Record<string, Vector3[]>;
        oceanMorphPositions: number[];
        oceanMorphNormals: number[];
      };
      error?: string;
      requestId: number;
    };
  }) {
    const { type, data, requestId, error } = event.data;
    console.log("Planet received message:", type, "requestId:", requestId);

    if (type === "error") {
      console.error("Error in worker:", error);
      if (this.callbacks[requestId]) {
        this.callbacks[requestId](new Mesh());
        delete this.callbacks[requestId];
      }
      return;
    }

    if (!data) {
      console.error("No data in message");
      return;
    }

    const geometry = createGeometryFromData(
      data.positions,
      data.colors,
      data.normals
    );

    const oceanGeometry = createGeometryFromData(
      data.oceanPositions,
      data.oceanColors,
      data.oceanNormals
    );

    // Add morph targets to ocean geometry
    oceanGeometry.morphAttributes.position = [
      new Float32BufferAttribute(
        data.oceanMorphPositions instanceof ArrayBuffer
          ? new Float32Array(data.oceanMorphPositions)
          : data.oceanMorphPositions,
        3
      ),
    ];
    oceanGeometry.morphAttributes.normal = [
      new Float32BufferAttribute(
        data.oceanMorphNormals instanceof ArrayBuffer
          ? new Float32Array(data.oceanMorphNormals)
          : data.oceanMorphNormals,
        3
      ),
    ];

    // Create materials
    let material: MeshStandardMaterial;
    let oceanMaterial: MeshStandardMaterial;

    if (this.options.material === "caustics") {
      const causticsMaterial = new PlanetMaterialWithCaustics({
        vertexColors: true,
        transparent: true,
        opacity: 0.8,
        roughness: 0.2,
        shape: this.shape,
      });
      oceanMaterial = causticsMaterial;
      material = new MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.8,
      });
    } else {
      material = new MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.8,
      });
      oceanMaterial = new MeshStandardMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.8,
        roughness: 0.2,
      });
    }

    // Create meshes
    const mesh = new Mesh(geometry, material);
    const oceanMesh = new Mesh(oceanGeometry, oceanMaterial);
    oceanMesh.morphTargetInfluences = [0];

    // Add ocean mesh as a child
    mesh.add(oceanMesh);

    // Store vegetation positions for later use
    this.vegetationPositions = data.vegetation;

    // Load and place vegetation models
    this.placeVegetation(mesh).then(() => {
      console.log("Vegetation placed");
    });

    // Add atmosphere if enabled
    if (this.options.atmosphere?.enabled) {
      this.addAtmosphere(mesh);
    }

    // Call callback
    if (this.callbacks[requestId]) {
      this.callbacks[requestId](mesh);
      delete this.callbacks[requestId];
    }
  }

  async create(): Promise<Mesh> {
    // let collection = "stylized_nature";

    const models = this.biomeOptions.vegetation?.items.map((item) => {
      return item.name;
    });

    const loaded: Promise<Object3D[] | Mesh>[] = [];

    // Load the planet mesh
    const planetPromise = this.createMesh();
    loaded.push(planetPromise);

    await Promise.all(loaded);

    const planet = await planetPromise;
    
    return planet;
  }

  async createMesh(): Promise<Mesh> {
    console.log("Creating mesh, sending message to worker");
    return new Promise((resolve) => {
      const requestId = this.requestId++;
      this.callbacks[requestId] = resolve;

      this.worker.postMessage({
        type: "createGeometry",
        requestId,
        data: this.options,
      });
      console.log("Message sent to worker with requestId:", requestId);
    });
  }

  addAtmosphere(planet: Mesh) {
    // Create the atmosphere geometry
    const atmosphereGeometry = new IcosahedronGeometry(
      this.options.atmosphere?.height ?? 1.2,
      this.options.detail ?? 20,
    );
    const atmosphere = new Mesh(
      atmosphereGeometry,
      createAtmosphereMaterial(this.options.atmosphere?.color),
    );
    atmosphere.renderOrder = 1;
    planet.add(atmosphere);
  }

  updatePosition(item: Object3D, pos: Vector3) {
    console.log(`Positioning model at: ${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)}`);
    
    item.position.copy(pos);

    if (this.shape === "sphere") {
      const a = item.up.clone().normalize();
      const b = pos.clone().normalize();

      this.tempQuaternion.setFromUnitVectors(a, b);

      item.quaternion.copy(this.tempQuaternion);

      item.up = b;
    }
  }

  // Add a new method to load and place vegetation models
  async placeVegetation(planet: Mesh): Promise<void> {
    if (!this.vegetationPositions) {
      console.log("No vegetation positions");
      return;
    }

    console.log("Placing vegetation with positions:", Object.keys(this.vegetationPositions).map(key => 
      `${key}: ${this.vegetationPositions![key].length} positions`
    ));
    
    // Check if there are any positions at all
    const totalPositions = Object.values(this.vegetationPositions).reduce((sum, positions) => sum + positions.length, 0);
    console.log(`Total vegetation positions: ${totalPositions}`);
    
    if (totalPositions === 0) {
      console.log("No vegetation positions found in any category, adding manual models");
      await this.addManualModels(planet);
      return;
    }
    
    // Load models for each vegetation type
    const modelPromises: Promise<void>[] = [];
    
    for (const [name, positions] of Object.entries(this.vegetationPositions)) {
      if (positions.length === 0) {
        continue;
      }
      
      console.log(`Loading ${positions.length} instances of ${name}`);
      
      const promise = loadModels(name)
        .then((models) => {
          if (models.length === 0) {
            console.warn(`No models loaded for ${name}`);
            return;
          }
          
          console.log(`Successfully loaded ${models.length} variants of ${name}, placing on planet`);
          
          // Place each instance of this vegetation type
          positions.forEach((position, index) => {
            // Choose a random model variant
            const modelIndex = Math.floor(Math.random() * models.length);
            const model = models[modelIndex].clone();
            
            // Scale the model down to fit the planet
            let scale = 0.025; // Default scale
            
            // Make rocks smaller
            if (name.includes("Rock")) {
              scale = 0.001; // Much smaller scale for rocks
            }
            
            model.scale.set(scale, scale, scale);
            
            // Position and orient the model
            this.updatePosition(model, position);
            
            // Add to the planet
            planet.add(model);
            
            // Log every 10th model placement for debugging
            if (index % 10 === 0) {
              console.log(`Placed model ${index} of ${name} at position:`, position);
            }
          });
          
          console.log(`Placed ${positions.length} instances of ${name}`);
        })
        .catch((error) => {
          console.error(`Error loading models for ${name}:`, error);
        });
      
      modelPromises.push(promise);
    }
    
    // Wait for all models to be loaded and placed
    await Promise.all(modelPromises);
    
    // Log the total number of children on the planet
    console.log(`Planet now has ${planet.children.length} children`);
  }
  
  // Add a method to manually place models on the planet
  async addManualModels(planet: Mesh): Promise<void> {
    console.log("Adding manual models to the planet");
    
    // Define positions around the planet
    const positions: Vector3[] = [];
    
    // Add more positions around the planet (60 total)
    for (let i = 0; i < 60; i++) {
      const x = Math.random() * 2 - 1;
      const y = Math.random() * 2 - 1;
      const z = Math.random() * 2 - 1;
      positions.push(new Vector3(x, y, z).normalize());
    }
    
    try {
      // Load models directly using GLTFLoader
      const loader = new GLTFLoader();
      
      // Determine which models to load based on the planet type
      let treeModelPath = "/lowpoly_nature/PineTree_1.gltf";
      let secondaryTreePath = "/lowpoly_nature/CommonTree_1.gltf";
      let thirdTreePath = "/lowpoly_nature/Willow_1.gltf";
      
      // Check the biome type to determine which models to use
      if (this.biomeOptions.preset === "beach") {
        treeModelPath = "/lowpoly_nature/PalmTree_1.gltf";
        secondaryTreePath = "/lowpoly_nature/PalmTree_2.gltf";
        thirdTreePath = "/lowpoly_nature/Bush_1.gltf";
      } else if (this.biomeOptions.preset === "snowForest") {
        treeModelPath = "/lowpoly_nature/PineTree_Snow_1.gltf";
        secondaryTreePath = "/lowpoly_nature/CommonTree_Snow_1.gltf";
        thirdTreePath = "/lowpoly_nature/Willow_Snow_1.gltf";
      }
      
      // Load primary tree model
      const primaryTreePromise = new Promise<Object3D>((resolve, reject) => {
        loader.load(
          treeModelPath,
          (gltf) => {
            console.log(`Loaded primary tree model: ${treeModelPath}`);
            resolve(gltf.scene);
          },
          undefined,
          (error) => {
            console.error(`Error loading primary tree model: ${error}`);
            reject(error);
          }
        );
      });
      
      // Load secondary tree model
      const secondaryTreePromise = new Promise<Object3D>((resolve, reject) => {
        loader.load(
          secondaryTreePath,
          (gltf) => {
            console.log(`Loaded secondary tree model: ${secondaryTreePath}`);
            resolve(gltf.scene);
          },
          undefined,
          (error) => {
            console.error(`Error loading secondary tree model: ${error}`);
            reject(error);
          }
        );
      });
      
      // Load third tree model
      const thirdTreePromise = new Promise<Object3D>((resolve, reject) => {
        loader.load(
          thirdTreePath,
          (gltf) => {
            console.log(`Loaded third tree model: ${thirdTreePath}`);
            resolve(gltf.scene);
          },
          undefined,
          (error) => {
            console.error(`Error loading third tree model: ${error}`);
            reject(error);
          }
        );
      });
      
      // Load rock model
      const rockPromise = new Promise<Object3D>((resolve, reject) => {
        loader.load(
          "/lowpoly_nature/Rock_1.gltf",
          (gltf) => {
            console.log("Loaded rock model");
            resolve(gltf.scene);
          },
          undefined,
          (error) => {
            console.error("Error loading rock model:", error);
            reject(error);
          }
        );
      });
      
      // Wait for all models to load
      const [primaryTree, secondaryTree, thirdTree, rock] = await Promise.all([
        primaryTreePromise,
        secondaryTreePromise,
        thirdTreePromise,
        rockPromise
      ]);
      
      // Place models on the planet
      positions.forEach((position, index) => {
        let model: Object3D;
        
        // Choose model based on index
        if (index < 20) {
          model = primaryTree.clone();
          model.scale.set(0.025, 0.025, 0.025);
        } else if (index < 40) {
          model = secondaryTree.clone();
          model.scale.set(0.025, 0.025, 0.025);
        } else if (index < 58) {
          model = thirdTree.clone();
          model.scale.set(0.025, 0.025, 0.025);
        } else {
          model = rock.clone();
          model.scale.set(0.001, 0.001, 0.001); // Smaller rocks
        }
        
        // Position and orient the model
        const normalizedPosition = position.clone().normalize();
        model.position.copy(normalizedPosition);
        
        // Orient the model to face outward from the sphere center
        const up = new Vector3(0, 1, 0);
        const quaternion = new Quaternion().setFromUnitVectors(up, normalizedPosition);
        model.quaternion.copy(quaternion);
        
        // Add to the planet
        planet.add(model);
      });
      
      console.log(`Added ${positions.length} models to the planet`);
      console.log(`Planet now has ${planet.children.length} children after manual placement`);
      
    } catch (error) {
      console.error("Error adding manual models:", error);
    }
  }
}
