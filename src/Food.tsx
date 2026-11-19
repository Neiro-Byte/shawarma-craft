import { useEffect, useMemo } from 'react';
import * as THREE from 'three';

import { isSauceId,visualIngredientId,ingredientMetadata, type IngredientId } from './domain';
export type { IngredientId } from './domain';

type FoodProps = { kind: IngredientId; variant?: number };
const TAU = Math.PI * 2;
export const CHEESE_STRIP_SIZE: [number, number, number] = [.16, .022, .025];

// Small CPU-generated maps keep repeated food pieces in the same draw call.
export function createFoodSurface(kind:'chicken'|'falafel') {
  const size=128;
  const pixels=new Uint8Array(size*size*4);
  let seed=kind==='falafel'?73:29;
  for(let y=0;y<size;y++){
    for(let x=0;x<size;x++){
      seed=(seed*16807)%2147483647;
      const noise=seed/2147483647;
      const crust=kind==='falafel'?noise<.16:noise<.06;
      const fiber=kind==='chicken'?Math.sin(x*.45+Math.sin(y*.08)*1.2)*.04:0;
      const intensity=crust ? .35+noise*.8 : .86+noise*.14+fiber;
      const index=(y*size+x)*4;
      const value=Math.round(Math.min(1,intensity)*255);
      pixels[index]=value;
      pixels[index+1]=Math.round(value*(crust ? .89 : .99));
      pixels[index+2]=Math.round(value*(crust ? .74 : .96));
      pixels[index+3]=255;
    }
  }
  const texture=new THREE.DataTexture(pixels,size,size,THREE.RGBAFormat);
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.generateMipmaps=true;
  texture.minFilter=THREE.LinearMipmapLinearFilter;
  texture.magFilter=THREE.LinearFilter;
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.anisotropy=2;
  texture.needsUpdate=true;
  return texture;
}

export const sauceColors = {
  white: '#fff2d6', hot: '#e85029', cheeseSauce: '#f4b735', bbq: '#713c27',
  tomatoSauce: '#b92f24', yogurt: '#f6faf0', tahini: '#cba66c',
} as const;

// Small repeating details share one draw call instead of one mesh per seed.
function Seeds({ count, radius, color }: { count: number; radius: number; color: string }) {
  const geometry = useMemo(() => new THREE.SphereGeometry(1, 6, 4), []);
  const matrix = useMemo(() => new THREE.Object3D(), []);
  const ref = (mesh: THREE.InstancedMesh | null) => {
    if (!mesh) return;
    for (let i = 0; i < count; i++) {
      const a = i * TAU / count;
      matrix.position.set(Math.cos(a) * radius, .074, Math.sin(a) * radius);
      matrix.rotation.set(0, -a, 0); matrix.scale.set(.018, .004, .009);
      matrix.updateMatrix(); mesh.setMatrixAt(i, matrix.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  };
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <instancedMesh ref={ref} args={[geometry, undefined, count]}><meshStandardMaterial color={color} roughness={.65}/></instancedMesh>;
}

function Tomato() {
  return <group>
    <mesh position={[0, 0.035, 0]} castShadow receiveShadow><cylinderGeometry args={[0.235, 0.22, 0.07, 24]} /><meshStandardMaterial color="#e84732" roughness={0.53} /></mesh>
    <mesh position={[0, 0.071, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.205, 24]} /><meshStandardMaterial color="#ff7860" roughness={0.55} /></mesh>
    <Seeds count={9} radius={.12} color="#ffe6a1" />
  </group>;
}

function Cucumber({ pickle = false }: { pickle?: boolean }) {
  return <group>
    <mesh position={[0, 0.032, 0]} castShadow><cylinderGeometry args={[0.217, 0.205, 0.064, 24]} /><meshStandardMaterial color={pickle ? "#526d26" : "#397b39"} roughness={0.65} /></mesh>
    <mesh position={[0, 0.065, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.187, 24]} /><meshStandardMaterial color={pickle ? "#9aa954" : "#c3e58b"} roughness={0.67} /></mesh>
    <mesh position={[0, 0.067, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.115, 20]} /><meshStandardMaterial color="#e4edb0" roughness={0.66} /></mesh>
    <Seeds count={9} radius={.087} color="#fff4ce" />
  </group>;
}

function Lettuce({ variant }: { variant: number }) {
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const points: number[] = [], indices: number[] = [];
    const rings = 7, segments = 24;
    for (let r = 0; r <= rings; r++) {
      const t = r / rings;
      for (let s = 0; s <= segments; s++) {
        const a = s / segments * TAU;
        const radius = t * (0.215 + Math.sin(a * 5 + variant) * 0.025);
        points.push(Math.cos(a) * radius, 0.015 + t * t * (0.042 + Math.sin(a * 7 + variant) * 0.035), Math.sin(a) * radius * 0.85);
        if (r < rings && s < segments) {
          const k = r * (segments + 1) + s;
          indices.push(k, k + segments + 1, k + 1, k + 1, k + segments + 1, k + segments + 2);
        }
      }
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    g.setIndex(indices); g.computeVertexNormals(); return g;
  }, [variant]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <group>
    <mesh geometry={geometry} castShadow receiveShadow><meshStandardMaterial color={variant % 2 ? '#71b83c' : '#8aca48'} side={THREE.DoubleSide} roughness={0.8} /></mesh>
    <mesh position={[0, 0.029, 0]} rotation={[0, 0.2, 0]} scale={[0.014, 0.01, 0.18]}><sphereGeometry args={[1, 8, 6]} /><meshStandardMaterial color="#c6df76" roughness={0.8} /></mesh>

  </group>;
}

function crustColors(geometry: THREE.BufferGeometry, base: string, dark: string, variant: number) {
  const points = geometry.attributes.position;
  const colors = new Float32Array(points.count * 3);
  const light = new THREE.Color(base), toasted = new THREE.Color(dark), color = new THREE.Color();
  for (let i = 0; i < points.count; i++) {
    const x = points.getX(i), y = points.getY(i), z = points.getZ(i);
    const grain = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + variant * 2.3) * 43758.5453;
    const noise = grain - Math.floor(grain);
    color.copy(light).lerp(toasted, noise > .77 ? .85 : noise * .35);
    color.toArray(colors, i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

function Meat({ beef, variant }: { beef: boolean; variant: number }) {
  const geometry = useMemo(() => {
    const g = new THREE.SphereGeometry(1, beef ? 14 : 10, 7);
    const points = g.attributes.position;
    for (let i = 0; i < points.count; i++) {
      const x = points.getX(i), y = points.getY(i), z = points.getZ(i);
      const edge = .9 + .1 * Math.sin(x * 9 + z * 7 + variant);
      points.setXYZ(i, x * (beef ? .215 : .17) * edge, y * (beef ? .0375 : .07),
        z * (beef ? .095 : .1225) * edge);
    }
    g.computeVertexNormals();
    return crustColors(g, beef ? '#b36c47' : '#edb460', beef ? '#593024' : '#87431f', variant);
  }, [beef, variant]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} position={[0, beef ? .04 : .07, 0]}
    rotation={[0, (variant % 3 - 1) * .12, 0]} castShadow receiveShadow>
    <meshStandardMaterial vertexColors roughness={beef ? .72 : .8}/>
  </mesh>;
}

function Cabbage({ variant }: { variant: number }) {
  const geometry = useMemo(() => {
    const positions: number[] = [], colors: number[] = [];
    const color = new THREE.Color();
    for (let i = 0; i < 7; i++) {
      const strip = new THREE.BoxGeometry(.29, .009, .017).toNonIndexed();
      strip.rotateY((i % 3 - 1) * .38 + Math.sin(variant) * .1);
      strip.translate((i % 2 ? 1 : -1) * .025, .009 + i * .006, (i - 3) * .025);
      const points = strip.attributes.position;
      color.set(i % 3 === 0 ? '#c5cf93' : i % 2 ? '#f0eccb' : '#dfe4b0');
      for (let j = 0; j < points.count; j++) {
        positions.push(points.getX(j), points.getY(j), points.getZ(j));
        color.toArray(colors, colors.length);
      }
      strip.dispose();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    g.computeVertexNormals();
    return g;
  }, [variant]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} castShadow receiveShadow><meshStandardMaterial vertexColors roughness={.8}/></mesh>;
}

function Falafel({ variant }: { variant: number }) {
  const geometry = useMemo(() => crustColors(new THREE.IcosahedronGeometry(.16, 2),
    variant % 2 ? '#b08a3e' : '#bc964a', '#534224', variant), [variant]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} position={[0, .105, 0]} scale={[1, .72, 1]} castShadow>
    <meshStandardMaterial vertexColors roughness={1} flatShading/>
  </mesh>;
}

function Onion({ variant }: { variant: number }) {
  return <group scale={[1, 1, 0.88]} rotation={[0, variant * 0.3, 0]}>
    {[0.19, 0.14].map((radius, i) => <group key={radius}>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0.025, 0]} castShadow><torusGeometry args={[radius, i ? 0.015 : 0.022, 6, 28, TAU * 0.94]} /><meshStandardMaterial color={i ? '#dba6cb' : '#a656a0'} roughness={0.6} /></mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0.036, 0]}><torusGeometry args={[radius, i ? 0.008 : 0.012, 5, 28, TAU * 0.94]} /><meshStandardMaterial color="#f4dce7" roughness={0.64} /></mesh>
    </group>)}
  </group>;
}

function Pepper({ variant }: { variant: number }) {
  const curve = useMemo(() => new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.19, 0.03, -0.03), new THREE.Vector3(-0.11, 0.055, -0.095), new THREE.Vector3(0.04, 0.045, -0.085), new THREE.Vector3(0.17, 0.03, 0.025), new THREE.Vector3(0.13, 0.035, 0.11),
  ]), []);
  return <group rotation={[0, variant * 0.5, 0]}>
    <mesh castShadow><tubeGeometry args={[curve, 16, 0.035, 7, false]} /><meshStandardMaterial color={variant % 3 === 0 ? '#ffbb39' : '#ec4935'} roughness={0.5} /></mesh>
    <mesh position={[-0.175, 0.06, -0.025]} scale={[0.032, 0.012, 0.022]}><sphereGeometry args={[1, 8, 5]} /><meshStandardMaterial color="#ffe09a" /></mesh>
  </group>;
}

export function Food({ kind:inputKind, variant = 0 }: FoodProps) {
  const kind=visualIngredientId(inputKind);
  const customColor=ingredientMetadata(inputKind)?.color;
  if (isSauceId(kind)) return <mesh position={[0, .025, 0]} scale={[.14, .025, .12]} castShadow><sphereGeometry args={[1, 12, 8]}/><meshStandardMaterial color={customColor??sauceColors[kind as keyof typeof sauceColors]} roughness={.4}/></mesh>;
  switch (kind) {
    case 'chicken': return <Meat beef={false} variant={variant} />;
    case 'beef': return <Meat beef variant={variant} />;
    case 'tomato': return <Tomato />;
    case 'cucumber': return <Cucumber />;
    case 'lettuce': return <Lettuce variant={variant} />;
    case 'onion': return <Onion variant={variant} />;
    case 'pepper': return <Pepper variant={variant} />;
    case 'cheese': return <group>{[0, 1, 2].map(i => <mesh key={i} position={[(i - 1) * 0.045, 0.015 + i * 0.016, (i - 1) * 0.035]} rotation={[0, i * 1.6 + variant, 0]} castShadow>
      <boxGeometry args={CHEESE_STRIP_SIZE}/>
      <meshStandardMaterial color="#f4cb54" roughness={.7}/>
    </mesh>)}</group>;
    case 'pickle': return <Cucumber pickle />;
    case 'cabbage': return <Cabbage variant={variant}/>;
    case 'carrot': case 'fries': return <group rotation={[0,variant,0]}>{[0,1,2].map(i => <mesh key={i} position={[(i-1)*.065,.025+i*.02,(i-1)*.025]} rotation={[0,i*.45,0]} castShadow receiveShadow><boxGeometry args={kind==='fries'?[.07,.06,.34]:[.024,.024,.32]}/><meshStandardMaterial color={kind==='fries'?(i%2?'#f3ca68':'#e9b74c'):(i%2?'#f59331':'#df6a23')} roughness={kind==='fries'?.72:.65}/></mesh>)}</group>;
    case 'falafel': return <Falafel variant={variant}/>;
    case 'mushroom': return <group><mesh position={[0,.04,0]}><cylinderGeometry args={[.045,.055,.08,8]}/><meshStandardMaterial color="#e6d6b8"/></mesh><mesh position={[0,.09,0]} scale={[1,.45,1]} castShadow><sphereGeometry args={[.18,12,6,0,TAU,0,Math.PI/2]}/><meshStandardMaterial color="#b39878" side={THREE.DoubleSide} roughness={.9}/></mesh></group>;
    case 'jalapeno': return <group rotation={[Math.PI/2,0,variant]}><mesh castShadow><torusGeometry args={[.12,.035,6,16]}/><meshStandardMaterial color="#4b8a35" roughness={.65}/></mesh><mesh position={[.07,0,-.025]}><sphereGeometry args={[.018,6,4]}/><meshStandardMaterial color="#e4d89a"/></mesh></group>;
    case 'beans': return <mesh position={[0,.05,0]} scale={[.12,.05,.075]} rotation={[0,variant,0]} castShadow><sphereGeometry args={[1,10,6]}/><meshStandardMaterial color="#843e36" roughness={.5}/></mesh>;
    case 'corn': return <mesh position={[0,.04,0]} scale={[.065,.045,.055]} castShadow><sphereGeometry args={[1,8,5]}/><meshStandardMaterial color="#f6cf48" roughness={.55}/></mesh>;
    case 'white': case 'hot': case 'cheeseSauce': case 'bbq': case 'tomatoSauce': case 'yogurt': case 'tahini': return null;
  }
}
