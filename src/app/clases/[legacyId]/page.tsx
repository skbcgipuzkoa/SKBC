import { ArrowLeft, Check, FileText, LogOut, RefreshCcw, Wand2 } from "lucide-react";
import { SidebarNav } from "@/app/components/SidebarNav";
import { notFound, redirect } from "next/navigation";
import {
  closeAdultClassAction,
  addManualClassTechniqueAction,
  addAttendanceAction,
  addBulkAttendanceAction,
  closeKidsClassAction,
  createClassDelegateLinkAction,
  deleteChildClassGroupWorkAction,
  deleteClassAction,
  generateAdultGroupsAction,
  generateAdultPlanAction,
  logoutAction,
  prepareAdultClassAction,
  finishClassCorrectionAction,
  reopenClassForCorrectionAction,
  removeManualClassTechniqueAction,
  removeAttendanceAction,
  saveAttendanceTechnicalReviewAction,
  saveChildAttendanceWorkReviewAction,
  saveChildClassPlanAction,
  updateClassAction,
  updateClassPlanTechniquesAction
} from "@/app/actions";
import { CopyLinkButton } from "@/components/copy-link-button";
import { ClassSectionNav, type ClassSectionLink } from "@/components/class-section-nav";
import { hasInternalAccess } from "@/lib/auth";
import { adultGrades, kidsGrades } from "@/lib/grades";
import { getKamokuSummaryFallback } from "@/lib/kamoku-summary-fallbacks";
import { createAdminClient } from "@/lib/supabase/admin";
import { adaptTechniqueSummary } from "@/lib/technique-summary-adapter";
import { AttendanceDayForm } from "./AttendanceDayForm";
import { ManualTechniqueForm } from "./ManualTechniqueForm";
import { PlanTechniqueForm } from "./PlanTechniqueForm";

type ClassRow = {
  id: string;
  legacy_id: string | null;
  class_date: string;
  name: string;
  class_group: "kids" | "adults";
  class_type: string | null;
  responsible: string | null;
  status: string;
  plan_generated: boolean;
  closed: boolean;
  notes: string | null;
};

type PlanRow = {
  id: string;
  legacy_id: string | null;
  group_grade: string | null;
  target_grade: string | null;
  technique_name: string;
  variant: string | null;
  variant_note: string | null;
  category: string | null;
  proposal_type: string | null;
  focus: string | null;
  summary_es: string | null;
  completed: boolean;
  notes: string | null;
  score_at_that_moment: number | null;
  techniques: {
    repetitions: number | null;
    last_trained_on: string | null;
    score: number | null;
    summary_es: string | null;
  } | null;
};

type GroupRow = {
  id: string;
  legacy_id: string | null;
  grade: string;
  active: boolean;
};

type AttendanceRow = {
  id: string;
  class_id?: string;
  attended_on: string;
  member_id: string;
  official_grade: string | null;
  trained_grade: string | null;
  technical_role: string | null;
  technical_note: string | null;
  members: { first_name: string; last_name: string | null; legacy_id: string | null; class: "kids" | "adults" } | null;
};

type MemberOption = {
  id: string;
  legacy_id: string | null;
  display_name: string;
  grade: string | null;
};

type AttendanceClassOption = {
  id: string;
  legacy_id: string | null;
  class_group: "kids" | "adults";
  closed: boolean;
  status: string;
};

type DelegateLinkRow = {
  token: string;
  expires_at: string;
  created_at: string;
  created_by: string | null;
};

type TechnicalOverrideRow = {
  attendance_id: string;
  plan_id: string;
};

type TechniqueOption = {
  id: string;
  grade: string;
  name: string;
  category: string | null;
  content_type: string | null;
  active: boolean;
};

type ChildClassPlanRow = {
  objective: string | null;
  activities: string[] | null;
  syllabus_item_ids: string[] | null;
  notes: string | null;
  updated_at: string | null;
};

type ChildSyllabusItemRow = {
  id: string;
  grade: string;
  title: string;
  category: string;
  description: string | null;
  exam_relevant: boolean;
  sort_order: number;
};

type ChildClassGroupWorkRow = {
  id: string;
  group_label: string;
  content: string;
  member_ids: string[] | null;
  notes: string | null;
  created_at: string;
};

type ChildWorkOverrideRow = {
  attendance_id: string;
  work_mode: string | null;
  trained_grade: string | null;
  notes: string | null;
};

export default async function ClaseDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ legacyId: string }>;
  searchParams: Promise<{ saved?: string; error?: string; detail?: string; step?: string; edit?: string; section?: string }>;
}) {
  if (!(await hasInternalAccess())) {
    redirect("/skbc-interno");
  }

  const [{ legacyId }, query] = await Promise.all([params, searchParams]);
  const supabase = createAdminClient();

  const { data: clase, error } = await supabase
    .from("classes")
    .select("id,legacy_id,class_date,name,class_group,class_type,responsible,status,plan_generated,closed,notes")
    .eq("legacy_id", legacyId)
    .single<ClassRow>();

  if (error || !clase) notFound();

  const [{ data: plan }, { data: attendance }, { data: groups }, { data: classMembers }, { data: delegateLinks }, { data: dayClasses }, { data: dayMembers }, { data: dayAttendance }, { data: techniqueOptions }] = await Promise.all([
    supabase
      .from("technical_plans")
      .select("id,legacy_id,group_grade,target_grade,technique_name,variant,variant_note,category,proposal_type,focus,summary_es,completed,notes,score_at_that_moment,techniques(repetitions,last_trained_on,score,summary_es)")
      .eq("class_id", clase.id)
      .order("group_grade")
      .order("suggested_order")
      .returns<PlanRow[]>(),
    supabase
      .from("attendance_logs")
      .select("id,attended_on,member_id,official_grade,trained_grade,technical_role,technical_note,members(first_name,last_name,legacy_id,class)")
      .eq("class_id", clase.id)
      .order("attended_on", { ascending: false })
      .returns<AttendanceRow[]>(),
    supabase
      .from("class_technical_groups")
      .select("id,legacy_id,grade,active")
      .eq("class_id", clase.id)
      .order("grade")
      .returns<GroupRow[]>(),
    supabase
      .from("members")
      .select("id,legacy_id,display_name,grade")
      .eq("class", clase.class_group)
      .eq("status", "active")
      .order("display_name")
      .returns<MemberOption[]>(),
    supabase
      .from("class_delegate_links")
      .select("token,expires_at,created_at,created_by")
      .eq("class_id", clase.id)
      .is("revoked_at", null)
      .is("closed_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .returns<DelegateLinkRow[]>(),
    supabase
      .from("classes")
      .select("id,legacy_id,class_group,closed,status")
      .eq("class_date", clase.class_date)
      .in("class_group", ["adults", "kids"])
      .returns<AttendanceClassOption[]>(),
    supabase
      .from("members")
      .select("id,legacy_id,display_name,grade,class")
      .eq("status", "active")
      .in("class", ["adults", "kids"])
      .order("display_name")
      .returns<Array<MemberOption & { class: "kids" | "adults" }>>(),
    supabase
      .from("attendance_logs")
      .select("id,class_id,attended_on,member_id,official_grade,trained_grade,technical_role,technical_note,members(first_name,last_name,legacy_id,class)")
      .in("class_id", (await supabase.from("classes").select("id").eq("class_date", clase.class_date).in("class_group", ["adults", "kids"]).returns<Array<{ id: string }>>()).data?.map((item) => item.id) ?? [])
      .returns<Array<AttendanceRow & { class_id: string }>>(),
    supabase
      .from("techniques")
      .select("id,grade,name,category,content_type,active")
      .eq("active", true)
      .order("grade")
      .order("name")
      .returns<TechniqueOption[]>()
  ]);

  const attendanceMemberIds = new Set((attendance ?? []).map((item) => item.member_id));
  const pendingClassMembers = (classMembers ?? []).filter((member) => !attendanceMemberIds.has(member.id));
  const completedPlan = (plan ?? []).filter((item) => item.completed).length;
  const manualCommonPlan = (plan ?? []).filter((item) => normalizeGradeLabel(item.proposal_type) === "COMUN MANUAL");
  const manualCommonSummary = summarizeManualCommonPlan(manualCommonPlan);
  const groupedPlan = groupPlanByGrade(plan ?? []);
  const adultTrainingGradeOptions = buildAdultTrainingGradeOptions(groups ?? []);
  const hasGroups = Boolean((groups ?? []).length);
  const hasPlan = Boolean((plan ?? []).length);
  const readyToClose = clase.class_group === "adults" && clase.plan_generated && !clase.closed;
  const readyToCloseKids = clase.class_group === "kids" && !clase.closed;
  const delegateLink = delegateLinks?.[0] ?? null;
  const delegateMode = delegateModeFromCreatedBy(delegateLink?.created_by) ?? (clase.class_group === "kids" ? "kids" : "adults");
  const delegateUrl = delegateLink ? `https://skbc.vercel.app/delegado/${delegateLink.token}?mode=${delegateMode}` : null;
  const isCorrectionMode = clase.status === "correction" || (dayClasses ?? []).some((item) => item.status === "correction");
  const canEditClosedClass = !clase.closed || isCorrectionMode;
  const correctionSection = String(query.edit ?? "");
  const activeStep = clase.class_group === "adults"
    ? ((clase.closed && !isCorrectionMode) || ["asistencia", "cierre"].includes(String(query.step ?? "")) || correctionSection.endsWith("attendance") ? "attendance" : "techniques")
    : "attendance";
  const techniqueStepHref = `/clases/${legacyId}`;
  const attendanceStepHref = `/clases/${legacyId}?step=asistencia`;
  if (clase.class_group === "adults" && activeStep === "attendance" && !(dayClasses ?? []).some((item) => item.class_group === "kids")) {
    const autoKidsLegacyId = `AUTO-KIDS-${clase.class_date}-${Date.now()}`;
    const { error: autoKidsError } = await supabase.from("classes").insert({
      legacy_id: autoKidsLegacyId,
      class_date: clase.class_date,
      name: `NIÑOS ${clase.class_date}`,
      class_group: "kids",
      class_type: clase.class_type ?? "NORMAL",
      responsible: clase.responsible,
      notes: "Clase infantil paralela creada automaticamente para asistencia del dia.",
      status: "pending"
    });

    if (!autoKidsError) {
      redirect(attendanceStepHref);
    }

    console.error("Error auto creating kids attendance class", autoKidsError);
  }
  const attendanceClasses = ["adults", "kids"].map((group) => (dayClasses ?? []).find((item) => item.class_group === group)).filter(Boolean) as AttendanceClassOption[];
  const adultCorrectionClass = attendanceClasses.find((item) => item.class_group === "adults");
  const kidsCorrectionClass = attendanceClasses.find((item) => item.class_group === "kids");
  const isCombinedDay = clase.class_group === "adults" && attendanceClasses.some((item) => item.class_group === "kids");
  const attendancePanelClasses = isCorrectionMode && correctionSection === "kids-attendance"
    ? attendanceClasses.filter((item) => item.class_group === "kids")
    : isCorrectionMode && correctionSection === "adult-attendance"
      ? attendanceClasses.filter((item) => item.class_group === "adults")
      : isCombinedDay && !clase.closed
        ? attendanceClasses.filter((item) => item.class_group === "adults")
        : attendanceClasses;
  const registeredAttendanceGroups = clase.class_group === "adults" && activeStep === "attendance"
    ? attendanceClasses.map((dayClass) => ({
      title: dayClass.class_group === "kids" ? "Ninos" : "Adultos",
      rows: (dayAttendance ?? []).filter((item) => item.class_id === dayClass.id)
    })).filter((group) => group.rows.length)
    : [{ title: clase.class_group === "kids" ? "Ninos" : "Adultos", rows: attendance ?? [] }];
  const totalDayAttendance = attendanceClasses.length > 1
    ? (dayAttendance ?? []).filter((item) => attendanceClasses.some((dayClass) => dayClass.id === item.class_id)).length
    : (attendance?.length ?? 0);
  const kidsDayClass = (dayClasses ?? []).find((item) => item.class_group === "kids");
  const adultAttendanceRows = (dayAttendance ?? []).filter((item) => item.class_id === clase.id && item.members?.class === "adults");
  const specialAdultAttendanceRows = adultAttendanceRows.filter((item) => {
    const role = normalizeGradeLabel(item.technical_role ?? "student");
    const trainedGrade = normalizeGradeLabel(item.trained_grade);
    const officialGrade = normalizeGradeLabel(item.official_grade);
    return role !== "STUDENT" || (trainedGrade && officialGrade && trainedGrade !== officialGrade);
  });
  const reviewableAdultAttendanceRows = specialAdultAttendanceRows.length ? specialAdultAttendanceRows : adultAttendanceRows;
  const completedHistoryPlan = (plan ?? []).filter((item) => item.completed && item.id);
  const { data: technicalOverrides } = reviewableAdultAttendanceRows.length
    ? await supabase
      .from("attendance_technical_overrides")
      .select("attendance_id,plan_id")
      .eq("class_id", clase.id)
      .in("attendance_id", reviewableAdultAttendanceRows.map((item) => item.id))
      .eq("include_in_history", true)
      .returns<TechnicalOverrideRow[]>()
    : { data: [] as TechnicalOverrideRow[] };
  const technicalOverridesByAttendance = groupOverridesByAttendance(technicalOverrides ?? []);
  const kidsAttendedIds = new Set((dayAttendance ?? []).filter((item) => item.class_id === kidsDayClass?.id).map((item) => item.member_id));
  const kidsDayMembers = (dayMembers ?? []).filter((member) => member.class === "kids");
  const pendingKidsDayMembers = kidsDayMembers.filter((member) => !kidsAttendedIds.has(member.id));
  const childPlanClass = clase.class_group === "kids" ? { id: clase.id, legacy_id: clase.legacy_id } : kidsDayClass;
  const childSyllabusGrades = [...new Set(kidsDayMembers.flatMap((member) => childSyllabusGradeCandidates(member.grade)).filter(Boolean))] as string[];
  const fallbackChildSyllabusGrades = childSyllabusGradeCandidates(...kidsGrades);
  const childSyllabusGradeFilter = childSyllabusGrades.length ? childSyllabusGrades : fallbackChildSyllabusGrades;
  const childSyllabusGradeKeys = new Set(childSyllabusGradeFilter.map(normalizeChildGradeKey));
  const [{ data: childClassPlan }, { data: childClassGroupWork }] = childPlanClass?.id
    ? await Promise.all([
      supabase
        .from("child_class_plans")
        .select("objective,activities,syllabus_item_ids,notes,updated_at")
        .eq("class_id", childPlanClass.id)
        .maybeSingle<ChildClassPlanRow>(),
      supabase
        .from("child_class_group_work")
        .select("id,group_label,content,member_ids,notes,created_at")
        .eq("class_id", childPlanClass.id)
        .order("created_at", { ascending: true })
        .returns<ChildClassGroupWorkRow[]>()
    ])
    : [{ data: null as ChildClassPlanRow | null }, { data: [] as ChildClassGroupWorkRow[] }];
  const { data: childExamSyllabusItems } = childPlanClass?.id
    ? await supabase
      .from("child_syllabus_items")
      .select("id,grade,title,category,description,exam_relevant,sort_order")
      .eq("active", true)
      .eq("exam_relevant", true)
      .order("sort_order", { ascending: true })
      .returns<ChildSyllabusItemRow[]>()
    : { data: [] as ChildSyllabusItemRow[] };
  const childExamSyllabusItemsForClass = filterChildSyllabusItemsByGrade(childExamSyllabusItems ?? [], childSyllabusGradeKeys);
  const { data: fallbackChildSyllabusItems } = childPlanClass?.id && !childExamSyllabusItemsForClass.length
    ? await supabase
      .from("child_syllabus_items")
      .select("id,grade,title,category,description,exam_relevant,sort_order")
      .eq("active", true)
      .order("sort_order", { ascending: true })
      .returns<ChildSyllabusItemRow[]>()
    : { data: [] as ChildSyllabusItemRow[] };
  const fallbackChildSyllabusItemsForClass = filterChildSyllabusItemsByGrade(fallbackChildSyllabusItems ?? [], childSyllabusGradeKeys);
  const childSyllabusItems = childExamSyllabusItemsForClass.length ? childExamSyllabusItemsForClass : fallbackChildSyllabusItemsForClass;
  const childAttendanceRows = childPlanClass?.id
    ? (dayAttendance ?? []).filter((item) => item.class_id === childPlanClass.id && item.members?.class === "kids")
    : [];
  const { data: childWorkOverrides } = childPlanClass?.id && childAttendanceRows.length
    ? await supabase
      .from("child_attendance_work_overrides")
      .select("attendance_id,work_mode,trained_grade,notes")
      .eq("class_id", childPlanClass.id)
      .in("attendance_id", childAttendanceRows.map((item) => item.id))
      .returns<ChildWorkOverrideRow[]>()
    : { data: [] as ChildWorkOverrideRow[] };
  const childWorkOverridesByAttendance = new Map((childWorkOverrides ?? []).map((item) => [item.attendance_id, item]));
  const adultDayMembers = (dayMembers ?? []).filter((member) => member.class === "adults");
  const adultAttendedIds = new Set((dayAttendance ?? []).filter((item) => item.class_id === clase.id && item.members?.class === "adults").map((item) => item.member_id));
  const adultPendingMembers = adultDayMembers.filter((member) => !adultAttendedIds.has(member.id));
  const kidsRegisteredCount = kidsDayMembers.length - pendingKidsDayMembers.length;
  const adultRegisteredCount = adultDayMembers.length - adultPendingMembers.length;
  const mustRegisterKidsFirst =
    isCombinedDay &&
    activeStep === "techniques" &&
    Boolean(kidsDayClass) &&
    !kidsDayClass?.closed &&
    kidsDayMembers.length > 0 &&
    kidsRegisteredCount === 0;
  const combinedStep = isCombinedDay
    ? (clase.closed && !isCorrectionMode) || query.step === "cierre"
      ? "close"
      : mustRegisterKidsFirst
        ? "kids"
        : query.step === "asistencia"
          ? "adult-attendance"
          : "techniques"
    : null;
  const showKidsPrelude = clase.class_group === "adults" && activeStep === "techniques" && Boolean(kidsDayClass) && !kidsDayClass?.closed && (!isCombinedDay || combinedStep === "kids");
  const showAdultTechniques = clase.class_group === "adults" && activeStep === "techniques" && (!isCorrectionMode || correctionSection === "adult-technical") && (!mustRegisterKidsFirst || query.section === "adult-technical") && (!isCombinedDay || combinedStep === "techniques" || isCorrectionMode || query.section === "adult-technical");
  const showAttendanceStep = isCorrectionMode
    ? correctionSection === "kids-attendance" || correctionSection === "adult-attendance"
    : clase.class_group !== "adults" || activeStep === "attendance" || clase.closed;
  const showAdultAttendancePanel = showAttendanceStep && (isCorrectionMode || !isCombinedDay || combinedStep === "adult-attendance" || clase.closed);
  const showCombinedCloseStep = !isCorrectionMode && isCombinedDay && combinedStep === "close";
  const classMission = buildClassMission({
    classGroup: clase.class_group,
    activeStep,
    combinedStep,
    closed: clase.closed,
    isCombinedDay,
    kidsRegistered: kidsRegisteredCount,
    kidsTotal: kidsDayMembers.length,
    adultRegistered: adultRegisteredCount,
    adultTotal: adultDayMembers.length,
    completedPlan,
    totalPlan: (plan ?? []).length,
    mustRegisterKidsFirst
  });
  const kidsEarlyAttendancePanel = showKidsPrelude && kidsDayClass && !kidsDayClass.closed ? (
    <details className={mustRegisterKidsFirst ? "card early-kids-attendance class-flow-focus" : "card early-kids-attendance"} id="asistencia-ninos-rapida" open={mustRegisterKidsFirst || undefined}>
      <summary>
        <strong>1. Asistencia de ninos</strong>
        <span>{kidsDayMembers.length - pendingKidsDayMembers.length}/{kidsDayMembers.length} registrados</span>
      </summary>
      <p className="muted class-flow-note">Primero marca los ninos que han venido. Al guardar, la pantalla cambia al plan tecnico adulto.</p>
      <ChildLightPlanPanel
        classId={kidsDayClass.id}
        legacyId={kidsDayClass.legacy_id ?? legacyId}
        returnTo={`/clases/${legacyId}?saved=kids-plan`}
        plan={childClassPlan}
        groupWork={childClassGroupWork ?? []}
        syllabusItems={childSyllabusItems ?? []}
        members={kidsDayMembers}
        compact
        open={query.section === "kids-technical"}
      />
      <form action={addBulkAttendanceAction} className="attendance-day-form">
        <input type="hidden" name="classId" value={kidsDayClass.id} />
        <input type="hidden" name="legacyId" value={kidsDayClass.legacy_id ?? legacyId} />
        <input type="hidden" name="returnLegacyId" value={legacyId} />
        <input type="hidden" name="returnStep" value="" />
        <input type="hidden" name="groupClassIds" value={kidsDayClass.id} />
        <div className="attendance-checklist">
          {pendingKidsDayMembers.length ? pendingKidsDayMembers.map((member) => (
            <label className="check-row" key={member.id}>
              <input name={`memberIds:${kidsDayClass.id}`} type="checkbox" value={member.id} />
              <span>
                <strong>{member.display_name}</strong>
                <small>{member.grade ?? "Sin grado"}</small>
              </span>
            </label>
          )) : <p className="muted">Todos los ninos activos estan ya en asistencia.</p>}
        </div>
        <div className="form-actions">
          <button type="submit" disabled={!pendingKidsDayMembers.length}>Guardar ninos y abrir plan adulto</button>
        </div>
      </form>
      <form action={closeKidsClassAction} className="skip-kids-class-form">
        <input type="hidden" name="classId" value={kidsDayClass.id} />
        <input type="hidden" name="legacyId" value={kidsDayClass.legacy_id ?? legacyId} />
        <input type="hidden" name="returnLegacyId" value={legacyId} />
        <input type="hidden" name="returnStep" value="" />
        <button className="secondary-button button-reset" type="submit">Saltar clase de ninos y seguir con adultos</button>
        <p className="muted">Usalo solo si hoy no hay clase infantil. No crea asistencias de ninos.</p>
      </form>
    </details>
  ) : null;
  const attendancePanel = (
    <AttendanceDayForm action={addBulkAttendanceAction}>
      <input type="hidden" name="classId" value={clase.id} />
      <input type="hidden" name="legacyId" value={legacyId} />
      <input type="hidden" name="returnLegacyId" value={legacyId} />
      <input type="hidden" name="returnStep" value={isCombinedDay ? "cierre" : "asistencia"} />
      <input type="hidden" name="returnTo" value={isCorrectionMode ? `/clases/${legacyId}?edit=${correctionSection}#asistencia` : `/clases/${legacyId}?step=${isCombinedDay ? "cierre" : "asistencia"}#asistencia`} />
      <div className="attendance-group-stack">
        {attendancePanelClasses.map((dayClass) => {
          const attendedIds = new Set((dayAttendance ?? []).filter((item) => item.class_id === dayClass.id).map((item) => item.member_id));
          const membersForGroup = (dayMembers ?? []).filter((member) => member.class === dayClass.class_group);
          const pendingMembers = membersForGroup.filter((member) => !attendedIds.has(member.id));
          const title = dayClass.class_group === "kids" ? "Ninos" : "Adultos";
          return (
            <details className="card attendance-group-panel" key={dayClass.id} open data-attendance-group>
              <summary>
                <strong>{title}</strong>
                <span>{membersForGroup.length - pendingMembers.length}/{membersForGroup.length} registrados</span>
              </summary>
              <input type="hidden" name="groupClassIds" value={dayClass.id} />
              <div className="attendance-checklist">
                  {dayClass.closed ? <p className="muted">Acta cerrada: puedes anadir asistencias que faltaban como correccion.</p> : null}
                  <div className="mobile-focus-head">
                    <div>
                      <small>Pasar asistencia</small>
                      <strong>{title}</strong>
                    </div>
                    <button type="button" data-close-attendance-focus aria-label={`Cerrar asistencia ${title}`}>Cerrar</button>
                  </div>
                  {pendingMembers.length ? pendingMembers.map((member) => (
                    <label className="check-row" key={member.id}>
                      <input name={`memberIds:${dayClass.id}`} type="checkbox" value={member.id} />
                      <span>
                        <strong>{member.display_name}</strong>
                        <small>{member.grade ?? "Sin grado"}</small>
                      </span>
                      {dayClass.class_group === "adults" ? (
                        <span className="attendance-options">
                          <select name={`trainedGrade:${dayClass.id}:${member.id}`} defaultValue="">
                            <option value="">Su grupo ({member.grade ?? "automatico"})</option>
                            {adultTrainingGradeOptions.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
                          </select>
                          <select name={`technicalRole:${dayClass.id}:${member.id}`} defaultValue="student">
                            <option value="student">Entrena</option>
                            <option value="reviewing">Parcial / salio antes</option>
                            <option value="teaching">Ensenando +1</option>
                            <option value="support">Apoyo</option>
                            <option value="observing">Observa</option>
                          </select>
                        </span>
                      ) : null}
                    </label>
                  )) : <p className="muted">Todos los kenshis activos de {title.toLowerCase()} estan ya en asistencia.</p>}
                </div>
            </details>
          );
        })}
      </div>
      <div className="attendance-day-actions">
        <p className="muted">
          {clase.closed
            ? "Marca solo las asistencias que faltaban. Se guardaran como correccion del acta cerrada."
            : "Marca la asistencia pendiente. Si ya esta todo correcto, usa el boton azul para cerrar todo junto."}
        </p>
        <button type="submit">{clase.closed ? "Guardar correcciones" : "Guardar sin cerrar"}</button>
        {!clase.closed ? (
          <button className="primary-link button-reset" type="submit" name="closeAfter" value="true">
            <Check aria-hidden="true" size={16} />
            Guardar y cerrar todo
          </button>
        ) : null}
      </div>
    </AttendanceDayForm>
  );
  const technicalReviewPanel = clase.class_group === "adults" && (activeStep === "attendance" || showCombinedCloseStep || (isCorrectionMode && correctionSection === "adult-technical")) && canEditClosedClass && hasPlan ? (
    <details className="card technical-review-panel">
      <summary>
        <strong>Ajustar tecnicas por salida parcial</strong>
        <span>{specialAdultAttendanceRows.length ? `${specialAdultAttendanceRows.length} especial${specialAdultAttendanceRows.length === 1 ? "" : "es"}` : "opcional"}</span>
      </summary>
      {!reviewableAdultAttendanceRows.length ? (
        <p className="muted">Primero guarda la asistencia de adultos. Despues podras corregir aqui si alguien salio antes, observo, enseno o entreno con otro grupo.</p>
      ) : !completedHistoryPlan.length ? (
        <p className="muted">Primero marca y guarda las tecnicas realizadas. Despues podras elegir exactamente cuales se adjuntan a cada asistente.</p>
      ) : (
      <form action={saveAttendanceTechnicalReviewAction} className="technical-review-form">
        <input type="hidden" name="classId" value={clase.id} />
        <input type="hidden" name="legacyId" value={legacyId} />
        <input type="hidden" name="returnTo" value={`/clases/${legacyId}?step=${showCombinedCloseStep ? "cierre" : "asistencia"}#asistencia`} />
        <input type="hidden" name="returnStep" value={showCombinedCloseStep ? "cierre" : "asistencia"} />
        <p className="muted">Abre esto solo si alguien cambio de grupo, enseno parte de la clase, observo o salio antes. Por defecto aparecen marcadas las tecnicas de su grupo; desmarca las que no hizo para que no se adjunten por error.</p>
        <div className="technical-review-stack">
          {reviewableAdultAttendanceRows.map((row) => {
            const selectedOverrides = technicalOverridesByAttendance.get(row.id);
            const defaultPlanIds = new Set(
              completedHistoryPlan
                .filter((item) => normalizeGradeLabel(item.group_grade) === normalizeGradeLabel(row.trained_grade ?? row.official_grade))
                .map((item) => item.id)
            );
            const selectedPlanIds = selectedOverrides ?? defaultPlanIds;
            const memberName = `${row.members?.first_name ?? ""} ${row.members?.last_name ?? ""}`.trim();
            return (
              <details className="technical-review-member" key={row.id}>
                <summary>
                  <strong>{memberName || "Kenshi"}</strong>
                  <span>{row.trained_grade ?? row.official_grade ?? "Sin grado"} · {selectedPlanIds.size} tecnicas</span>
                </summary>
                <input type="hidden" name="attendanceIds" value={row.id} />
                <div className="class-technical-review-grid">
                  {groupPlanByGrade(completedHistoryPlan).map(([grade, rows]) => (
                    <fieldset className="technical-review-grade" key={`${row.id}-${grade}`}>
                      <legend>{grade}</legend>
                      {rows.map((item) => (
                        <label className="mini-check-row" key={`${row.id}-${item.id}`}>
                          <input
                            name={`review:${row.id}`}
                            type="checkbox"
                            value={item.id}
                            defaultChecked={selectedPlanIds.has(item.id)}
                          />
                          <span>
                            <strong>{item.technique_name}</strong>
                            <small>{item.category ?? "tecnica"} · {item.proposal_type ?? item.focus ?? "programa"}</small>
                          </span>
                        </label>
                      ))}
                    </fieldset>
                  ))}
                </div>
              </details>
            );
          })}
        </div>
        <div className="attendance-day-actions">
          <button type="submit">Guardar revision</button>
          <button className="primary-link button-reset" type="submit" name="closeAfter" value="true">
            <Check aria-hidden="true" size={16} />
            Guardar revision y cerrar clase
          </button>
        </div>
      </form>
      )}
    </details>
  ) : null;
  const childWorkReviewPanel = childPlanClass?.id && childAttendanceRows.length ? (
    <details className="card technical-review-panel child-work-review-panel">
      <summary>
        <strong>Ajuste tecnico infantil por alumno</strong>
        <span>{childAttendanceRows.length} asistentes</span>
      </summary>
      {!(childSyllabusItems ?? []).length ? (
        <p className="muted">Primero define algun punto del programa infantil o selecciona material del plan infantil.</p>
      ) : (
        <form action={saveChildAttendanceWorkReviewAction} className="technical-review-form">
          <input type="hidden" name="classId" value={childPlanClass.id} />
          <input type="hidden" name="legacyId" value={childPlanClass.legacy_id ?? legacyId} />
          <input type="hidden" name="returnLegacyId" value={legacyId} />
          <input type="hidden" name="returnStep" value={isCombinedDay ? "asistencia" : ""} />
          <p className="muted">
            Por defecto todos reciben el trabajo comun del dia. Usa esto solo si has separado a algun nino por grado,
            si ha trabajado otro grupo o si solo ha observado.
          </p>
          <div className="technical-review-stack">
            {childAttendanceRows.map((row) => {
              const override = childWorkOverridesByAttendance.get(row.id);
              const mode = override?.work_mode ?? "common";
              const memberName = `${row.members?.first_name ?? ""} ${row.members?.last_name ?? ""}`.trim();
              const targetGrade = nextKidGrade(row.official_grade) ?? normalizeKidGrade(row.official_grade) ?? row.official_grade ?? "";
              const selectedGrade = override?.trained_grade ?? targetGrade;
              return (
                <details className="technical-review-member" key={row.id}>
                  <summary>
                    <strong>{memberName || "Kenshi"}</strong>
                    <span>{childWorkModeLabel(mode)}{mode === "other_grade" && selectedGrade ? ` - ${selectedGrade}` : ""}</span>
                  </summary>
                  <input type="hidden" name="attendanceIds" value={row.id} />
                  <div className="child-work-review-grid">
                    <label>
                      Trabajo realizado
                      <select name={`childWorkMode:${row.id}`} defaultValue={mode}>
                        <option value="common">Trabajo comun del grupo</option>
                        <option value="own">Su grado objetivo</option>
                        <option value="other_grade">Entreno otro grado</option>
                        <option value="observer">Solo observo</option>
                      </select>
                    </label>
                    <label>
                      Grado entrenado si no fue comun
                      <select name={`childTrainedGrade:${row.id}`} defaultValue={selectedGrade}>
                        <option value="">Elegir grado</option>
                        {kidsGrades.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
                      </select>
                    </label>
                    <label className="wide">
                      Nota opcional
                      <textarea
                        name={`childWorkNotes:${row.id}`}
                        defaultValue={override?.notes ?? ""}
                        placeholder="Ej. trabajo con grupo de verdes, observo por lesion..."
                      />
                    </label>
                  </div>
                </details>
              );
            })}
          </div>
          <div className="attendance-day-actions">
            <button type="submit">Guardar ajustes infantiles</button>
          </div>
        </form>
      )}
    </details>
  ) : null;
  const attendanceQuickPanel = (
    <article className="card">
      <h2>Asistencia final</h2>
      <>
          {clase.closed ? <p className="muted">Acta cerrada: puedes anadir asistencias que faltaban como correccion.</p> : null}
          <form action={addBulkAttendanceAction} className="quick-form">
            <input type="hidden" name="classId" value={clase.id} />
            <input type="hidden" name="legacyId" value={legacyId} />
            <input type="hidden" name="returnTo" value={isCorrectionMode ? `/clases/${legacyId}?edit=${correctionSection}#asistencia` : `/clases/${legacyId}?step=asistencia#asistencia`} />
            <div className="attendance-checklist">
              {pendingClassMembers.length ? pendingClassMembers.map((member) => (
                <label className="check-row" key={member.id}>
                  <input name="memberIds" type="checkbox" value={member.id} />
                  <span>
                    <strong>{member.display_name}</strong>
                    <small>{member.grade ?? "Sin grado"}</small>
                  </span>
                </label>
              )) : <p className="muted">Todos los kenshis activos de esta clase estan ya en asistencia.</p>}
            </div>
            <div className="form-actions">
              <button type="submit" disabled={!pendingClassMembers.length}>
                {clase.closed ? "Guardar correcciones" : "Anadir seleccionados"}
              </button>
              {!clase.closed ? (
                <button className="secondary-button" type="submit" name="closeAfter" value="true" disabled={!pendingClassMembers.length}>
                  Guardar asistencia y cerrar clase
                </button>
              ) : null}
            </div>
          </form>
          {clase.class_group === "adults" ? <details className="advanced-details">
            <summary>Anadir uno con grado entrenado manual</summary>
            <form action={addAttendanceAction} className="quick-form">
              <input type="hidden" name="classId" value={clase.id} />
              <input type="hidden" name="legacyId" value={legacyId} />
              <label>
                Kenshi
                <select name="memberId" required>
                  <option value="">Seleccionar</option>
                  {pendingClassMembers.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.display_name} - {member.grade ?? "Sin grado"}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Grado oficial
                <select name="officialGrade">
                  <option value="">Usar ficha</option>
                  {adultGrades.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
                </select>
              </label>
              <label>
                Grado entrenado
                <select name="trainedGrade">
                  <option value="">Automatico</option>
                  {adultTrainingGradeOptions.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
                </select>
              </label>
              <button type="submit">Anadir uno</button>
            </form>
          </details> : null}
        </>
    </article>
  );
  const requestedSection = String(query.section ?? "");
  const currentClassSection = requestedSection === "kids-technical" || requestedSection === "adult-technical"
    ? requestedSection
    : clase.class_group === "kids"
      ? "kids-attendance"
      : combinedStep === "kids"
        ? "kids-attendance"
        : combinedStep === "adult-attendance" || activeStep === "attendance"
          ? "adult-attendance"
          : combinedStep === "close"
            ? "close"
            : "adult-technical";
  const classSectionLinks: ClassSectionLink[] = [
    ...(kidsDayClass || clase.class_group === "kids" ? [
      { id: "kids-attendance", label: "Asistencia ninos", href: `/clases/${legacyId}#asistencia-ninos-rapida`, done: kidsRegisteredCount > 0 || Boolean(clase.class_group === "kids" && attendance?.length) },
      { id: "kids-technical", label: "Tecnica ninos", href: `/clases/${legacyId}?section=kids-technical#tecnica-ninos`, done: Boolean(childClassPlan?.objective || childClassPlan?.syllabus_item_ids?.length || childClassGroupWork?.length) }
    ] : []),
    ...(clase.class_group === "adults" ? [
      { id: "adult-technical", label: "Tecnica adultos", href: `/clases/${legacyId}?section=adult-technical#plan-tecnico`, done: completedPlan > 0 },
      { id: "adult-attendance", label: "Asistencia adultos", href: `/clases/${legacyId}?step=asistencia#asistencia`, done: adultRegisteredCount > 0 }
    ] : []),
    { id: "close", label: "Revisar y cerrar", href: clase.class_group === "adults" ? `/clases/${legacyId}?step=cierre#revision-final` : `/clases/${legacyId}#cierre-clase`, done: clase.closed }
  ];

  return (
    <div className="shell">
      <SidebarNav current="/clases" />
      <main className="main class-detail-main">
        <div className="topbar">
          <div>
            <p className="eyebrow">
              <a className="text-link" href="/clases"><ArrowLeft size={14} aria-hidden="true" /> Volver</a>
            </p>
            <h1>{clase.name}</h1>
          </div>
          <div className="top-actions">
            {clase.class_group === "adults" && !clase.plan_generated && !clase.closed ? (
              <form action={prepareAdultClassAction}>
                <input type="hidden" name="classId" value={clase.id} />
                <input type="hidden" name="legacyId" value={legacyId} />
                <button className="primary-link button-reset" type="submit">
                  <Wand2 aria-hidden="true" size={16} />
                  {hasGroups && !hasPlan ? "Completar plan tecnico" : "Preparar clase"}
                </button>
              </form>
            ) : null}
            {clase.class_group === "adults" && !hasGroups && !clase.plan_generated && !clase.closed ? (
              <form action={generateAdultGroupsAction}>
                <input type="hidden" name="classId" value={clase.id} />
                <input type="hidden" name="legacyId" value={legacyId} />
                <button className="primary-link secondary-link button-reset" type="submit">
                  <Wand2 aria-hidden="true" size={16} />
                  Generar grupos
                </button>
              </form>
            ) : null}
            {clase.class_group === "adults" && !hasPlan && !clase.plan_generated && !clase.closed ? (
              <form action={generateAdultPlanAction}>
                <input type="hidden" name="classId" value={clase.id} />
                <input type="hidden" name="legacyId" value={legacyId} />
                <button className="primary-link secondary-link button-reset" type="submit">
                  <Wand2 aria-hidden="true" size={16} />
                  Generar plan tecnico
                </button>
              </form>
            ) : null}
            
            {readyToCloseKids ? (
              <form action={closeKidsClassAction}>
                <input type="hidden" name="classId" value={clase.id} />
                <input type="hidden" name="legacyId" value={legacyId} />
                <button className="primary-link button-reset" type="submit">
                  <Check aria-hidden="true" size={16} />
                  Cerrar clase
                </button>
              </form>
            ) : null}
            <form action={logoutAction}>
              <button className="icon-button" type="submit" title="Salir" aria-label="Salir">
                <LogOut aria-hidden="true" size={18} />
              </button>
            </form>
          </div>
        </div>

        {query.saved === "plan" ? <p className="save-ok">Plan tecnico generado.</p> : null}
        {query.saved === "class" ? <p className="save-ok">Clase creada.</p> : null}
        {query.saved === "class-updated" ? <p className="save-ok">Clase actualizada.</p> : null}
        {query.saved === "class-prepared" ? <p className="save-ok">Clase creada con grupos y plan tecnico.</p> : null}
        {query.saved === "prepare" ? <p className="save-ok">Clase preparada: grupos y plan tecnico listos.</p> : null}
        {query.saved === "groups" ? <p className="save-ok">Grupos tecnicos generados.</p> : null}
        {query.saved === "attendance" ? <p className="save-ok">Asistencia anadida.</p> : null}
        {query.saved === "kids-skipped" ? <p className="save-ok">Clase de ninos saltada. Puedes continuar con el plan adulto.</p> : null}
        {query.saved === "kids-work-review" ? <p className="save-ok">Ajuste tecnico infantil guardado.</p> : null}
        {query.saved === "attendance-removed" ? <p className="save-ok">Asistencia quitada.</p> : null}
        {query.saved === "plan-technique" ? <p className="save-ok">Tecnica actualizada.</p> : null}
        {query.saved === "manual-technique" ? <p className="save-ok">Tecnica comun anadida al plan de clase.</p> : null}
        {query.saved === "manual-technique-remove" ? <p className="save-ok">Tecnica comun quitada de la clase.</p> : null}
        {query.saved === "kids-plan" ? <p className="save-ok">Plan infantil opcional guardado.</p> : null}
        {query.saved === "kids-plan-delete" ? <p className="save-ok">Trabajo infantil por grupo quitado.</p> : null}
        {query.saved === "close" ? <p className="save-ok">Clase cerrada y registros tecnicos generados.</p> : null}
        {query.saved === "correction-opened" ? <p className="save-ok">Clase reabierta para correccion. Elige que quieres modificar.</p> : null}
        {query.saved === "correction-closed" ? <p className="save-ok">Correcciones guardadas y clase cerrada de nuevo.</p> : null}
        {query.saved === "delegate" ? <p className="save-ok">Enlace de sustituto generado.</p> : null}
        {query.error === "plan" ? (
          <p className="form-error">No se ha podido generar el plan tecnico{query.detail ? `: ${query.detail}` : " para esta clase."}</p>
        ) : null}
        {query.error === "class" ? (
          <p className="form-error">No se ha podido actualizar la clase.</p>
        ) : null}
        {query.error === "delete" ? (
          <p className="form-error">No se ha podido eliminar la clase. Escribe ELIMINAR y vuelve a intentarlo.</p>
        ) : null}
        {query.error === "prepare" ? (
          <p className="form-error">No se ha podido preparar la clase{query.detail ? `: ${query.detail}` : "."}</p>
        ) : null}
        {query.error === "groups" ? (
          <p className="form-error">No se han podido generar los grupos tecnicos.</p>
        ) : null}
        {query.error === "attendance" ? (
          <p className="form-error">No se ha podido anadir la asistencia.</p>
        ) : null}
        {query.error === "kids-work-review" ? (
          <p className="form-error">No se ha podido guardar el ajuste tecnico infantil.</p>
        ) : null}
        {query.error === "plan-technique" ? (
          <p className="form-error">No se ha podido actualizar la tecnica.</p>
        ) : null}
        {query.error === "manual-technique" ? (
          <p className="form-error">No se ha podido anadir la tecnica comun{query.detail ? `: ${query.detail}` : "."}</p>
        ) : null}
        {query.error === "manual-technique-remove" ? (
          <p className="form-error">No se ha podido quitar la tecnica comun{query.detail ? `: ${query.detail}` : "."}</p>
        ) : null}
        {query.error === "kids-plan" ? (
          <p className="form-error">No se ha podido guardar el plan infantil{query.detail ? `: ${query.detail}` : "."}</p>
        ) : null}
        {query.error === "close" ? (
          <p className="form-error">No se ha podido cerrar la clase.</p>
        ) : null}
        {query.error === "correction" ? <p className="form-error">No se ha podido reabrir la clase para corregirla.</p> : null}
        {query.error === "correction-close" ? <p className="form-error">No se han podido guardar y cerrar todas las correcciones. La clase sigue en modo correccion.</p> : null}
        {query.error === "delegate" ? (
          <p className="form-error">No se ha podido generar el enlace de sustituto.</p>
        ) : null}

        {clase.closed && !isCorrectionMode ? (
          <section className="class-correction-entry">
            <div>
              <strong>¿Necesitas corregir esta clase?</strong>
              <span>Reabre el dia completo sin duplicar historiales ni contadores.</span>
            </div>
            <form action={reopenClassForCorrectionAction}>
              <input type="hidden" name="classId" value={clase.id} />
              <input type="hidden" name="legacyId" value={legacyId} />
              <button className="secondary-button button-reset" type="submit">
                <RefreshCcw aria-hidden="true" size={16} />
                Reabrir para corregir
              </button>
            </form>
          </section>
        ) : null}

        {isCorrectionMode ? (
          <section className="class-correction-panel" aria-label="Clase reabierta para correccion">
            <div className="class-correction-head">
              <div>
                <p className="eyebrow">Clase reabierta para correccion</p>
                <h2>¿Que quieres modificar?</h2>
                <p>Los datos anteriores se sustituyen al cerrar; no se suman una segunda vez.</p>
              </div>
              <form action={finishClassCorrectionAction}>
                <input type="hidden" name="classId" value={clase.id} />
                <input type="hidden" name="legacyId" value={legacyId} />
                <button className="primary-link button-reset" type="submit">
                  <Check aria-hidden="true" size={16} />
                  Guardar cambios y cerrar todo
                </button>
              </form>
            </div>
            <nav className="class-correction-options" aria-label="Opciones de correccion">
              {kidsCorrectionClass ? <a className={correctionSection === "kids-attendance" ? "selected" : ""} href={`/clases/${legacyId}?edit=kids-attendance#asistencia`}>Asistencia de ninos</a> : null}
              {adultCorrectionClass ? <a className={correctionSection === "adult-attendance" ? "selected" : ""} href={`/clases/${legacyId}?edit=adult-attendance#asistencia`}>Asistencia de adultos</a> : null}
              {kidsCorrectionClass ? <a className={correctionSection === "kids-technical" ? "selected" : ""} href={`/clases/${legacyId}?edit=kids-technical#tecnica-ninos`}>Parte tecnica de ninos</a> : null}
              {adultCorrectionClass ? <a className={correctionSection === "adult-technical" ? "selected" : ""} href={`/clases/${legacyId}?edit=adult-technical#plan-tecnico`}>Parte tecnica de adultos</a> : null}
            </nav>
          </section>
        ) : null}

        <section className="grid stats compact class-summary-strip" aria-label="Resumen">
          <article className="card"><h2>Fecha</h2><div className="metric small">{clase.class_date}</div></article>
          <article className="card"><h2>Tipo</h2><div className="metric small">{clase.class_type ?? "-"}</div></article>
          <article className="card"><h2>Estado</h2><div className="metric small">{isCorrectionMode ? "En correccion" : clase.status}</div></article>
          <article className="card"><h2>Asistentes</h2><div className="metric">{totalDayAttendance}</div></article>
        </section>

        <section className="delegate-visible-panel">
          <div className="delegate-visible-head">
            <div>
              <p className="eyebrow">Modo sustituto</p>
              <h2>Enviar link para cubrir la clase</h2>
              <p className="muted">
                Elige adulto, ninos o combinado. El sustituto entrara por pantallas: iniciar, tecnica si aplica y asistencia.
              </p>
            </div>
            {clase.class_group === "adults" && hasPlan ? (
              <a className="primary-link secondary-link" href={`/clases/${legacyId}/plan-pdf`} target="_blank" rel="noreferrer">
                <FileText aria-hidden="true" size={16} />
                PDF plan tecnico
              </a>
            ) : null}
          </div>
          {delegateUrl ? (
            <div className="copy-box delegate-copy-row">
              <div>
                <strong>Enlace activo {delegateMode === "combined" ? "combinado" : delegateMode === "kids" ? "ninos" : "adultos"}</strong>
                <a className="text-link" href={delegateUrl}>{delegateUrl}</a>
                <small className="muted">Caduca: {new Date(delegateLink?.expires_at ?? "").toLocaleString("es-ES")}</small>
              </div>
              <CopyLinkButton value={delegateUrl} />
            </div>
          ) : null}
          {!clase.closed ? (
            <div className="delegate-mode-grid">
              {(["adults", "kids", "combined"] as const).map((mode) => (
                <form action={createClassDelegateLinkAction} className="delegate-mode-card" key={mode}>
                  <input type="hidden" name="classId" value={clase.id} />
                  <input type="hidden" name="legacyId" value={legacyId} />
                  <input type="hidden" name="mode" value={mode} />
                  <input type="hidden" name="hours" value="48" />
                  <strong>{mode === "combined" ? "Combinado" : mode === "kids" ? "Ninos" : "Adultos"}</strong>
                  <span>
                    {mode === "combined"
                      ? "Tecnica adultos y asistencia adultos/ninos."
                      : mode === "kids"
                        ? "Solo asistencia infantil."
                        : "Plan tecnico y asistencia adultos."}
                  </span>
                  <button type="submit">Generar link</button>
                </form>
              ))}
            </div>
          ) : <p className="muted">La clase ya esta cerrada.</p>}
        </section>

        <details className="card maintenance-panel">
          <summary>Editar o eliminar clase</summary>
          <div className="split-section">
            <form action={updateClassAction} className="edit-form">
              <input type="hidden" name="classId" value={clase.id} />
              <input type="hidden" name="legacyId" value={legacyId} />
              <div className="form-grid">
                <label>Fecha<input name="classDate" type="date" defaultValue={clase.class_date} required /></label>
                <label>Nombre<input name="name" defaultValue={clase.name} required /></label>
                <label>
                  Tipo
                  <select name="classType" defaultValue={clase.class_type ?? "NORMAL"}>
                    <option value="NORMAL">Normal</option>
                    <option value="CONJUNTA">Conjunta</option>
                    <option value="REPASO">Repaso</option>
                    <option value="EXAMEN">Examen</option>
                  </select>
                </label>
                <label>Responsable<input name="responsible" defaultValue={clase.responsible ?? ""} /></label>
                <label>
                  Estado cierre
                  <select name="closed" defaultValue={clase.closed ? "true" : "false"}>
                    <option value="false">Abierta</option>
                    <option value="true">Cerrada</option>
                  </select>
                </label>
                <label className="wide">Notas<textarea name="notes" rows={3} defaultValue={clase.notes ?? ""} /></label>
              </div>
              <div className="form-actions">
                <button type="submit">Guardar cambios</button>
              </div>
            </form>
            <form action={deleteClassAction} className="edit-form danger-zone">
              <input type="hidden" name="classId" value={clase.id} />
              <input type="hidden" name="legacyId" value={legacyId} />
              <input type="hidden" name="deleteScope" value={isCombinedDay ? "combined-day" : "single"} />
              <h2>Eliminar clase</h2>
              <p className="muted">
                {isCombinedDay
                  ? "Elimina la clase combinada completa del sistema nuevo: ninos, adultos, asistencia, plan, grupos e historiales tecnicos asociados."
                  : "Elimina esta clase del sistema nuevo junto con asistencia, plan, grupos e historiales tecnicos asociados."}
              </p>
              <label>Confirmacion<input name="confirmText" placeholder="Escribe ELIMINAR" /></label>
              <div className="form-actions">
                <button type="submit">Eliminar clase</button>
              </div>
            </form>
          </div>
        </details>

        {!isCorrectionMode ? <ClassSectionNav links={classSectionLinks} current={currentClassSection} /> : null}

        <section className="card class-mission-card">
          <div>
            <p className="eyebrow">Siguiente accion</p>
            <h2>{classMission.title}</h2>
            <p className="muted">{classMission.description}</p>
          </div>
          <div className="class-mission-actions">
            {classMission.primaryHref ? <a className="primary-link" href={classMission.primaryHref}>{classMission.primaryLabel}</a> : null}
            {classMission.secondaryHref ? <a className="secondary-link" href={classMission.secondaryHref}>{classMission.secondaryLabel}</a> : null}
          </div>
          <div className="class-mission-checks" aria-label="Revision rapida">
            {isCombinedDay ? <StatusPill label="Ninos" value={`${kidsRegisteredCount}/${kidsDayMembers.length}`} done={kidsDayMembers.length > 0 && pendingKidsDayMembers.length === 0} /> : null}
            {clase.class_group === "adults" ? <StatusPill label="Tecnicas" value={`${completedPlan}/${(plan ?? []).length}`} done={hasPlan && completedPlan > 0} /> : null}
            <StatusPill label={clase.class_group === "kids" ? "Asistencia" : "Adultos"} value={clase.class_group === "kids" ? `${attendance?.length ?? 0}/${classMembers?.length ?? 0}` : `${adultRegisteredCount}/${adultDayMembers.length}`} done={clase.class_group === "kids" ? Boolean(attendance?.length) : adultRegisteredCount > 0} />
            <StatusPill label="Cierre" value={clase.closed ? "Cerrada" : "Abierta"} done={clase.closed} />
          </div>
        </section>

        {isCombinedDay ? (
          <section className="class-flow-guide" aria-label="Flujo recomendado de clase combinada">
            <FlowGuideItem
              number="1"
              title="Ninos"
              text="Pasa asistencia infantil nada mas terminar su clase."
              done={kidsRegisteredCount > 0 || Boolean(kidsDayClass?.closed)}
              active={combinedStep === "kids"}
            />
            <FlowGuideItem
              number="2"
              title="Tecnicas adultos"
              text="Marca el plan tecnico por grados y guarda una sola vez."
              done={completedPlan > 0}
              active={showAdultTechniques}
            />
            <FlowGuideItem
              number="3"
              title="Adultos"
              text="Marca asistencia, grupo entrenado y rol de cada adulto."
              done={adultRegisteredCount > 0}
              active={combinedStep === "adult-attendance"}
            />
            <FlowGuideItem
              number="4"
              title="Cerrar todo"
              text="Un unico cierre actualiza fichas, ranking e historial."
              done={clase.closed}
              active={combinedStep === "close"}
            />
          </section>
        ) : null}

        {showAdultTechniques ? <section className="split-section class-workbench">
          <article className="card">
            <h2>Grupos tecnicos</h2>
            <div className="chip-list">
              {(groups ?? []).length ? (groups ?? []).map((group) => (
                <span className="tag" key={group.id}>{group.grade}</span>
              )) : <span className="muted">Sin grupos todavia</span>}
            </div>
          </article>
          <article className="card">
            <h2>Orden de trabajo</h2>
            <p className="muted">
              Marca primero las tecnicas realizadas. Al final anade asistencia y cierra la clase para adjuntar el
              trabajo al grado entrenado de cada kenshi.
            </p>
          </article>
        </section> : clase.class_group === "kids" && (!isCorrectionMode || correctionSection === "kids-technical") ? (
          <>
            <section className="card">
              <h2>Clase infantil</h2>
              <p className="muted">Esta sesion no usa plan tecnico adulto. Registra asistencia y, si quieres, deja un plan infantil ligero como memoria del dia.</p>
            </section>
            <ChildLightPlanPanel
              classId={clase.id}
              legacyId={legacyId}
              returnTo={`/clases/${legacyId}?saved=kids-plan`}
              plan={childClassPlan}
              groupWork={childClassGroupWork ?? []}
              syllabusItems={childSyllabusItems ?? []}
              members={classMembers ?? []}
              open={requestedSection === "kids-technical"}
            />
          </>
        ) : null}

        {kidsEarlyAttendancePanel}
        {isCorrectionMode && correctionSection === "kids-technical" && kidsCorrectionClass && clase.class_group === "adults" ? (
          <section id="tecnica-ninos">
            <ChildLightPlanPanel
              classId={kidsCorrectionClass.id}
              legacyId={kidsCorrectionClass.legacy_id ?? legacyId}
              returnTo={`/clases/${legacyId}?edit=kids-technical&saved=kids-plan#tecnica-ninos`}
              plan={childClassPlan}
              groupWork={childClassGroupWork ?? []}
              syllabusItems={childSyllabusItems ?? []}
              members={kidsDayMembers}
            />
          </section>
        ) : null}
        {!isCorrectionMode || correctionSection === "kids-technical" ? childWorkReviewPanel : null}

        {showAdultTechniques ? (
          <>
            <div className="section-heading-row">
              <h2 className="section-title" id="plan-tecnico">Plan tecnico</h2>
              <span className="status" data-plan-total-count data-plan-total-label=" realizadas">{completedPlan}/{(plan ?? []).length} realizadas</span>
            </div>
            <PlanTechniqueForm action={updateClassPlanTechniquesAction}>
              <input type="hidden" name="classId" value={clase.id} />
              <input type="hidden" name="legacyId" value={legacyId} />
              <input type="hidden" name="nextStep" value="attendance" />
              <input type="hidden" name="returnTo" value={isCorrectionMode ? `/clases/${legacyId}?edit=adult-technical#plan-tecnico` : `/clases/${legacyId}?step=asistencia#asistencia`} />
              {canEditClosedClass && groupedPlan.length ? (
                <div className="plan-save-row">
                  <p className="muted">Marca todas las tecnicas realizadas y guarda una sola vez antes de pasar asistencia.</p>
                  <button type="submit">Guardar y pasar asistencia</button>
                </div>
              ) : null}
              <section className="plan-board mobile-plan-board">
              {groupedPlan.length ? groupedPlan.map(([grade, items], index) => {
                const groupCompleted = items.filter((item) => item.completed).length;
                const targetGrade = items[0]?.target_grade ?? null;
                return (
                  <details className="card plan-group" key={grade} data-plan-group>
                    <summary className="plan-group-head">
                      <div>
                        <div className="grade-route">
                          <span className={`grade-chip grade-${slugGrade(grade)}`}>{grade}</span>
                          <span className="route-arrow">para</span>
                          {targetGrade ? <span className={`grade-chip grade-${slugGrade(targetGrade)}`}>{targetGrade}</span> : <span className="grade-chip">Objetivo</span>}
                        </div>
                        <h2>{grade} para {targetGrade ?? "objetivo"}</h2>
                      </div>
                      <span className="plan-group-count" data-plan-group-count>{groupCompleted}/{items.length}</span>
                    </summary>
                    <div className="plan-card-list">
                      <div className="mobile-focus-head">
                        <div>
                          <small>Plan tecnico</small>
                          <strong>{grade} para {targetGrade ?? "objetivo"}</strong>
                        </div>
                        <button type="button" data-close-plan-focus aria-label="Cerrar grado">Cerrar</button>
                      </div>
                      {items.map((item) => (
                        <div className={item.completed ? "plan-card completed" : "plan-card"} key={item.id}>
                          <div>
                            <strong>{item.technique_name}</strong>
                            <span>{item.category ?? "-"} - {item.proposal_type ?? item.focus ?? "-"}</span>
                            <small className="plan-reason">
                              Rep: {item.techniques?.repetitions ?? 0} - Ultima: {item.techniques?.last_trained_on ?? "nunca"} - Score: {item.techniques?.score ?? item.score_at_that_moment ?? 0}
                            </small>
                            {effectivePlanSummary(item) ? <p className="technique-summary plan-technique-summary">{effectivePlanSummary(item)}</p> : null}
                          </div>
                          {!canEditClosedClass ? (
                            <span className={item.completed ? "mini-action selected" : "mini-action"}>
                              {item.completed ? "Si" : "No"}
                            </span>
                          ) : (
                            <label className="mini-action">
                              <input name="planIds" type="checkbox" value={item.id} defaultChecked={item.completed} />
                              <Check aria-hidden="true" size={15} />
                              Hecha
                            </label>
                          )}
                        </div>
                      ))}
                    </div>
                  </details>
                );
              }) : (
                <article className="card">
                  <h2>Sin plan tecnico</h2>
                  <p className="muted">Pulsa Preparar clase para crear grupos y plan tecnico adulto.</p>
                </article>
              )}
              </section>
              {canEditClosedClass && groupedPlan.length ? (
                <div className="plan-save-row bottom">
                  <button type="submit">Guardar y pasar asistencia</button>
                </div>
              ) : null}
              </PlanTechniqueForm>
              {canEditClosedClass ? (
                <section className="card manual-technique-panel">
                  <details>
                    <summary>
                      <strong>Tecnica comun fuera del plan</strong>
                      <span>{manualCommonSummary.length ? `${manualCommonSummary.length} anadidas` : "Opcional"}</span>
                    </summary>
                    {manualCommonSummary.length ? (
                      <div className="manual-technique-added-list">
                        <strong>Extras manuales de esta clase</strong>
                        {manualCommonSummary.map((item) => (
                          <div className="manual-technique-added-row" key={item.key}>
                            <span>
                              {item.name}
                              <small>{item.scope} - {item.category ?? "tecnica"}</small>
                            </span>
                            <form action={removeManualClassTechniqueAction}>
                              <input type="hidden" name="classId" value={clase.id} />
                              <input type="hidden" name="legacyId" value={legacyId} />
                              <input type="hidden" name="planIds" value={item.ids.join(",")} />
                              <input type="hidden" name="returnTo" value={`/clases/${legacyId}#plan-tecnico`} />
                              <button type="submit">Quitar</button>
                            </form>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    <ManualTechniqueForm
                      action={addManualClassTechniqueAction}
                      classId={clase.id}
                      legacyId={legacyId}
                      returnTo={`/clases/${legacyId}#plan-tecnico`}
                      techniques={techniqueOptions ?? []}
                      groups={groups ?? []}
                    />
                  </details>
                </section>
              ) : null}
          </>
        ) : null}

        {(showAdultAttendancePanel || showCombinedCloseStep || (showAttendanceStep && !isCombinedDay)) ? <>
        <div className="section-heading-row">
          <h2 className="section-title">
            {showCombinedCloseStep ? "Cerrar clase combinada" : clase.class_group === "kids" ? "Asistencia infantil" : "Asistencia adultos"}
          </h2>
          {clase.class_group === "adults" ? <a className="secondary-link" href={techniqueStepHref}>Volver a tecnicas</a> : null}
        </div>
        {clase.class_group === "adults" ? (
          <section className="card class-final-review" id="revision-final">
            <div>
              <p className="eyebrow">Revision antes de cerrar</p>
              <h2>Comprueba y cierra todo junto</h2>
              <p className="muted">Esta es la ultima mirada antes de actualizar fichas, ranking, historiales y progreso tecnico.</p>
            </div>
            <div className="class-final-grid">
              {isCombinedDay ? <StatusPill label="Ninos" value={`${kidsRegisteredCount}/${kidsDayMembers.length}`} done={kidsDayMembers.length > 0 && pendingKidsDayMembers.length === 0} /> : null}
              <StatusPill label="Adultos" value={`${adultRegisteredCount}/${adultDayMembers.length}`} done={adultRegisteredCount > 0} />
              <StatusPill label="Tecnicas hechas" value={`${completedPlan}/${(plan ?? []).length}`} done={completedPlan > 0} />
              <StatusPill label="Estado" value={clase.closed ? "Cerrada" : "Lista para cerrar"} done={clase.closed} />
            </div>
          </section>
        ) : null}
        {!showCombinedCloseStep ? <section className="card mobile-attendance-note">
          {clase.class_group === "adults" ? (
            <>
              <h2>Como se adjuntan las tecnicas</h2>
              <p className="muted">
                Puedes marcar primero todas las tecnicas realizadas. Al cerrar la clase, el sistema cruza esas tecnicas con
                la asistencia final y las adjunta al grado entrenado de cada asistente.
              </p>
            </>
          ) : (
            <>
              <h2>Registro infantil</h2>
              <p className="muted">La asistencia infantil actualiza la actividad del alumno y sirve para ranking, constancia y revision de fichas.</p>
            </>
          )}
        </section> : null}

        {!showCombinedCloseStep ? <section className="mobile-work-anchor" id="asistencia">
          {attendanceClasses.length > 1 ? attendancePanel : attendanceQuickPanel}
        </section> : null}
        {showCombinedCloseStep ? (
          <section className="card mobile-attendance-note">
            <h2>Ajustes antes de cerrar</h2>
            <p className="muted">Si alguien salio antes, observo, enseno o entreno con otro grupo, abre el panel de ajustes y deja marcadas solo las tecnicas que realmente hizo.</p>
          </section>
        ) : null}
        {technicalReviewPanel}
        </> : null}

        {readyToClose && (activeStep === "attendance" || showCombinedCloseStep) && (attendance ?? []).length ? (
          <section className="mobile-close-bar" aria-label="Cerrar clase">
            <div>
                <strong data-plan-total-count>{completedPlan}/{(plan ?? []).length}</strong>
              <span>{isCombinedDay ? "Revisa y cierra ninos + adultos juntos." : "tecnicas realizadas. Usa solo si la asistencia ya esta guardada."}</span>
            </div>
            {isCombinedDay ? (
              <form action={addBulkAttendanceAction}>
                <input type="hidden" name="classId" value={clase.id} />
                <input type="hidden" name="legacyId" value={legacyId} />
                <input type="hidden" name="returnLegacyId" value={legacyId} />
                <input type="hidden" name="returnStep" value="cierre" />
                <input type="hidden" name="closeAfter" value="true" />
                {attendanceClasses.map((dayClass) => (
                  <input key={dayClass.id} type="hidden" name="groupClassIds" value={dayClass.id} />
                ))}
                <button className="primary-link button-reset" type="submit">
                  <Check aria-hidden="true" size={16} />
                  Cerrar todo
                </button>
              </form>
            ) : (
              <form action={closeAdultClassAction}>
                <input type="hidden" name="classId" value={clase.id} />
                <input type="hidden" name="legacyId" value={legacyId} />
                <button className="primary-link button-reset" type="submit">
                  <Check aria-hidden="true" size={16} />
                  Cerrar clase ya guardada
                </button>
              </form>
            )}
          </section>
        ) : null}

        {readyToCloseKids ? (
          <section className="mobile-close-bar" id="cierre-clase" aria-label="Cerrar clase infantil">
            <div>
              <strong>{attendance?.length ?? 0}</strong>
              <span>asistentes</span>
            </div>
            <form action={closeKidsClassAction}>
              <input type="hidden" name="classId" value={clase.id} />
              <input type="hidden" name="legacyId" value={legacyId} />
              <button className="primary-link button-reset" type="submit">
                <Check aria-hidden="true" size={16} />
                Cerrar clase
              </button>
            </form>
          </section>
        ) : null}

        {clase.class_group !== "adults" || activeStep === "attendance" ? <>
        <h2 className="section-title">Asistencia registrada</h2>
        {registeredAttendanceGroups.length ? registeredAttendanceGroups.map((group) => (
          <section className="table-wrap attendance-registered-table" key={group.title}>
            <h3>{group.title}</h3>
            <table>
              <thead>
                <tr><th>Kenshi</th><th>Grado oficial</th><th>Grado entrenado</th><th>Ficha</th><th>Accion</th></tr>
              </thead>
              <tbody>
                {group.rows.map((item) => (
                  <tr key={`${item.class_id ?? clase.id}-${item.member_id}`}>
                    <td data-label="Kenshi"><strong>{item.members?.first_name} {item.members?.last_name}</strong></td>
                    <td data-label="Grado oficial">{item.official_grade ?? "-"}</td>
                    <td data-label="Grado entrenado">{item.trained_grade ?? "-"}</td>
                    <td data-label="Ficha">{item.members?.legacy_id ? <a className="text-link" href={`/kenshis/${item.members.legacy_id}`}>Abrir ficha</a> : "-"}</td>
                    <td data-label="Accion">
                      <form action={removeAttendanceAction}>
                        <input type="hidden" name="attendanceId" value={item.id} />
                        <input type="hidden" name="legacyId" value={legacyId} />
                        <input type="hidden" name="returnLegacyId" value={legacyId} />
                        <button className="danger-link button-reset" type="submit">Quitar</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )) : <p className="muted">Aun no hay asistencia registrada.</p>}
        </> : null}
      </main>
    </div>
  );
}

function ChildLightPlanPanel({
  classId,
  legacyId,
  returnTo,
  plan,
  groupWork,
  syllabusItems,
  members,
  compact = false,
  open = false
}: {
  classId: string;
  legacyId: string;
  returnTo: string;
  plan: ChildClassPlanRow | null;
  groupWork: ChildClassGroupWorkRow[];
  syllabusItems: ChildSyllabusItemRow[];
  members: MemberOption[];
  compact?: boolean;
  open?: boolean;
}) {
  const activities = new Set(plan?.activities ?? []);
  const selectedSyllabusItems = new Set(plan?.syllabus_item_ids ?? []);
  const memberNames = new Map(members.map((member) => [member.id, member.display_name]));
  const syllabusByGrade = groupChildSyllabusByGrade(syllabusItems);
  const selectedSyllabusCount = syllabusItems.filter((item) => selectedSyllabusItems.has(item.id)).length;

  return (
    <details className={compact ? "child-light-plan-panel compact" : "card child-light-plan-panel"} id="tecnica-ninos" open={open || undefined}>
      <summary>
        <strong>Plan infantil opcional</strong>
        <span>{plan?.objective || groupWork.length || selectedSyllabusCount ? "Guardado" : "Ligero"}</span>
      </summary>
      <p className="muted">Solo sirve como memoria interna del dia. No bloquea asistencia ni cambia el progreso tecnico como en adultos.</p>
      {plan?.objective || activities.size || selectedSyllabusCount || plan?.notes ? (
        <div className="child-plan-summary">
          {plan?.objective ? <span className="tag">Objetivo: {plan.objective}</span> : null}
          {[...activities].map((activity) => <span className="tag" key={activity}>{childActivityLabel(activity)}</span>)}
          {selectedSyllabusCount ? <span className="tag">Temario examen: {selectedSyllabusCount} puntos</span> : null}
          {plan?.notes ? <p>{plan.notes}</p> : null}
        </div>
      ) : null}
      {groupWork.length ? (
        <div className="child-group-work-list">
          <strong>Trabajo por grupo</strong>
          {groupWork.map((item) => {
            const names = (item.member_ids ?? []).map((id) => memberNames.get(id)).filter(Boolean);
            return (
              <div className="child-group-work-row" key={item.id}>
                <span>
                  <strong>{item.group_label}</strong>
                  <small>{item.content}</small>
                  <small>{names.length ? names.join(", ") : "Grupo general / segun criterio del sensei"}</small>
                </span>
                <form action={deleteChildClassGroupWorkAction}>
                  <input type="hidden" name="id" value={item.id} />
                  <input type="hidden" name="legacyId" value={legacyId} />
                  <input type="hidden" name="returnTo" value={returnTo} />
                  <button className="danger-link button-reset" type="submit">Quitar</button>
                </form>
              </div>
            );
          })}
        </div>
      ) : null}
      <form action={saveChildClassPlanAction} className="child-light-plan-form">
        <input type="hidden" name="classId" value={classId} />
        <input type="hidden" name="legacyId" value={legacyId} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <label>
          Objetivo del dia
          <select name="objective" defaultValue={plan?.objective ?? ""}>
            <option value="">Sin objetivo concreto</option>
            {childObjectives.map((objective) => <option key={objective} value={objective}>{objective}</option>)}
          </select>
        </label>
        <fieldset>
          <legend>Actividades generales</legend>
          <div className="child-activity-grid">
            {childActivities.map((activity) => (
              <label key={activity.value}>
                <input name="activities" type="checkbox" value={activity.value} defaultChecked={activities.has(activity.value)} />
                <span>{activity.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="child-syllabus-plan-fieldset">
          <legend>Temario de examen sugerido</legend>
          <p className="muted">Puntos reales del programa infantil para los grados objetivo presentes en la clase. Marca solo lo trabajado hoy.</p>
          {syllabusByGrade.length ? (
            <div className="child-syllabus-plan-list">
              {syllabusByGrade.map(([grade, items], index) => (
                <details key={grade} className="child-syllabus-plan-grade" open={index === 0 || items.some((item) => selectedSyllabusItems.has(item.id))}>
                  <summary>
                    <span className={gradeChipClass(grade)}>{grade}</span>
                    <strong>{items.length} puntos</strong>
                  </summary>
                  <div className="child-syllabus-plan-items">
                    {items.map((item) => (
                      <label key={item.id}>
                        <input name="syllabusItemIds" type="checkbox" value={item.id} defaultChecked={selectedSyllabusItems.has(item.id)} />
                        <span>
                          <strong>{item.title}</strong>
                          <small>{childSyllabusCategoryLabel(item.category)}</small>
                          {item.description ? <small>{item.description}</small> : null}
                        </span>
                      </label>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          ) : (
            <p className="muted">No hay temario infantil activo para los grados objetivo de esta clase.</p>
          )}
        </fieldset>
        <label>
          Nota rapida
          <textarea name="notes" rows={compact ? 2 : 3} defaultValue={plan?.notes ?? ""} placeholder="Ej.: buen trabajo de ukemi, grupo muy atento, preparar examen..." />
        </label>
        <details className="child-group-work-editor">
          <summary>Anadir trabajo por grupo solo si hace falta</summary>
          <div className="form-grid">
            <label>Grupo<input name="groupLabel" placeholder="Altos, blancos, 5 KYU..." /></label>
            <label>Contenido<input name="groupContent" placeholder="Ukemi, kote nuki, repaso examen..." /></label>
            <label className="wide">Nota grupo<textarea name="groupNotes" rows={2} placeholder="Opcional" /></label>
          </div>
          <div className="child-member-mini-list">
            {members.map((member) => (
              <label key={member.id}>
                <input type="checkbox" name="groupMemberIds" value={member.id} />
                <span>{member.display_name}</span>
              </label>
            ))}
          </div>
        </details>
        <div className="form-actions">
          <button type="submit">Guardar plan infantil</button>
        </div>
      </form>
    </details>
  );
}

function StatusPill({ label, value, done }: { label: string; value: string; done: boolean }) {
  return (
    <span className={done ? "class-status-pill done" : "class-status-pill"}>
      <small>{label}</small>
      <strong>{value}</strong>
    </span>
  );
}

const childObjectives = [
  "Atencion y disciplina",
  "Coordinacion",
  "Ukemi / caidas",
  "Kihon",
  "Goho basico",
  "Juho basico",
  "Trabajo en pareja",
  "Juego tecnico",
  "Preparacion examen",
  "Trabajo por grados",
  "Howa / valores"
];

const childActivities = [
  { value: "calentamiento", label: "Calentamiento" },
  { value: "coordinacion", label: "Coordinacion" },
  { value: "caidas", label: "Caidas" },
  { value: "kihon", label: "Kihon" },
  { value: "goho", label: "Goho" },
  { value: "juho", label: "Juho" },
  { value: "pareja", label: "Pareja" },
  { value: "juego-tecnico", label: "Juego tecnico" },
  { value: "howa", label: "Howa" },
  { value: "examen", label: "Preparacion grado" }
];

function groupChildSyllabusByGrade(items: ChildSyllabusItemRow[]) {
  const byGrade = new Map<string, ChildSyllabusItemRow[]>();
  items
    .slice()
    .sort((a, b) => kidGradeSortValue(a.grade) - kidGradeSortValue(b.grade) || a.sort_order - b.sort_order || a.title.localeCompare(b.title))
    .forEach((item) => {
      const grade = normalizeKidGrade(item.grade) ?? item.grade;
      const rows = byGrade.get(grade) ?? [];
      rows.push(item);
      byGrade.set(grade, rows);
    });
  return [...byGrade.entries()];
}

function childSyllabusCategoryLabel(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toLowerCase();
  const labels: Record<string, string> = {
    kihon: "Kihon",
    goho: "Goho",
    juho: "Juho",
    gakka: "Gakka",
    howa: "Howa",
    taiso: "Taiso",
    ukemi: "Ukemi",
    tai_gamae: "Tai gamae",
    tai_sabaki: "Tai sabaki",
    embu: "Embu",
    otro: "Otro"
  };
  return labels[normalized] ?? (value || "Otro");
}

function normalizeKidGrade(grade: string | null | undefined) {
  const normalized = normalizeGradeLabel(grade);
  const aliases: Record<string, string> = {
    MINARAI: "BLANCO",
    "BLANCO Y AMARILLO": "BLANCO-AMARILLO",
    "AMARILLO Y NARANJA": "AMARILLO-NARANJA",
    "NARANJA Y VERDE": "NARANJA-VERDE",
    "VERDE Y AZUL": "VERDE-AZUL",
    "AZUL Y MARRON": "AZUL-MARRON",
    "AZUL Y MARRÓN": "AZUL-MARRON"
  };
  const canonical = aliases[normalized] ?? normalized;
  return kidsGrades.find((item) => normalizeGradeLabel(item) === canonical) ?? null;
}

function nextKidGrade(grade: string | null | undefined) {
  const current = normalizeKidGrade(grade);
  if (!current) return null;
  const index = kidsGrades.indexOf(current);
  return kidsGrades[Math.min(index + 1, kidsGrades.length - 1)] ?? current;
}

function childSyllabusGradeCandidates(...grades: Array<string | null | undefined>) {
  const labels = new Set<string>();
  for (const grade of grades) {
    const current = normalizeKidGrade(grade);
    const target = nextKidGrade(grade) ?? current;
    for (const label of [target, current, normalizeGradeLabel(grade)].filter(Boolean)) {
      labels.add(label as string);
    }
  }
  return [...labels];
}

function normalizeChildGradeKey(grade: string | null | undefined) {
  return normalizeGradeLabel(grade)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+Y\s+/g, "-")
    .replace(/\s*-\s*/g, "-")
    .replace(/\s+/g, "-");
}

function filterChildSyllabusItemsByGrade(items: ChildSyllabusItemRow[], gradeKeys: Set<string>) {
  if (!gradeKeys.size) return items;
  return items.filter((item) => gradeKeys.has(normalizeChildGradeKey(item.grade)));
}

function kidGradeSortValue(grade: string | null | undefined) {
  const normalized = normalizeKidGrade(grade);
  const index = normalized ? kidsGrades.indexOf(normalized) : -1;
  return index === -1 ? 999 : index;
}

function gradeChipClass(grade: string | null | undefined) {
  return `grade-chip grade-${slugGrade(grade)}`;
}

function childActivityLabel(value: string) {
  return childActivities.find((activity) => activity.value === value)?.label ?? value;
}

function FlowGuideItem({
  number,
  title,
  text,
  done,
  active
}: {
  number: string;
  title: string;
  text: string;
  done: boolean;
  active: boolean;
}) {
  const className = done ? "class-flow-guide-item done" : active ? "class-flow-guide-item active" : "class-flow-guide-item";
  return (
    <article className={className}>
      <span>{done ? <Check aria-hidden="true" size={16} /> : number}</span>
      <div>
        <strong>{title}</strong>
        <p>{text}</p>
      </div>
    </article>
  );
}

function buildClassMission({
  classGroup,
  activeStep,
  combinedStep,
  closed,
  isCombinedDay,
  kidsRegistered,
  kidsTotal,
  adultRegistered,
  adultTotal,
  completedPlan,
  totalPlan,
  mustRegisterKidsFirst
}: {
  classGroup: "kids" | "adults";
  activeStep: "techniques" | "attendance";
  combinedStep: "kids" | "techniques" | "adult-attendance" | "close" | null;
  closed: boolean;
  isCombinedDay: boolean;
  kidsRegistered: number;
  kidsTotal: number;
  adultRegistered: number;
  adultTotal: number;
  completedPlan: number;
  totalPlan: number;
  mustRegisterKidsFirst: boolean;
}) {
  if (closed) {
    return {
      title: "Clase cerrada",
      description: "La clase ya esta guardada. Puedes revisar asistencia, fichas y datos generados.",
      primaryHref: "",
      primaryLabel: "",
      secondaryHref: "/clases",
      secondaryLabel: "Volver al calendario"
    };
  }

  if (classGroup === "kids") {
    return {
      title: "Pasa asistencia infantil",
      description: "Marca los ninos que han venido y cierra la clase infantil para actualizar sus fichas.",
      primaryHref: "#asistencia",
      primaryLabel: "Ir a asistencia",
      secondaryHref: "",
      secondaryLabel: ""
    };
  }

  if (combinedStep === "close") {
    return {
      title: "4. Cierra toda la clase",
      description: "Ultima revision: ninos, adultos y tecnicas quedan listos. Pulsa Cerrar todo para actualizar fichas, ranking e historiales.",
      primaryHref: "#revision-final",
      primaryLabel: "Ver cierre",
      secondaryHref: "/clases",
      secondaryLabel: "Calendario"
    };
  }

  if (activeStep === "techniques") {
    if (mustRegisterKidsFirst) {
      return {
        title: "1. Marca asistencia de ninos",
        description: "Primero guarda los ninos que han venido. Despues apareceran las tecnicas adultas en esta misma clase.",
        primaryHref: "#asistencia-ninos-rapida",
        primaryLabel: "Marcar ninos",
        secondaryHref: "",
        secondaryLabel: ""
      };
    }

    return {
      title: isCombinedDay ? "2. Marca tecnicas adultas" : "Marca tecnicas adultas",
      description: "Despliega cada grado, marca todo lo realizado y pulsa Guardar y pasar asistencia.",
      primaryHref: "#plan-tecnico",
      primaryLabel: "Ir al plan",
      secondaryHref: "/clases",
      secondaryLabel: "Calendario"
    };
  }

  return {
    title: isCombinedDay ? "3. Asistencia adultos y cierre" : "Asistencia y cierre",
    description: "Marca adultos, elige si entrenan en su grupo u otro, si ensenan u observan, y pulsa Guardar todo y cerrar clase.",
    primaryHref: "#asistencia",
    primaryLabel: "Ir a asistencia",
    secondaryHref: totalPlan > 0 && completedPlan === 0 ? "" : "#revision-final",
    secondaryLabel: totalPlan > 0 && completedPlan === 0 ? "" : "Ver revision"
  };
}

function groupPlanByGrade(plan: PlanRow[]) {
  const groups = new Map<string, PlanRow[]>();
  plan.forEach((item) => {
    const key = item.group_grade ?? "Sin grupo";
    const current = groups.get(key) ?? [];
    current.push(item);
    groups.set(key, current);
  });
  return [...groups.entries()].sort(([gradeA], [gradeB]) => gradeSortValue(gradeA) - gradeSortValue(gradeB));
}

function summarizeManualCommonPlan(plan: PlanRow[]) {
  const grouped = new Map<string, { key: string; ids: string[]; name: string; category: string | null; grades: string[] }>();
  plan.forEach((item) => {
    const key = `${normalizeGradeLabel(item.technique_name)}::${normalizeGradeLabel(item.category)}`;
    const current = grouped.get(key) ?? {
      key,
      ids: [],
      name: item.technique_name,
      category: item.category,
      grades: []
    };
    current.ids.push(item.id);
    if (item.group_grade && !current.grades.includes(item.group_grade)) current.grades.push(item.group_grade);
    grouped.set(key, current);
  });

  return [...grouped.values()].map((item) => {
    const sortedGrades = item.grades.sort((a, b) => gradeSortValue(a) - gradeSortValue(b));
    return {
      ...item,
      scope: sortedGrades.length ? sortedGrades.join(", ") : "todos"
    };
  });
}

function effectivePlanSummary(item: PlanRow) {
  if (item.summary_es !== null) return item.summary_es.trim();
  if (item.techniques?.summary_es !== null && item.techniques?.summary_es !== undefined) {
    return item.techniques.summary_es.trim();
  }
  return adaptTechniqueSummary(getKamokuSummaryFallback(item.technique_name), item);
}

function gradeSortValue(grade: string) {
  const normalized = String(grade ?? "").trim().toUpperCase();
  const order = ["MINARAI", "5 KYU", "4 KYU", "3 KYU", "2 KYU", "1 KYU", "1 DAN", "2 DAN", "3 DAN", "4 DAN", "5 DAN", "6 DAN", "7 DAN", "8 DAN", "9 DAN"];
  const index = order.indexOf(normalized);
  return index === -1 ? 999 : index;
}

function buildAdultTrainingGradeOptions(groups: GroupRow[]) {
  const classGrades = new Set(groups.map((group) => normalizeGradeLabel(group.grade)).filter(Boolean));
  const technicalProgramGrades = adultGrades.filter((grade) => gradeSortValue(grade) <= gradeSortValue("5 DAN"));
  const ordered = technicalProgramGrades.filter((grade) => classGrades.size === 0 || classGrades.has(grade) || gradeSortValue(grade) <= gradeSortValue("5 DAN"));
  const extras = [...classGrades]
    .filter((grade) => !ordered.includes(grade))
    .sort((a, b) => gradeSortValue(a) - gradeSortValue(b));
  return [...ordered, ...extras];
}

function normalizeGradeLabel(grade: string | null | undefined) {
  return String(grade ?? "").trim().toUpperCase().replace(/\s+/g, " ");
}

function groupOverridesByAttendance(rows: TechnicalOverrideRow[]) {
  const map = new Map<string, Set<string>>();
  rows.forEach((row) => {
    const planIds = map.get(row.attendance_id) ?? new Set<string>();
    planIds.add(row.plan_id);
    map.set(row.attendance_id, planIds);
  });
  return map;
}

function childWorkModeLabel(mode: string | null | undefined) {
  switch (mode) {
    case "own":
      return "Su grado";
    case "other_grade":
      return "Otro grado";
    case "observer":
      return "Observa";
    case "common":
    default:
      return "Comun";
  }
}

function delegateModeFromCreatedBy(value: string | null | undefined) {
  const [, mode] = String(value ?? "").split(":");
  const normalized = String(mode ?? "").toLowerCase();
  if (["kids", "ninos", "niños"].includes(normalized)) return "kids";
  if (["combined", "combinado"].includes(normalized)) return "combined";
  if (["adults", "adultos"].includes(normalized)) return "adults";
  return null;
}

function slugGrade(grade: string | null | undefined) {
  return String(grade ?? "grado").trim().toLowerCase().replace(/\s+/g, "-");
}
