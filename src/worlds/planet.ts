import {
  BufferGeometry,
  Float32BufferAttribute,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  Vector3,
  IcosahedronGeometry,
} from "three";
import { Biome, type BiomeOptions } from "./biome";
import { loadModels } from "./models";

import { PlanetMaterialWithCaustics } from "./materials/OceanCausticsMaterial";
import { createAtmosphereMaterial } from "./materials/AtmosphereMaterial";
import { createBufferGeometry } from "./helper/helper";

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
    console.log("Received message from worker:", event.data.type);
    const { requestId } = event.data;

    const callback = this.callbacks[requestId];
    if (!callback) {
      console.error("No callback found for requestId:", requestId);
      return;
    }

    if (event.data.type === "error") {
      console.error("Worker reported an error:", event.data.error);
      // Create a simple sphere as fallback
      const geometry = new IcosahedronGeometry(1, 4);
      const material = new MeshStandardMaterial({ color: 0x00ff00 });
      const mesh = new Mesh(geometry, material);
      callback(mesh);
      delete this.callbacks[requestId];
      return;
    }

    const data = event.data.data!;
    
    const geometry = createGeometryFromData(
      data.positions,
      data.colors,
      data.normals,
    );

    const oceanGeometry = createGeometryFromData(
      data.oceanPositions,
      data.oceanColors,
      data.oceanNormals,
    );

    oceanGeometry.morphAttributes.position = [
      new Float32BufferAttribute(data.oceanMorphPositions, 3),
    ];
    oceanGeometry.morphAttributes.normal = [
      new Float32BufferAttribute(data.oceanMorphNormals, 3),
    ];

    this.vegetationPositions = data.vegetation;

    const materialOptions = { vertexColors: true };

    const material =
      this.options.material === "caustics"
        ? new PlanetMaterialWithCaustics({
            ...materialOptions,
            shape: this.shape,
          })
        : new MeshStandardMaterial(materialOptions);

    const planetMesh = new Mesh(geometry, material);
    planetMesh.castShadow = true;

    if (this.options.material === "caustics") {
      planetMesh.onBeforeRender = (
        renderer,
        scene,
        camera,
        geometry,
        material,
      ) => {
        if (material instanceof PlanetMaterialWithCaustics) {
          material.update();
        }
      };
    }

    const oceanMesh = new Mesh(
      oceanGeometry,
      new MeshStandardMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.7,
        metalness: 0.5,
        roughness: 0.5,
      }),
    );

    planetMesh.add(oceanMesh);
    oceanMesh.onBeforeRender = (
      renderer,
      scene,
      camera,
      geometry,
      material,
    ) => {
      // update morph targets
      if (oceanMesh.morphTargetInfluences)
        oceanMesh.morphTargetInfluences[0] =
          Math.sin(performance.now() / 1000) * 0.5 + 0.5;
    };

    if (this.options.atmosphere?.enabled !== false) {
      this.addAtmosphere(planetMesh);
    }
    callback(planetMesh);

    delete this.callbacks[requestId];
  }

  async create(): Promise<Mesh> {
    // let collection = "stylized_nature";

    const models = this.biomeOptions.vegetation?.items.map((item) => {
      return item.name;
    });

    const loaded: Promise<Object3D[] | Mesh>[] = [];

    // Skip model loading for local development to avoid errors
    console.log("Skipping vegetation model loading for local development");
    
    const planetPromise = this.createMesh();
    loaded.push(planetPromise);

    await Promise.all(loaded);

    const planet = await planetPromise;

    // Skip vegetation placement since we're not loading models
    
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
    item.position.copy(pos);

    if (this.shape === "sphere") {
      const a = item.up.clone().normalize();
      const b = pos.clone().normalize();

      this.tempQuaternion.setFromUnitVectors(a, b);

      item.quaternion.copy(this.tempQuaternion);

      item.up = b;
    }
  }
}
