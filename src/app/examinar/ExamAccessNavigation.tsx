"use client";

import { useRouter } from "next/navigation";

export function ExamAccessNavigation() {
  const router = useRouter();
  function goBack() {
    if (window.history.length > 1) router.back();
    else router.replace("/examenes");
  }
  return <nav aria-label="Salir de esta pantalla" style={{display:"flex",flexWrap:"wrap",gap:12,marginTop:20}}>
    <button type="button" onClick={goBack} style={{minHeight:48,padding:"12px 24px"}}>Volver</button>
    <a className="secondary-link" href="/examenes" style={{display:"inline-flex",alignItems:"center",minHeight:48,padding:"12px 20px"}}>Ir a Exámenes</a>
  </nav>;
}
