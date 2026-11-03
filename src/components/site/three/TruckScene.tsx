import {
  Component,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  ContactShadows,
  Environment,
  Lightformer,
  Line,
  RoundedBox,
  useGLTF,
} from "@react-three/drei";
import * as THREE from "three";

/**
 * Procedural heavy-duty dump truck in a construction / hauling scene.
 * Built from primitives so it ships without third-party model licensing. An administrator can
 * supply a GLB via the CMS (home.hero.modelUrl), which replaces the procedural truck.
 *
 * Cycle (16 s): drive (road + wheels move) → stop → raise dump body → lower → drive.
 */

const NAVY = "#072A6C";
const GREEN = "#0DAA77";
const STEEL = "#8C96A3";
const DARK = "#1B2230";
const TIRE = "#16181C";

export type SceneInput = {
  scroll: RefObject<number>;
  pointer: RefObject<{ x: number; y: number }>;
};

const CYCLE = 16;
function phase(t: number) {
  const c = t % CYCLE;
  const speed = c < 9 ? 1 : c < 10 ? 1 - (c - 9) : c < 15 ? 0 : c - 15; // 0..1
  const tilt = c < 10 ? 0 : c < 12.5 ? (c - 10) / 2.5 : c < 13 ? 1 : c < 15 ? 1 - (c - 13) / 2 : 0;
  return { speed, tilt: THREE.MathUtils.smoothstep(tilt, 0, 1) };
}

function Wheel({ x, z, spin }: { x: number; z: number; spin: RefObject<number> }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    if (ref.current) ref.current.rotation.z = -(spin.current ?? 0);
  });
  return (
    <group position={[x, 0.55, z]}>
      <group ref={ref} rotation={[Math.PI / 2, 0, 0]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.55, 0.55, 0.42, 28]} />
          <meshStandardMaterial color={TIRE} roughness={0.9} />
        </mesh>
        <mesh position={[0, z > 0 ? 0.215 : -0.215, 0]}>
          <cylinderGeometry args={[0.3, 0.3, 0.02, 20]} />
          <meshStandardMaterial color="#C9CED6" metalness={0.85} roughness={0.25} />
        </mesh>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <mesh
            key={i}
            position={[
              Math.cos((i / 6) * Math.PI * 2) * 0.17,
              z > 0 ? 0.23 : -0.23,
              Math.sin((i / 6) * Math.PI * 2) * 0.17,
            ]}
          >
            <cylinderGeometry args={[0.03, 0.03, 0.03, 8]} />
            <meshStandardMaterial color="#6B7280" metalness={0.9} roughness={0.3} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function ProceduralTruck({ spin, tilt }: { spin: RefObject<number>; tilt: RefObject<number> }) {
  const bed = useRef<THREE.Group>(null);
  const ram = useRef<THREE.Mesh>(null);
  const body = useRef<THREE.Group>(null);
  useFrame((state) => {
    const a = (tilt.current ?? 0) * 0.85; // max ~49°
    if (bed.current) bed.current.rotation.z = a;
    if (ram.current) {
      ram.current.scale.y = 1 + a * 1.6;
      ram.current.rotation.z = -0.35 - a * 0.35;
    }
    // idle engine vibration / suspension bob
    if (body.current)
      body.current.position.y =
        Math.sin(state.clock.elapsedTime * 22) * 0.004 +
        Math.sin(state.clock.elapsedTime * 1.3) * 0.01;
  });
  const glass = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: "#9BB7D4",
        metalness: 0.2,
        roughness: 0.05,
        transmission: 0.2,
        transparent: true,
        opacity: 0.85,
      }),
    [],
  );
  return (
    <group>
      <group ref={body}>
        {/* chassis rails */}
        <mesh position={[0.2, 0.95, 0.45]} castShadow>
          <boxGeometry args={[7.2, 0.28, 0.16]} />
          <meshStandardMaterial color={DARK} metalness={0.4} roughness={0.6} />
        </mesh>
        <mesh position={[0.2, 0.95, -0.45]} castShadow>
          <boxGeometry args={[7.2, 0.28, 0.16]} />
          <meshStandardMaterial color={DARK} metalness={0.4} roughness={0.6} />
        </mesh>
        {/* cab */}
        <RoundedBox
          args={[1.9, 1.85, 2.3]}
          radius={0.12}
          smoothness={4}
          position={[2.85, 2.1, 0]}
          castShadow
        >
          <meshStandardMaterial color={NAVY} metalness={0.55} roughness={0.35} />
        </RoundedBox>
        {/* hood */}
        <RoundedBox
          args={[1.25, 1.1, 2.1]}
          radius={0.1}
          smoothness={4}
          position={[4.25, 1.65, 0]}
          castShadow
        >
          <meshStandardMaterial color={NAVY} metalness={0.55} roughness={0.35} />
        </RoundedBox>
        {/* grille + bumper */}
        <mesh position={[4.9, 1.6, 0]}>
          <boxGeometry args={[0.06, 0.9, 1.5]} />
          <meshStandardMaterial color="#AEB6C2" metalness={0.9} roughness={0.25} />
        </mesh>
        <mesh position={[4.95, 0.95, 0]} castShadow>
          <boxGeometry args={[0.25, 0.3, 2.35]} />
          <meshStandardMaterial color="#C9CED6" metalness={0.85} roughness={0.3} />
        </mesh>
        {/* headlights */}
        {[0.8, -0.8].map((z) => (
          <mesh key={z} position={[4.91, 1.25, z]}>
            <boxGeometry args={[0.05, 0.18, 0.32]} />
            <meshStandardMaterial color="#FFF6D5" emissive="#FFE9A3" emissiveIntensity={1.6} />
          </mesh>
        ))}
        {/* windshield + side windows */}
        <mesh position={[3.81, 2.45, 0]} rotation={[0, 0, -0.12]} material={glass}>
          <boxGeometry args={[0.04, 0.85, 2.05]} />
        </mesh>
        {[1.16, -1.16].map((z) => (
          <mesh key={z} position={[2.95, 2.45, z]} material={glass}>
            <boxGeometry args={[1.25, 0.75, 0.02]} />
          </mesh>
        ))}
        {/* brand stripe on cab doors */}
        {[1.155, -1.155].map((z) => (
          <mesh key={z} position={[2.85, 1.55, z]}>
            <boxGeometry args={[1.7, 0.12, 0.01]} />
            <meshStandardMaterial color={GREEN} emissive={GREEN} emissiveIntensity={0.25} />
          </mesh>
        ))}
        {/* exhaust stacks */}
        {[1.05, -1.05].map((z) => (
          <mesh key={z} position={[1.85, 2.9, z]} castShadow>
            <cylinderGeometry args={[0.07, 0.07, 2.2, 14]} />
            <meshStandardMaterial color="#D1D5DB" metalness={0.95} roughness={0.15} />
          </mesh>
        ))}
        {/* fuel tank */}
        <mesh position={[2.3, 1.05, 1.0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.3, 0.3, 1.0, 20]} />
          <meshStandardMaterial color="#C9CED6" metalness={0.9} roughness={0.2} />
        </mesh>
        {/* hydraulic ram */}
        <mesh ref={ram} position={[1.2, 1.35, 0]} rotation={[0, 0, -0.35]}>
          <cylinderGeometry args={[0.09, 0.09, 0.7, 12]} />
          <meshStandardMaterial color="#B8BEC8" metalness={0.95} roughness={0.15} />
        </mesh>
        {/* dump body pivots at its rear lower edge */}
        <group position={[-3.15, 1.15, 0]}>
          <group ref={bed}>
            <group position={[2.6, 0.85, 0]}>
              <mesh castShadow receiveShadow position={[0, -0.7, 0]}>
                <boxGeometry args={[5.2, 0.12, 2.3]} />
                <meshStandardMaterial color={STEEL} metalness={0.7} roughness={0.45} />
              </mesh>
              {[1.12, -1.12].map((z) => (
                <mesh key={z} castShadow position={[0, 0, z]}>
                  <boxGeometry args={[5.2, 1.5, 0.1]} />
                  <meshStandardMaterial color={STEEL} metalness={0.7} roughness={0.45} />
                </mesh>
              ))}
              <mesh castShadow position={[2.55, 0.15, 0]}>
                <boxGeometry args={[0.12, 1.8, 2.3]} />
                <meshStandardMaterial color={STEEL} metalness={0.7} roughness={0.45} />
              </mesh>
              {/* cab protector */}
              <mesh castShadow position={[2.9, 1.0, 0]}>
                <boxGeometry args={[0.7, 0.08, 2.3]} />
                <meshStandardMaterial color={STEEL} metalness={0.7} roughness={0.45} />
              </mesh>
              {/* tailgate */}
              <mesh castShadow position={[-2.58, 0, 0]}>
                <boxGeometry args={[0.1, 1.5, 2.3]} />
                <meshStandardMaterial color="#7A8491" metalness={0.7} roughness={0.5} />
              </mesh>
              {/* ribs */}
              {[-1.8, -0.6, 0.6, 1.8].map((x) =>
                [1.18, -1.18].map((z) => (
                  <mesh key={`${x}${z}`} position={[x, 0, z]}>
                    <boxGeometry args={[0.1, 1.5, 0.04]} />
                    <meshStandardMaterial color="#6E7783" metalness={0.7} roughness={0.5} />
                  </mesh>
                )),
              )}
              {/* load of aggregate */}
              <mesh position={[0, 0.55, 0]} scale={[2.4, 0.5, 1.0]}>
                <sphereGeometry args={[1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
                <meshStandardMaterial color="#8B7355" roughness={1} />
              </mesh>
            </group>
          </group>
        </group>
      </group>
      <Wheel x={4.0} z={1.05} spin={spin} />
      <Wheel x={4.0} z={-1.05} spin={spin} />
      {[-0.9, -2.25].map((x) => (
        <group key={x}>
          <Wheel x={x} z={1.05} spin={spin} />
          <Wheel x={x} z={-1.05} spin={spin} />
        </group>
      ))}
    </group>
  );
}

function GlbTruck({ url }: { url: string }) {
  const gltf = useGLTF(url);
  const scene = useMemo(() => {
    const s = gltf.scene.clone(true);
    const box = new THREE.Box3().setFromObject(s);
    const size = box.getSize(new THREE.Vector3());
    const scale = 9 / Math.max(size.x, size.z, 0.001);
    s.scale.setScalar(scale);
    const b2 = new THREE.Box3().setFromObject(s);
    s.position.y -= b2.min.y;
    s.position.x -= (b2.min.x + b2.max.x) / 2;
    s.position.z -= (b2.min.z + b2.max.z) / 2;
    s.traverse((o) => ((o as THREE.Mesh).castShadow = true));
    return s;
  }, [gltf]);
  return <primitive object={scene} />;
}

class ModelBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** Dashed road markings that scroll beneath the truck to convey motion. */
function Road({ offset }: { offset: RefObject<number> }) {
  const group = useRef<THREE.Group>(null);
  useFrame(() => {
    if (group.current) group.current.position.x = -((offset.current ?? 0) % 4);
  });
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]} receiveShadow>
        <planeGeometry args={[80, 5.2]} />
        <meshStandardMaterial color="#4A4F57" roughness={0.95} />
      </mesh>
      <group ref={group}>
        {Array.from({ length: 24 }, (_, i) => (
          <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[-44 + i * 4, 0.012, -2.35]}>
            <planeGeometry args={[2, 0.12]} />
            <meshStandardMaterial color="#E5E7EB" />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function Site() {
  const cones = [
    [7.5, 3.6],
    [9, 3.4],
    [10.5, 3.7],
    [-8, -3.6],
    [-6.4, -3.8],
  ];
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[160, 160]} />
        <meshStandardMaterial color="#B49A78" roughness={1} />
      </mesh>
      {/* aggregate stockpiles */}
      {[
        [-11, -10, 3.4, 2.4, "#9C8566"],
        [-4, -13, 4.5, 3, "#8F8F8A"],
        [9, -11, 3, 2, "#A68B63"],
        [16, -6, 2.4, 1.6, "#7F7A72"],
      ].map(([x, z, r, h, c], i) => (
        <mesh key={i} position={[x as number, 0, z as number]} castShadow receiveShadow>
          <coneGeometry args={[r as number, h as number, 28]} />
          <meshStandardMaterial color={c as string} roughness={1} />
        </mesh>
      ))}
      {/* traffic cones */}
      {cones.map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position={[0, 0.35, 0]} castShadow>
            <coneGeometry args={[0.22, 0.7, 16]} />
            <meshStandardMaterial color="#F97316" roughness={0.6} />
          </mesh>
          <mesh position={[0, 0.38, 0]}>
            <cylinderGeometry args={[0.14, 0.17, 0.1, 16]} />
            <meshStandardMaterial color="#F9FAFB" />
          </mesh>
        </group>
      ))}
      {/* jersey barriers */}
      {[-14, -11.5, 12, 14.5].map((x) => (
        <mesh key={x} position={[x, 0.4, 3.9]} castShadow>
          <boxGeometry args={[2.3, 0.8, 0.5]} />
          <meshStandardMaterial color="#D6D3CE" roughness={0.9} />
        </mesh>
      ))}
      {/* distant site structure */}
      <group position={[20, 0, -22]}>
        {[0, 4, 8].map((x) => (
          <mesh key={x} position={[x, 3, 0]} castShadow>
            <boxGeometry args={[0.3, 6, 0.3]} />
            <meshStandardMaterial color="#9CA3AF" metalness={0.6} roughness={0.4} />
          </mesh>
        ))}
        <mesh position={[4, 6, 0]}>
          <boxGeometry args={[8.6, 0.3, 0.3]} />
          <meshStandardMaterial color="#9CA3AF" metalness={0.6} roughness={0.4} />
        </mesh>
      </group>
    </group>
  );
}

/** Animated dispatch route line across the site (quarry → jobsite). */
function RouteLine() {
  const ref = useRef<any>(null);
  const points = useMemo(
    () =>
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(-16, 0.05, -8),
        new THREE.Vector3(-8, 0.05, -4.2),
        new THREE.Vector3(0, 0.05, -3.2),
        new THREE.Vector3(8, 0.05, -5),
        new THREE.Vector3(15, 0.05, -10),
      ]).getPoints(80),
    [],
  );
  useFrame((_, dt) => {
    if (ref.current?.material) ref.current.material.dashOffset -= dt * 1.5;
  });
  return (
    <>
      <Line
        ref={ref}
        points={points}
        color={GREEN}
        lineWidth={3}
        dashed
        dashSize={0.8}
        gapSize={0.5}
      />
      {[points[0], points[points.length - 1]].map((p, i) => (
        <mesh key={i} position={[p.x, 0.15, p.z]}>
          <cylinderGeometry args={[0.35, 0.35, 0.08, 24]} />
          <meshStandardMaterial color={GREEN} emissive={GREEN} emissiveIntensity={0.8} />
        </mesh>
      ))}
    </>
  );
}

function Rig({ input, modelUrl }: { input: SceneInput; modelUrl?: string }) {
  const spin = useRef(0);
  const tilt = useRef(0);
  const road = useRef(0);
  const { camera, size } = useThree();
  // Shift the projection so the truck sits right of centre, clear of the headline on wide screens.
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    if (size.width >= 1024)
      cam.setViewOffset(size.width, size.height, -size.width * 0.22, 0, size.width, size.height);
    else cam.clearViewOffset();
    cam.updateProjectionMatrix();
  }, [camera, size.width, size.height]);
  const target = useMemo(() => new THREE.Vector3(0.5, 1.6, 0), []);
  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    const p = phase(t);
    const v = p.speed * 6 * Math.min(dt, 0.05);
    road.current += v;
    spin.current += v / 0.55;
    tilt.current = p.tilt;
    const s = input.scroll.current ?? 0; // 0..1 hero scroll progress
    const m = input.pointer.current ?? { x: 0, y: 0 };
    // slow cinematic orbit + scroll dolly + pointer parallax
    const ang = -0.65 + Math.sin(t * 0.08) * 0.25 + m.x * 0.12 + s * 0.6;
    const radius = 19 - s * 3.5;
    const height = 5.4 + m.y * 0.6 + s * 2.5;
    camera.position.lerp(
      new THREE.Vector3(Math.sin(ang) * radius, height, Math.cos(ang) * radius),
      0.05,
    );
    camera.lookAt(target);
  });
  return (
    <>
      <group position={[0, 0, 0]}>
        {modelUrl ? (
          <ModelBoundary fallback={<ProceduralTruck spin={spin} tilt={tilt} />}>
            <Suspense fallback={<ProceduralTruck spin={spin} tilt={tilt} />}>
              <GlbTruck url={modelUrl} />
            </Suspense>
          </ModelBoundary>
        ) : (
          <ProceduralTruck spin={spin} tilt={tilt} />
        )}
      </group>
      <Road offset={road} />
    </>
  );
}

export default function TruckScene({
  input,
  paused,
  modelUrl,
  onReady,
}: {
  input: SceneInput;
  paused: boolean;
  modelUrl?: string;
  onReady?: () => void;
}) {
  return (
    <Canvas
      shadows
      dpr={[1, 1.6]}
      frameloop={paused ? "never" : "always"}
      camera={{ position: [10, 5, 11], fov: 38, near: 0.5, far: 200 }}
      gl={{ antialias: true, powerPreference: "high-performance", alpha: false }}
      onCreated={({ gl, scene }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        scene.background = new THREE.Color("#0B1F45");
        scene.fog = new THREE.Fog("#0B1F45", 28, 75);
        onReady?.();
      }}
      aria-hidden="true"
    >
      <hemisphereLight args={["#CFE3FF", "#5C4A36", 0.55]} />
      <directionalLight
        position={[12, 18, 8]}
        intensity={2.2}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
      />
      <directionalLight position={[-10, 6, -8]} intensity={0.6} color="#7FE0BE" />
      <Environment resolution={64} frames={1}>
        <Lightformer intensity={2} position={[0, 6, -10]} scale={[20, 6, 1]} color="#ffffff" />
        <Lightformer intensity={1} position={[10, 4, 6]} scale={[10, 4, 1]} color="#9fd8ff" />
        <Lightformer intensity={0.6} position={[-10, 2, 4]} scale={[10, 3, 1]} color="#0DAA77" />
      </Environment>
      <Site />
      <RouteLine />
      <Rig input={input} modelUrl={modelUrl} />
      <ContactShadows
        position={[0.5, 0.02, 0]}
        opacity={0.55}
        scale={18}
        blur={2.4}
        far={4}
        frames={1}
      />
    </Canvas>
  );
}
