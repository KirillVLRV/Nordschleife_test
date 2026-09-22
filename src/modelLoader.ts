// ============================================================
// SECTION: 3D Model Loader — GLTF/GLB with wheel detection
// ============================================================
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export interface LoadedModel {
  scene: THREE.Group;
  wheelNodes: THREE.Object3D[];
  triangleCount: number;
}

const loader = new GLTFLoader();

/**
 * Load a 3D model from file (GLTF/GLB)
 */
export function loadModel(file: File): Promise<LoadedModel> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    
    loader.load(
      url,
      (gltf) => {
        const scene = gltf.scene;
        
        // Count triangles
        let triangleCount = 0;
        scene.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            if (child.geometry.index) {
              triangleCount += child.geometry.index.count / 3;
            } else if (child.geometry.attributes.position) {
              triangleCount += child.geometry.attributes.position.count / 3;
            }
          }
        });
        
        // Detect wheel nodes
        const wheelNodes: THREE.Object3D[] = [];
        scene.traverse((child) => {
          const name = child.name.toLowerCase();
          if (name.includes('wheel') || name.includes('tyre') || name.includes('tire') || name.includes('rim')) {
            wheelNodes.push(child);
          }
        });
        
        // Clean up object URL
        URL.revokeObjectURL(url);
        
        resolve({
          scene,
          wheelNodes,
          triangleCount: Math.round(triangleCount),
        });
      },
      undefined,
      (error) => {
        URL.revokeObjectURL(url);
        reject(error);
      }
    );
  });
}

/**
 * Rotate model around Y-axis
 */
export function rotateModel(model: THREE.Group, degrees: number): void {
  model.rotation.y = THREE.MathUtils.degToRad(degrees);
}

/**
 * Animate wheels spinning
 */
export function animateWheels(wheelNodes: THREE.Object3D[], speed: number, deltaTime: number): void {
  const rotationSpeed = speed * deltaTime * 2; // Adjust multiplier for visual effect
  wheelNodes.forEach((wheel) => {
    wheel.rotation.x += rotationSpeed;
  });
}

/**
 * Center and scale model to fit in a bounding box
 */
export function normalizeModel(model: THREE.Group, targetSize: number = 4): void {
  // Compute bounding box
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  
  // Scale to fit
  const maxDim = Math.max(size.x, size.y, size.z);
  const scale = targetSize / maxDim;
  model.scale.setScalar(scale);
  
  // Center
  model.position.sub(center.multiplyScalar(scale));
}
