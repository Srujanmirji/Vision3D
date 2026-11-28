import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "/Users/srujanmirji/Downloads/Vision3D/frontend/node_modules/playwright-core/index.mjs";

const three = new URL("file:///Users/srujanmirji/Downloads/Vision3D/frontend/node_modules/three/");
const studio = `<!doctype html><script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script>
<script type="module">
import * as T from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
const size = 384;
const renderer = new T.WebGLRenderer({alpha:true, antialias:true, preserveDrawingBuffer:true});
renderer.setSize(size, size);
renderer.setClearColor(0, 0);
renderer.setPixelRatio(1);
const directions = {
  front:[0,0,-1], rear:[0,0,1], left:[1,0,0], right:[-1,0,0], top:[0,1,0], bottom:[0,-1,0],
};
window.render = async () => {
  const {scene} = await new GLTFLoader().loadAsync("/model.glb");
  const bounds = new T.Box3().setFromObject(scene);
  const center = bounds.getCenter(new T.Vector3());
  const radius = bounds.getSize(new T.Vector3()).length() / 2;
  const scope = radius * 1.05;
  const camera = new T.OrthographicCamera(-scope, scope, scope, -scope, 0.01, radius * 10);
  const soft = new URLSearchParams(location.search).get("light") === "soft";
  scene.add(new T.HemisphereLight(0xffffff, 0xbbbbbb, soft ? 1.7 : 2.0));
  const key = new T.DirectionalLight(0xffffff, soft ? 0.3 : 2);
  scene.add(key);
  const frames = {};
  for (const [name, dir] of Object.entries(directions)) {
    if (soft && name !== "front") continue;
    camera.up.set(0, 1, 0);
    if (dir[1]) camera.up.set(0, 0, -dir[1]);
    camera.position.copy(center).addScaledVector(new T.Vector3(...dir), radius * 3);
    camera.lookAt(center);
    key.position.copy(camera.position).add(new T.Vector3(0.4,0.8,-0.3).multiplyScalar(radius));
    renderer.render(scene, camera);
    frames[name] = renderer.domElement.toDataURL();
  }
  return frames;
};
</script>`;

let mesh;
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://localhost");
    if (url.pathname === "/") {
      response.writeHead(200, {"Content-Type":"text/html"});
      response.end(studio);
    } else if (url.pathname === "/model.glb") {
      response.writeHead(200, {"Content-Type":"model/gltf-binary"});
      response.end(mesh);
    } else if (/^\/three\/(build|examples\/jsm)\/[\w/.-]+\.js$/.test(url.pathname)) {
      const asset = new URL(url.pathname.slice(7), three);
      const code = await readFile(asset);
      response.writeHead(200, {"Content-Type":"text/javascript"});
      response.end(code);
    } else {
      response.writeHead(404).end();
    }
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
let browser;
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const page = await browser.newPage();
  for (const glb of process.argv.slice(2)) {
    mesh = await readFile(glb);
    const soft = process.env.VISION3D_TEST_LIGHT === "soft";
    await page.goto(`http://127.0.0.1:${server.address().port}${soft ? "?light=soft" : ""}`);
    await page.waitForFunction(() => typeof window.render === "function");
    const images = await page.evaluate(() => window.render());
    for (const [direction, data] of Object.entries(images)) {
      await writeFile(path.join(path.dirname(glb), `${path.basename(glb, ".glb")}-${direction}${soft ? "-soft" : ""}.png`),
        Buffer.from(data.split(",")[1], "base64"));
    }
  }
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
