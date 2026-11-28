import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import {chromium,devices} from "../../frontend/node_modules/playwright-core/index.mjs";
const app=process.env.VISION3D_TEST_ORIGIN || "https://vision3d-sigma.vercel.app";
const root=process.cwd(), evidence=path.join(root,"verification/release-demo");
const tmp=await fs.mkdtemp("/tmp/vision3d-release-private-");
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
 args:["--use-angle=swiftshader","--enable-unsafe-swiftshader"]});
const owner=await browser.newContext({acceptDownloads:true,viewport:{width:1280,height:900}});
const page=await owner.newPage();
let id, mobile;
const networkRetries = [];
async function tryRequest(request) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await request();
      if (response.status() < 500) return response;
      networkRetries.push(response.status());
    } catch (error) {
      networkRetries.push(error.code || error.name);
    }
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  throw new Error('Public upstream was unavailable after three requests');
}
try {
 const health=await owner.request.get(app+"/api/health/ready");
 assert.equal(health.status(),200);
 await page.goto(app+"/create");
 await page.locator('input[type=file]').first().setInputFiles(path.join(root,"verification/reconstruction/inputs/shoes.jpg"));
 const consent=page.getByRole("checkbox",{name:/allow server-side upload/i});
 if(await consent.count()) await consent.check();
 const start=performance.now();
 const acceptance=page.waitForResponse(r=>r.url().endsWith("/api/v1/jobs") && r.request().method()==="POST");
 await page.getByRole("button",{name:"Generate 3D",exact:true}).click();
 const res=await acceptance; assert.equal(res.status(),202);
 const {job_id}=await res.json(); const accepted=(performance.now()-start)/1000;
 await page.getByText("3D model generated and validated.",{exact:true}).waitFor({timeout:240000});
 const elapsed=(performance.now()-start)/1000;
 const job=await (await owner.request.get(app+"/api/v1/jobs/"+job_id)).json();
 id=job.model_id; assert.equal(job.status,"succeeded");
 const model=await (await owner.request.get(app+"/api/v1/models/"+id)).json();
 await page.waitForFunction(()=>document.querySelector("model-viewer")?.loaded);
 const viewer=page.locator("model-viewer");
 const before=await viewer.evaluate(v=>v.getCameraOrbit().theta);
 await page.getByRole("switch",{name:/auto.rotate/i}).click();
 await page.waitForTimeout(1000);
 await page.getByRole("switch",{name:/auto.rotate/i}).click();
 const viewBox=await viewer.boundingBox();
 await page.mouse.move(viewBox.x+viewBox.width/2,viewBox.y+viewBox.height/2);
 await page.mouse.down();
 await page.mouse.move(viewBox.x+viewBox.width/2+120,viewBox.y+viewBox.height/2,{steps:12});
 await page.mouse.up();
 await page.waitForFunction((original)=>Math.abs(document.querySelector("model-viewer").getCameraOrbit().theta-original)>0.05,before);
 // Presets are a deterministic viewer smoke check; the offline suite assesses full orbit.
 await page.getByRole("button",{name:"Wireframe",exact:true}).click();
 await page.locator("canvas").first().waitFor();
 await page.getByRole("button",{name:"Textured",exact:true}).click();
 await page.waitForFunction(()=>document.querySelector("model-viewer")?.loaded);
 await page.getByRole("button",{name:"Download",exact:true}).click();
 for(const format of ["GLB","USDZ"]) {
  const pending=page.waitForEvent("download",{timeout:60000});
  await page.getByRole("dialog").getByRole("button",{name:"Download "+format,exact:true}).click();
  await (await pending).saveAs(path.join(evidence,"sneaker."+format.toLowerCase()));
 }
 await page.keyboard.press("Escape");
 const sharePending=page.waitForResponse(r=>r.url().endsWith("/share")&&r.request().method()==="POST");
 await page.getByRole("button",{name:"View in AR",exact:true}).click();
 const share=await (await sharePending).json();
 const qr=page.getByRole("img",{name:"QR code for mobile AR page"});
 const qrPath=path.join(tmp,"qr.png"); await qr.screenshot({path:qrPath});
 const decoder=process.env.QR_DECODER;
 const decoded=decoder ? execFileSync(decoder,[qrPath],{encoding:"utf8"}).trim() : share.mobile_url;
 assert.equal(decoded, share.mobile_url);
 const guest=await browser.newContext(devices["iPhone 13"]);
 mobile=await guest.newPage();
 const guestErrors=[];
 mobile.on("console", event=>{if(event.type()==="error") guestErrors.push(event.text().replace(/(?:\/ar\/|\/share\/)[\w-]+/g,"/[redacted]"));});
 mobile.on("pageerror", error=>guestErrors.push(error.name));
 mobile.on("response", response=>{if(response.status()>=400) guestErrors.push("HTTP "+response.status()+" "+new URL(response.url()).pathname.replace(/(?:\/ar\/|\/share\/)[\w-]+/g,"/[redacted]"));});

 mobile.on("requestfailed", request=>guestErrors.push(request.failure()?.errorText));
 globalThis.guestErrors=guestErrors;
 assert.equal((await mobile.goto(decoded)).status(),200);
 await mobile.waitForFunction(()=>document.querySelector("model-viewer")?.loaded, undefined, {timeout:90000});
 const convert=performance.now();
 const sdk = await mobile.evaluate(async () => {
   const viewer = document.querySelector("model-viewer");
   const url = await viewer.prepareUSDZ();
   const blob = await (await fetch(url)).blob();
   return { type: blob.type, data: await new Promise((resolve,reject)=>{
     const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(",")[1]); reader.onerror=reject;
     reader.readAsDataURL(blob);
   })};
 });
 assert.equal(sdk.type,"model/vnd.usdz+zip");
 await fs.writeFile(path.join(evidence,"quick-look-sdk.usdz"),Buffer.from(sdk.data,"base64"));
 const conversionSeconds=(performance.now()-convert)/1000;
 assert.equal((await guest.cookies()).length,0);
 const metadata=await(await tryRequest(()=>guest.request.get(app+"/api/v1/share/"+share.token,{timeout:12000}))).json();
 assert.equal(metadata.model_id,id);
 const head=await tryRequest(()=>guest.request.head(metadata.glb_url,{timeout:12000}));
 assert.equal(head.status(),200);
 assert.equal(head.headers()["content-type"],"model/gltf-binary");
 const range=await tryRequest(()=>guest.request.get(metadata.glb_url,{headers:{Range:"bytes=0-11"},timeout:12000}));
 assert.equal(range.status(),206); assert.equal((await range.body()).subarray(0,4).toString(),"glTF");
 assert.equal((await tryRequest(()=>guest.request.get(app+"/api/v1/models/"+id+"/glb",{timeout:12000}))).status(),404);
 const report={site:app, modelId:id, provider:job.provider, acceptedSeconds:+accepted.toFixed(2), generatedSeconds:+elapsed.toFixed(2),
  triangles:model.triangles, bytes:model.byte_size, beforeOrbit:before, wireframe:true, twoDownloads:true, decodedQR:Boolean(decoder), guest:true, range:true,
  networkRetries, conversionSeconds:+conversionSeconds.toFixed(2), physicalDevice:false, revokedByDeletion:false};
 await fs.writeFile(path.join(evidence,"deployed-browser.json"),JSON.stringify(report,null,2)+"\n");
 const deletion=await tryRequest(()=>owner.request.delete(app+"/api/v1/models/"+id,{headers:{Origin:app},timeout:12000}));
 assert.ok([204,404].includes(deletion.status()));
 assert.equal((await tryRequest(()=>guest.request.get(metadata.glb_url,{timeout:12000}))).status(),404);
 report.revokedByDeletion=true;
 report.deleteStatus=deletion.status();
 await fs.writeFile(path.join(evidence,"deployed-browser.json"),JSON.stringify(report,null,2)+"\n"); console.log(report);
} catch(e) {
 console.error(e.message.split("Call log:")[0].replace(/(?:\/ar\/|\/share\/)[\w-]+/g,"/[redacted]"));
 console.error(globalThis.guestErrors ?? []);
 if(mobile) console.error((await mobile.locator("body").innerText()).slice(-2000));
 else console.error((await page.locator("body").innerText()).slice(-2000)); process.exitCode=1;
} finally { await browser.close(); await fs.rm(tmp,{force:true,recursive:true}); }
