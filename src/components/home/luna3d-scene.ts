import type { Object3D } from 'three';

/**
 * 원본 utils.home.js init3d/onMove 와 동일한 3D 장면 구성.
 */
export const CANVAS_SIZE = 600;
export const MODEL_URL = '/model/luna.splinecode';

export type LunaScene = { rotate: (x: number, y: number) => void; dispose: () => void };

export async function createLunaScene(canvas: HTMLCanvasElement, modelUrl = MODEL_URL): Promise<LunaScene> {
  const [{ Scene, Color, Euler, WebGLRenderer, OrthographicCamera, PCFShadowMap }, { default: SplineLoader }] = await Promise.all([
    import('three'),
    import('@splinetool/loader'),
  ]);

  const camera = new OrthographicCamera(CANVAS_SIZE / -2, CANVAS_SIZE / 2, CANVAS_SIZE / 2, CANVAS_SIZE / -2, -100000, 100000);
  camera.position.set(-53.17, -10.09, 572.1);
  camera.quaternion.setFromEuler(new Euler(0, 0, 0));

  const scene = new Scene();
  scene.background = new Color('#FAFAFF');
  let disposed = false;
  new SplineLoader().load(modelUrl, (splineScene: Object3D) => {
    if (!disposed) scene.add(splineScene);
  });

  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.setSize(CANVAS_SIZE, CANVAS_SIZE);
  renderer.setClearColor(0x000000, 0);
  renderer.setAnimationLoop(() => renderer.render(scene, camera));

  return {
    // 원본 onMove: 캔버스 중심 기준 포인터 오프셋 / 4000
    rotate: (x, y) => {
      scene.rotation.y = x / 4000;
      scene.rotation.x = y / 4000;
    },
    dispose: () => {
      disposed = true;
      renderer.setAnimationLoop(null);
      renderer.dispose();
    },
  };
}
