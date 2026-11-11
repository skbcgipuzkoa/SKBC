import {createAdminClient} from "@/lib/supabase/admin";
import {loadAllPages} from "@/lib/load-all-pages";
import {kidsGrades} from "@/lib/grades";

export type IndividualWork={mode:"adjust"|"replace";removedIds:string[];addedIds:string[]};
export type WorkItem={id:string;name:string;grade:string|null;category:string|null};
type Row={attendance_id:string;mode:IndividualWork["mode"];removed_ids:string[];added_ids:string[]};
type Attendance={id:string;member_id:string;class_id:string;official_grade:string|null;trained_grade:string|null;use_for_history:boolean|null;classes:{id:string;class_group:"kids"|"adults";closed:boolean;status:string|null}|null;members:{class:string}|null};
const targetedPrefix="SKBC_SYLLABUS_ITEM:";
const normalize=(value:string|null|undefined)=>String(value??"").trim().toUpperCase();
export const workUuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function applyIndividualWork(baseIds:string[],work?:IndividualWork):string[] {
  if(!work)return [...new Set(baseIds)];
  const removed=new Set(work.removedIds);
  return [...new Set([...(work.mode==="replace"?[]:baseIds.filter(id=>!removed.has(id))),...work.addedIds.filter(id=>!removed.has(id))])];
}
export async function loadIndividualWork(classId:string):Promise<Map<string,IndividualWork>> {
  const {data,error}=await createAdminClient().from("attendance_individual_work").select("attendance_id,mode,removed_ids,added_ids").eq("class_id",classId).returns<Row[]>();
  if(error)throw error;
  return new Map((data??[]).map(row=>[row.attendance_id,{mode:row.mode,removedIds:row.removed_ids,addedIds:row.added_ids}]));
}
async function attendanceForWork(attendanceId:string) {
  if(!workUuid.test(attendanceId))return null;
  const {data,error}=await createAdminClient().from("attendance_logs").select("id,member_id,class_id,official_grade,trained_grade,use_for_history,classes(id,class_group,closed,status),members(class)").eq("id",attendanceId).maybeSingle<Attendance>();
  if(error)throw error;
  if(!data?.classes || !data.members || data.members.class!==data.classes.class_group)return null;
  return {...data,classes:data.classes};
}
function childGrade(value:string|null) {
  const raw=normalize(value).replace(/\s+/g," ");
  const alias=raw==="MINARAI"?"BLANCO":raw.replace(" Y ","-").replace("MARRÓN","MARRON");
  return kidsGrades.find(grade=>normalize(grade)===alias)??"";
}
async function childContext(row:Attendance) {
  const db=createAdminClient();
  const [plan,old,extras,catalog]=await Promise.all([
    db.from("child_class_plans").select("syllabus_item_ids").eq("class_id",row.class_id).maybeSingle<{syllabus_item_ids:string[]|null}>(),
    db.from("child_attendance_work_overrides").select("work_mode,trained_grade").eq("attendance_id",row.id).maybeSingle<{work_mode:string;trained_grade:string|null}>(),
    db.from("child_class_group_work").select("notes").eq("class_id",row.class_id).contains("member_ids",[row.member_id]).like("notes",targetedPrefix+"%").returns<{notes:string}[]>(),
    loadAllPages<{id:string;title:string;grade:string|null;category:string|null}>((from,to)=>db.from("child_syllabus_items").select("id,title,grade,category,child_syllabus_contents!inner(archived_at)").eq("active",true).is("child_syllabus_contents.archived_at",null).order("id").range(from,to))
  ]);
  for(const result of [plan,old,extras])if(result.error)throw result.error;
  const planIds=plan.data?.syllabus_item_ids??[];
  const targeted=new Set((extras.data??[]).map(item=>item.notes.slice(targetedPrefix.length).trim()).filter(id=>workUuid.test(id)));
  const ids=[...new Set([...planIds,...targeted])];
  const source=ids.length?await db.from("child_syllabus_items").select("id,title,grade,category").in("id",ids).returns<{id:string;title:string;grade:string|null;category:string|null}[]>():{data:[],error:null};
  if(source.error)throw source.error;
  const raw=old.data?.work_mode==="own"?row.official_grade??row.trained_grade:old.data?.work_mode==="other_grade"?old.data.trained_grade:null;
  const grade=childGrade(raw),index=kidsGrades.findIndex(value=>value===grade);
  const target=old.data?.work_mode==="own"&&index>=0?kidsGrades[Math.min(index+1,kidsGrades.length-1)]:null;
  const allowed=new Set([raw,grade,target].map(value=>normalize(value).replace(/\s+/g," ")).filter(Boolean));
  const blocked=old.data?.work_mode==="observer";
  const format=(item:{id:string;title:string;grade:string|null;category:string|null})=>({id:item.id,name:item.title,grade:item.grade,category:item.category});
  return {blocked,baseline:blocked?[]:(source.data??[]).filter(item=>targeted.has(item.id)||!allowed.size||allowed.has(normalize(item.grade).replace(/\s+/g," "))).map(format),catalog:catalog.map(format)};
}
async function adultContext(row:Attendance) {
  const db=createAdminClient();
  const [plan,old,catalog]=await Promise.all([
    db.from("technical_plans").select("id,technique_id,technique_name,technique_grade,group_grade,category").eq("class_id",row.class_id).eq("completed",true).returns<{id:string;technique_id:string|null;technique_name:string;technique_grade:string|null;group_grade:string|null;category:string|null}[]>(),
    db.from("attendance_technical_overrides").select("plan_id").eq("attendance_id",row.id).eq("include_in_history",true).returns<{plan_id:string}[]>(),
    loadAllPages<WorkItem>((from,to)=>db.from("techniques").select("id,name,grade,category").eq("active",true).order("id").range(from,to))
  ]);
  if(plan.error||old.error)throw plan.error??old.error;
  const prior=new Set((old.data??[]).map(item=>item.plan_id));
  const grade=normalize(row.trained_grade??row.official_grade);
  const baseline=new Map<string,WorkItem>();
  for(const item of plan.data??[])if(item.technique_id&&(prior.size?prior.has(item.id):!!grade&&normalize(item.group_grade)===grade))baseline.set(item.technique_id,{id:item.technique_id,name:item.technique_name,grade:item.technique_grade,category:item.category});
  return {blocked:row.use_for_history!==true,baseline:[...baseline.values()],catalog};
}
export async function getIndividualWorkEditor(attendanceId:string) {
  const row=await attendanceForWork(attendanceId);if(!row)return null;
  const [context,saved]=await Promise.all([row.classes.class_group==="kids"?childContext(row):adultContext(row),loadIndividualWork(row.class_id)]);
  const work=saved.get(row.id);
  return {row,context,view:{...(work??{mode:"adjust" as const,removedIds:[],addedIds:[]}),saved:!!work,closed:(row.classes.closed&&row.classes.status!=="pending")||row.classes.status==="cancelled"||context.blocked,baseline:context.baseline,catalog:context.catalog.sort((a,b)=>(a.grade??"").localeCompare(b.grade??"","es")||a.name.localeCompare(b.name,"es"))}};
}
export async function saveIndividualWork(attendanceId:string,mode:IndividualWork["mode"]|"reset",removedIds:string[],addedIds:string[]) {
  const editor=await getIndividualWorkEditor(attendanceId);if(!editor)return "missing";
  if(editor.view.closed)return "closed";
  const catalog=new Set([...editor.view.catalog,...editor.view.baseline].map(item=>item.id));
  const baseline=new Set(editor.view.baseline.map(item=>item.id));
  if(mode!=="reset"&&(addedIds.some(id=>!catalog.has(id))||removedIds.some(id=>!baseline.has(id)&&!editor.view.removedIds.includes(id))))return "invalid";
  const {data,error}=await createAdminClient().rpc("save_attendance_individual_work",{
    p_attendance_id:attendanceId,p_class_id:editor.row.class_id,p_mode:mode,
    p_removed_ids:mode==="adjust"?[...new Set(removedIds)]:[],p_added_ids:[...new Set(addedIds)]
  });
  if(error)throw error;
  if(data!=="ok"&&data!=="missing"&&data!=="closed"&&data!=="closing")throw new Error("Unexpected individual work save result");
  return data as "ok"|"missing"|"closed"|"closing";
}
