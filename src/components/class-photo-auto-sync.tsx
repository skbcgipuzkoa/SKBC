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
    async function sync() {
      if(busy || document.visibilityState==="hidden") return;
      busy=true;let added=0;
      try {
        for(const classId of ids.split(",")) {
          if(controller.signal.aborted) break;
          try {
            const response=await fetch(`/api/class-photos/${encodeURIComponent(classId)}/sync`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({fichaToken}),signal:controller.signal,cache:"no-store"});
            if(response.ok) {const result=await response.json();if(Number.isInteger(result.added) && result.added>0)added+=result.added;}
          } catch { /* Existing published photos remain available during a Drive outage. */ }
        }
        if(added && !controller.signal.aborted) router.refresh();
      } finally {busy=false;}
    }
    void sync();const timer=setInterval(()=>void sync(),5*60*1000);
    return ()=>{controller.abort();clearInterval(timer);};
  },[ids,fichaToken,router]);
  return null;
}
