import {
  IcosahedronGeometry,
  Vector3,
  BufferAttribute,
  Float32BufferAttribute,
  Color,
  PlaneGeometry,
  BufferGeometry,
} from "three";

import { Biome } from "./biome";
import { type PlanetOptions } from "./planet";
import UberNoise from "uber-noise";
import { type VertexInfo } from "./types";

onmessage = function (e) {
  const { type, data, requestId } = e.data;
  console.log("Worker received message:", type, "requestId:", requestId);

  if (type === "createGeometry") {
    console.log("Creating geometry with options:", data);
    try {
      const [geometry, oceanGeometry, vegetation] = createGeometry(data);
      console.log("Geometry created, sending back to main thread");

      const positions = geometry.getAttribute("position").array.buffer;
      const colors = geometry.getAttribute("color").array.buffer;
      const normals = geometry.getAttribute("normal").array.buffer;

      const oceanPositions = oceanGeometry.getAttribute("position").array.buffer;
      const oceanColors = oceanGeometry.getAttribute("color").array.buffer;
      const oceanNormals = oceanGeometry.getAttribute("normal").array.buffer;
      const oceanMorphPositions =
        oceanGeometry.morphAttributes.position[0].array.buffer;
      const oceanMorphNormals =
        oceanGeometry.morphAttributes.normal[0].array.buffer;

      try {
        postMessage(
          {
            type: "geometry",
            data: {
              positions,
              colors,
              normals,
              oceanPositions,
              oceanColors,
              oceanNormals,
              vegetation,
              oceanMorphPositions,
              oceanMorphNormals,
            },
            requestId,
          },
          // @ts-expect-error - hmm
          [
            positions,
            colors,
            normals,
            oceanPositions,
            oceanColors,
            oceanNormals,
            oceanMorphPositions,
            oceanMorphNormals,
          ],
        );
      } catch (transferError) {
        console.error("Error transferring buffers:", transferError);
        // Try without transferable objects
        postMessage({
          type: "geometry",
          data: {
            positions: Array.from(new Float32Array(positions)),
            colors: Array.from(new Float32Array(colors)),
            normals: Array.from(new Float32Array(normals)),
            oceanPositions: Array.from(new Float32Array(oceanPositions)),
            oceanColors: Array.from(new Float32Array(oceanColors)),
            oceanNormals: Array.from(new Float32Array(oceanNormals)),
            vegetation,
            oceanMorphPositions: Array.from(new Float32Array(oceanMorphPositions)),
            oceanMorphNormals: Array.from(new Float32Array(oceanMorphNormals)),
          },
          requestId,
        });
      }
    } catch (error) {
      console.error("Error in worker while creating geometry:", error);
      postMessage({
        type: "error",
        error: error instanceof Error ? error.message : String(error),
        requestId,
      });
    }
  } else {
    console.error("Unknown message type", type);
  }
};

function createGeometry(
  planetOptions: PlanetOptions,
): [BufferGeometry, BufferGeometry, Record<string, Vector3[]>] {
  const detail = planetOptions.detail ?? 50;

  const mainGeometry =
    planetOptions.shape == "plane"
      ? new PlaneGeometry(3, 3, detail, detail).toNonIndexed()
      : new IcosahedronGeometry(1, detail);
  const oceanGeometry =
    planetOptions.shape == "plane"
      ? new PlaneGeometry(3, 3, detail, detail).toNonIndexed()
      : new IcosahedronGeometry(1, detail);

  const biome = new Biome(planetOptions.biome);

  const vertices = mainGeometry.getAttribute("position");
  const oceanVertices = oceanGeometry.getAttribute("position");
  const faceCount = vertices.count / 3;
  const faceSize = (Math.PI * 4) / faceCount;
  console.log("faces:", faceCount);

  // store calculated vertices so we don't have to recalculate them
  // once store by hashed position (so we can find vertices of different faces that have the same position)
  const calculatedVertices = new Map<string, VertexInfo>();
  // and once by index for vegetation placement
  const calculatedVerticesArray: VertexInfo[] = new Array(faceCount);

  const colors = new Float32Array(vertices.count * 3);
  const oceanColors = new Float32Array(oceanVertices.count * 3);

  const normals = mainGeometry.getAttribute("normal");
  const oceanNormals = oceanGeometry.getAttribute("normal");

  const planeUp = new Vector3(0, 1, 0);

  const a = new Vector3(),
    b = new Vector3(),
    c = new Vector3();

  const mid = new Vector3();

  const placedVegetation: Record<string, Vector3[]> = {};
  a.fromBufferAttribute(vertices, 0);
  b.fromBufferAttribute(vertices, 1);

  const faceSideLength = a.distanceTo(b);

  // scatterAmount is based on side length of face (all faces have the same size)
  const scatterAmount = (planetOptions.scatter ?? 1.2) * faceSideLength;
  const scatterScale = 100;

  const scatterNoise = new UberNoise({
    min: -scatterAmount / 2,
    max: scatterAmount / 2,
    scale: scatterScale,
    seed: 0,
  });

  oceanGeometry.morphAttributes.position = [];
  oceanGeometry.morphAttributes.normal = [];

  const oceanMorphPositions: number[] = [];
  const oceanMorphNormals: number[] = [];

  const oceanA = new Vector3(),
    oceanB = new Vector3(),
    oceanC = new Vector3(),
    oceanD = new Vector3(),
    oceanE = new Vector3(),
    oceanF = new Vector3();

  const temp = new Vector3();

  // go through all faces
  // - calculate height and scatter for vertices
  // - calculate height for ocean vertices
  // - calculate height for ocean morph vertices
  // - calculate color for vertices and ocean vertices
  // - calculate normal for vertices and ocean vertices
  // - add vegetation
  for (let i = 0; i < vertices.count; i += 3) {
    a.fromBufferAttribute(vertices, i);
    b.fromBufferAttribute(vertices, i + 1);
    c.fromBufferAttribute(vertices, i + 2);

    oceanA.fromBufferAttribute(oceanVertices, i);
    oceanB.fromBufferAttribute(oceanVertices, i + 1);
    oceanC.fromBufferAttribute(oceanVertices, i + 2);

    if (planetOptions.shape == "plane") {
      // switch y and z
      let temp = a.y;
      a.y = a.z;
      a.z = temp;

      temp = b.y;
      b.y = b.z;
      b.z = temp;

      temp = c.y;
      c.y = c.z;
      c.z = temp;

      temp = oceanA.y;
      oceanA.y = oceanA.z;
      oceanA.z = temp;

      temp = oceanB.y;
      oceanB.y = oceanB.z;
      oceanB.z = temp;

      temp = oceanC.y;
      oceanC.y = oceanC.z;
      oceanC.z = temp;
    }

    // Calculate face center
    mid.copy(a).add(b).add(c).divideScalar(3);
    mid.normalize();

    // Place vegetation
    if (biome.options.vegetation?.items) {
      for (const item of biome.options.vegetation.items) {
        // Skip if density is too low
        if (item.density === undefined || item.density <= 0) continue;
        
        // Calculate probability based on density and face size
        let probability = item.density * faceSize * 5.0;
        
        // Reduce probability for rocks
        if (item.name.includes("Rock")) {
          probability *= 0.1; // 90% reduction in rock placement probability
        }
        
        // Random chance to place vegetation
        if (Math.random() > probability) continue;
        
        // Get normalized height at mid point
        const height = biome.getHeight(mid);
        const normalizedHeight = Math.min(-height / biome.min, 0) + Math.max(height / biome.max, 0);
        
        // Calculate steepness using the face normal
        const normal = new Vector3().crossVectors(
          b.clone().sub(a), 
          c.clone().sub(a)
        ).normalize();
        const steepness = Math.acos(Math.abs(normal.dot(planetOptions.shape == "plane" ? planeUp : mid)));
        
        // Check height constraints
        if (item.minimumHeight !== undefined && normalizedHeight < item.minimumHeight) continue;
        if (item.maximumHeight !== undefined && normalizedHeight > item.maximumHeight) continue;
        
        // Check slope constraints
        if (item.minimumSlope !== undefined && steepness < item.minimumSlope) continue;
        if (item.maximumSlope !== undefined && steepness > item.maximumSlope) continue;
        
        // Check distance constraints
        if (item.minimumDistance !== undefined || item.maximumDistance !== undefined) {
          const closestDistance = biome.closestVegetationDistance(mid, item.maximumDistance ?? 1);
          if (item.minimumDistance !== undefined && (!closestDistance || closestDistance < item.minimumDistance)) continue;
          if (item.maximumDistance !== undefined && closestDistance && closestDistance > item.maximumDistance) continue;
        }
        
        // Add vegetation to the biome
        biome.addVegetation(item, mid.clone(), normalizedHeight, steepness);
        
        // Add to placed vegetation for return
        if (!placedVegetation[item.name]) {
          placedVegetation[item.name] = [];
        }
        placedVegetation[item.name].push(mid.clone());
      }
    }
    
    let normalizedHeight = 0;

    // go through all vertices of the face
    for (let j = 0; j < 3; j++) {
      let v = a;
      if (j === 1) v = b;
      if (j === 2) v = c;

      // lets see if we already have info for this vertex
      const key = `${v.x.toFixed(5)},${v.y.toFixed(5)},${v.z.toFixed(5)}`;
      let move = calculatedVertices.get(key);

      // if not, calculate it
      if (!move) {
        // calculate height and scatter
        const height = biome.getHeight(v);
        const scatterX = scatterNoise.get(v);
        const scatterY = scatterNoise.get(
          v.y + scatterScale * 100,
          v.z - scatterScale * 100,
          v.x + scatterScale * 100,
        );
        const scatterZ = scatterNoise.get(
          v.z - scatterScale * 200,
          v.x + scatterScale * 200,
          v.y - scatterScale * 200,
        );
        // calculate sea height and sea morph height
        const seaHeight = biome.getSeaHeight(v);
        const secondSeaHeight = biome.getSeaHeight(v.addScalar(100));

        v.subScalar(100);

        move = {
          height,
          scatter: new Vector3(scatterX, scatterY, scatterZ),
          seaHeight,
          seaMorph: secondSeaHeight,
        };
        calculatedVertices.set(key, move);
      }

      // we store this info for later use (vegetation placement)
      calculatedVerticesArray[i + j] = move;

      // we add height here so we can calculate the average normalized height of the face later
      normalizedHeight += move.height;

      // move vertex based on height and scatter
      v.add(move.scatter);
      if (planetOptions.shape == "plane") {
        v.y = move.height;
      } else {
        v.normalize().multiplyScalar(move.height + 1);
      }

      vertices.setXYZ(i + j, v.x, v.y, v.z);

      // move ocean morph vertex based on sea morph height and scatter
      let oceanV = oceanA;
      if (j === 1) oceanV = oceanB;
      if (j === 2) oceanV = oceanC;
      oceanV.add(move.scatter);

      if (planetOptions.shape == "plane") {
        oceanV.y = move.seaMorph;
      } else {
        oceanV.normalize().multiplyScalar(move.seaMorph + 1);
      }
      oceanMorphPositions.push(oceanV.x, oceanV.y, oceanV.z);

      // move ocean vertex based on sea height and scatter
      if (j === 0) {
        oceanD.copy(oceanV);
        oceanV = oceanD;
      } else if (j === 1) {
        oceanE.copy(oceanV);
        oceanV = oceanE;
      } else if (j === 2) {
        oceanF.copy(oceanV);
        oceanV = oceanF;
      }
      if (planetOptions.shape == "plane") {
        oceanV.y = move.seaHeight;
      } else {
        oceanV.normalize().multiplyScalar(move.seaHeight + 1);
      }
      oceanVertices.setXYZ(i + j, oceanV.x, oceanV.y, oceanV.z);
    }

    // calculate normalized height for the face (between -1 and 1, 0 is sea level)
    normalizedHeight /= 3;
    normalizedHeight =
      Math.min(-normalizedHeight / biome.min, 0) +
      Math.max(normalizedHeight / biome.max, 0);
    // now normalizedHeight should be between -1 and 1 (0 is sea level)
    // this will be used for color calculation and vegetation placement

    // calculate face normal
    temp.crossVectors(b.clone().sub(a), c.clone().sub(a)).normalize();
    // flat shading, so all normals for the face are the same
    normals.setXYZ(i, temp.x, temp.y, temp.z);
    normals.setXYZ(i + 1, temp.x, temp.y, temp.z);
    normals.setXYZ(i + 2, temp.x, temp.y, temp.z);

    // calculate steepness (acos of dot product of normal and up vector)
    // (up vector = old mid point on sphere)
    const steepness = Math.acos(
      Math.abs(temp.dot(planetOptions.shape == "plane" ? planeUp : mid)),
    );
    // steepness is between 0 and PI/2
    // this will be used for color calculation and vegetation placement

    // calculate color for face
    const color = biome.getColor(mid, normalizedHeight, steepness);
    // flat shading, so all colors for the face are the same
    if (color) {
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;

      colors[i * 3 + 3] = color.r;
      colors[i * 3 + 4] = color.g;
      colors[i * 3 + 5] = color.b;

      colors[i * 3 + 6] = color.r;
      colors[i * 3 + 7] = color.g;
      colors[i * 3 + 8] = color.b;
    }

    // calculate ocean face color
    const oceanColor = biome.getSeaColor(mid, normalizedHeight);

    if (oceanColor) {
      oceanColors[i * 3] = oceanColor.r;
      oceanColors[i * 3 + 1] = oceanColor.g;
      oceanColors[i * 3 + 2] = oceanColor.b;

      oceanColors[i * 3 + 3] = oceanColor.r;
      oceanColors[i * 3 + 4] = oceanColor.g;
      oceanColors[i * 3 + 5] = oceanColor.b;

      oceanColors[i * 3 + 6] = oceanColor.r;
      oceanColors[i * 3 + 7] = oceanColor.g;
      oceanColors[i * 3 + 8] = oceanColor.b;
    }

    // calculate ocean normals
    temp
      .crossVectors(oceanB.clone().sub(oceanA), oceanC.clone().sub(oceanA))
      .normalize();
    oceanNormals.setXYZ(i, temp.x, temp.y, temp.z);
    oceanNormals.setXYZ(i + 1, temp.x, temp.y, temp.z);
    oceanNormals.setXYZ(i + 2, temp.x, temp.y, temp.z);

    // calculate ocean morph normals
    temp
      .crossVectors(oceanE.clone().sub(oceanD), oceanF.clone().sub(oceanD))
      .normalize();
    oceanMorphNormals.push(temp.x, temp.y, temp.z);
    oceanMorphNormals.push(temp.x, temp.y, temp.z);
    oceanMorphNormals.push(temp.x, temp.y, temp.z);
  }

  const color = new Color();

  // go through all vertices again and update height and color based on vegetation
  for (let i = 0; i < vertices.count; i += 3) {
    a.fromBufferAttribute(vertices, i);
    b.fromBufferAttribute(vertices, i + 1);
    c.fromBufferAttribute(vertices, i + 2);

    if (planetOptions.shape == "plane") {
      a.y = 0;
      b.y = 0;
      c.y = 0;
    } else {
      a.normalize();
      b.normalize();
      c.normalize();
    }

    color.setRGB(colors[i * 3], colors[i * 3 + 1], colors[i * 3 + 2]);

    const output = biome.vegetationHeightAndColorForFace(
      a,
      b,
      c,
      color,
      faceSideLength,
    );

    const moveDataA = calculatedVerticesArray[i];
    const moveDataB = calculatedVerticesArray[i + 1];
    const moveDataC = calculatedVerticesArray[i + 2];

    // update height based on vegetation
    if (planetOptions.shape == "plane") {
      a.y = moveDataA.height + output.heightA;
      b.y = moveDataB.height + output.heightB;
      c.y = moveDataC.height + output.heightC;
    } else {
      a.normalize().multiplyScalar(moveDataA.height + output.heightA + 1);
      b.normalize().multiplyScalar(moveDataB.height + output.heightB + 1);
      c.normalize().multiplyScalar(moveDataC.height + output.heightC + 1);
    }

    vertices.setXYZ(i, a.x, a.y, a.z);
    vertices.setXYZ(i + 1, b.x, b.y, b.z);
    vertices.setXYZ(i + 2, c.x, c.y, c.z);

    // update color based on vegetation
    colors[i * 3] = output.color.r;
    colors[i * 3 + 1] = output.color.g;
    colors[i * 3 + 2] = output.color.b;

    colors[i * 3 + 3] = output.color.r;
    colors[i * 3 + 4] = output.color.g;
    colors[i * 3 + 5] = output.color.b;

    colors[i * 3 + 6] = output.color.r;
    colors[i * 3 + 7] = output.color.g;
    colors[i * 3 + 8] = output.color.b;
  }

  oceanGeometry.morphAttributes.position[0] = new Float32BufferAttribute(
    oceanMorphPositions,
    3,
  );
  oceanGeometry.morphAttributes.normal[0] = new Float32BufferAttribute(
    oceanMorphNormals,
    3,
  );

  mainGeometry.setAttribute("color", new BufferAttribute(colors, 3));
  oceanGeometry.setAttribute("color", new BufferAttribute(oceanColors, 3));

  // Log vegetation positions
  console.log("Vegetation positions generated:", Object.keys(placedVegetation).map(key => 
    `${key}: ${placedVegetation[key].length} positions`
  ));
  
  // If no vegetation positions were generated, add some manually
  const totalPositions = Object.values(placedVegetation).reduce((sum, positions) => sum + positions.length, 0);
  if (totalPositions === 0) {
    console.log("No vegetation positions generated, adding manual positions");
    
    // Add some manual positions for common vegetation types
    const vegetationTypes = ["PineTree", "CommonTree", "Rock", "Willow", "PalmTree"];
    
    for (const type of vegetationTypes) {
      placedVegetation[type] = [];
      
      // Add 8 positions around the planet
      placedVegetation[type].push(new Vector3(0, 1, 0));
      placedVegetation[type].push(new Vector3(1, 0, 0));
      placedVegetation[type].push(new Vector3(0, 0, 1));
      placedVegetation[type].push(new Vector3(-1, 0, 0));
      placedVegetation[type].push(new Vector3(0, 0, -1));
      placedVegetation[type].push(new Vector3(0.7, 0.7, 0));
      placedVegetation[type].push(new Vector3(-0.7, 0.7, 0));
      placedVegetation[type].push(new Vector3(0, -1, 0));
    }
    
    console.log("Added manual vegetation positions:", Object.keys(placedVegetation).map(key => 
      `${key}: ${placedVegetation[key].length} positions`
    ));
  }
  
  // Add additional vegetation positions if we have too few
  if (totalPositions < 100) {
    console.log("Too few vegetation positions generated, adding more");
    
    // Determine which types to add based on existing vegetation
    const treeTypes = ["PineTree", "CommonTree", "Willow", "PalmTree", "BirchTree"];
    const existingTypes = Object.keys(placedVegetation).filter(type => !type.includes("Rock"));
    
    // Add more positions for existing tree types
    for (const type of treeTypes) {
      if (existingTypes.includes(type)) {
        // Add 40 random positions around the planet
        for (let i = 0; i < 40; i++) {
          const x = Math.random() * 2 - 1;
          const y = Math.random() * 2 - 1;
          const z = Math.random() * 2 - 1;
          const pos = new Vector3(x, y, z).normalize();
          placedVegetation[type].push(pos);
        }
      }
    }
    
    console.log("Added additional vegetation positions:", Object.keys(placedVegetation).map(key => 
      `${key}: ${placedVegetation[key].length} positions`
    ));
  }
  
  return [mainGeometry, oceanGeometry, placedVegetation];
}
