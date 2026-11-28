import sys, os, json, time, resource
sys.path.insert(0, sys.argv[1])
import infer
model, session = infer.load()
for res in (512, 1024, 2048):
    infer.TEXTURE_RESOLUTION = res
    out = f"{sys.argv[3]}/shoe-{res}.glb"
    t = infer.reconstruct(model, session, sys.argv[2], out, True)
    print(json.dumps({"texture": res, "seconds": round(t, 1), "bytes": os.path.getsize(out),
                      "process_peak_rss_mb": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss // 2**20}), flush=True)
