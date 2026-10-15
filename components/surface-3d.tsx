"use client";
// Height-map view: each pixel is a vertex, brightness is height. Drag to orbit, scroll to zoom.
import { useEffect, useMemo } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Cell, Grid } from "@/lib/algos/types";
import { useThemeColors } from "./use-theme-colors";

const HEIGHT = 0.35; // world units for value 1 on a 1×1 plane

// Low → high colour ramp (viridis-like, readable in both themes).
const RAMP = ["#440154", "#3b528b", "#21918c", "#5ec962", "#fde725"].map(c => new THREE.Color(c));
function ramp(v: number, out: THREE.Color) {
  const t = Math.min(1, Math.max(0, v)) * (RAMP.length - 1), i = Math.min(RAMP.length - 2, Math.floor(t));
  return out.copy(RAMP[i]).lerp(RAMP[i + 1], t - i);
}

function Controls() {
  const { camera, gl } = useThree();
  const controls = useMemo(() => {
    const c = new OrbitControls(camera, gl.domElement);
    c.enableDamping = true;
    c.enablePan = false;
    c.minDistance = 0.8;
    c.maxDistance = 4;
    return c;
  }, [camera, gl]);
  useEffect(() => () => controls.dispose(), [controls]);
  useFrame(() => controls.update());
  return null;
}

type ViewProps = { surface: Grid; write: Cell[]; fit: boolean };

function Terrain({ surface: g, write, fit, cursorColor }: ViewProps & { cursorColor: string }) {
  // fit: stretch so the tallest point reaches full height (colour ramp too)
  const k = fit ? 1 / Math.max(1e-6, ...g.data) : 1;

  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(1, 1, g.w - 1, g.h - 1);
    geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(g.w * g.h * 3), 3));
    return geo;
  }, [g.w, g.h]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  // PlaneGeometry vertices run row by row, left → right, matching the grid's row-major order.
  useEffect(() => {
    const pos = geometry.attributes.position as THREE.BufferAttribute;
    const col = geometry.attributes.color as THREE.BufferAttribute;
    const c = new THREE.Color();
    for (let i = 0; i < g.w * g.h; i++) {
      const v = g.data[i] * k;
      pos.setZ(i, v * HEIGHT);
      ramp(v, c);
      col.setXYZ(i, c.r, c.g, c.b);
    }
    pos.needsUpdate = col.needsUpdate = true;
    geometry.computeVertexNormals();
  }, [geometry, g, k]);

  // Line tracing the row/column being written, lifted just above the surface.
  const marker = useMemo(() => {
    const pts = write.map(([y, x]) =>
      new THREE.Vector3(x / (g.w - 1) - 0.5, 0.5 - y / (g.h - 1), g.data[y * g.w + x] * k * HEIGHT + 0.01));
    return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: cursorColor }));
  }, [write, g, k, cursorColor]);
  useEffect(() => () => { marker.geometry.dispose(); (marker.material as THREE.Material).dispose(); }, [marker]);

  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      <mesh geometry={geometry}>
        <meshStandardMaterial vertexColors side={THREE.DoubleSide} roughness={0.55} metalness={0.05} />
      </mesh>
      {write.length > 1 && <primitive object={marker} />}
    </group>
  );
}

export default function Surface3D(props: ViewProps) {
  const colors = useThemeColors();
  return (
    <div className="aspect-[16/10] w-full overflow-hidden rounded-xl border border-border" aria-label="3-D height map: drag to rotate, scroll to zoom" role="img">
      <Canvas camera={{ position: [0, 0.95, 1.15], fov: 45 }} dpr={[1, 2]}>
        <ambientLight intensity={0.55} />
        <directionalLight position={[1, 2, 1.5]} intensity={1.6} />
        <Terrain {...props} cursorColor={colors?.cursor ?? "#ff7a45"} />
        <Controls />
      </Canvas>
    </div>
  );
}
