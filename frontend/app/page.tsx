import { Suspense } from "react";
import { CreateWorkspace } from "@/components/viewer/CreateWorkspace";

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-obsidian text-sm text-ink-secondary">
          Loading Vision3D Studio…
        </div>
      }
    >
      <CreateWorkspace />
    </Suspense>
  );
}
