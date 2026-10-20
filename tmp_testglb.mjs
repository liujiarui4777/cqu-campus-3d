import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import fs from "node:fs";

const scene = new THREE.Scene();
const g = new THREE.BoxGeometry(10, 20, 10);
const m = new THREE.MeshStandardMaterial({ color: 0xcc3333, roughness: 0.85 });
scene.add(new THREE.Mesh(g, m));
const ex = new GLTFExporter();
ex.parse(scene, (res) => {
  const buf = Buffer.from(res);
  fs.writeFileSync("tmp/test.glb", buf);
  console.log("ok glb bytes", buf.length);
}, (e) => { console.error("ERR", e); }, { binary: true });
