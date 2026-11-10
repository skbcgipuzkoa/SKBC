"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Refresh only attendance-authorized, already-prepared albums. Never creates a folder. */
export function ClassPhotoAutoSync({ classIds, fichaToken }: { classIds: string[]; fichaToken: string }) {
  const router=useRouter();
  const ids=classIds.join(",");
  useEffect(()=>{
    if(!ids) return;
    const controller=new AbortController();let busy=false;
    const pageVisible=()=>document.visibilityState!=="hidden";
    async function sync() {
      if(busy || !pageVisible()) return;
      busy=true;let added=0;let lastRefresh=0;
      try {
        for(const classId of ids.split(",")) {
          if(controller.signal.aborted) break;
          for(let pass=0;pass<100 && !controller.signal.aborted && pageVisible();pass++) {
            try {
              const response=await fetch(`/api/class-photos/${encodeURIComponent(classId)}/sync`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({fichaToken}),signal:controller.signal,cache:"no-store"});
              if(!response.ok)break;
              const result=await response.json();
              if(Number.isInteger(result.added) && result.added>0){added+=result.added;if(added===result.added || added-lastRefresh>=20){router.refresh();lastRefresh=added;}}
              if(!result.pending)break;
            } catch {break; /* Existing published photos remain available during a Drive outage. */}
          }
        }
        if(added>lastRefresh && !controller.signal.aborted) router.refresh();
      } finally {busy=false;}
    }
    void sync();const timer=setInterval(()=>void sync(),5*60*1000);
    return ()=>{controller.abort();clearInterval(timer);};
  },[ids,fichaToken,router]);
  return null;
}
