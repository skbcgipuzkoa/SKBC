import "server-only";

import {
  normalizeChildGrade,
  orderChildExamAssignments,
  type ChildProgramAssignment,
  type ChildProgramContent,
  type ChildProgramContentUsage
} from "./child-program";
import { createAdminClient } from "./supabase/admin";

type AssignmentRow = {
  id: string;
  content_id: string;
  grade: string;
  title: string;
  category: string;
  description: string | null;
  active: boolean;
  exam_relevant: boolean;
  sort_order: number;
};

type ContentRow = {
  id: string;
  title: string;
  category: string;
  description: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  child_syllabus_items: AssignmentRow[] | null;
};

export type ChildProgramAssignmentInput = {
  grade: string;
  active: boolean;
  examRelevant: boolean;
  sortOrder: number;
};

export type SaveChildProgramContentInput = {
  contentId?: string;
  title: string;
  category: string;
  description: string | null;
  assignments: ChildProgramAssignmentInput[];
  actor: string;
};

export async function getChildProgramCatalog(): Promise<ChildProgramContent[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("child_syllabus_contents")
    .select("id,title,category,description,archived_at,created_at,updated_at,child_syllabus_items(id,content_id,grade,title,category,description,active,exam_relevant,sort_order)")
    .order("title", { ascending: true })
    .order("id", { ascending: true })
    .returns<ContentRow[]>();

  if (error) throw error;
  return (data ?? []).map((content) => ({
    id: content.id,
    title: content.title,
    category: content.category,
    description: content.description,
    archivedAt: content.archived_at,
    createdAt: content.created_at,
    updatedAt: content.updated_at,
    assignments: orderChildExamAssignments((content.child_syllabus_items ?? []).map(mapAssignment))
  }));
}

export async function getChildProgramAssignment(assignmentId: string): Promise<ChildProgramAssignment | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("child_syllabus_items")
    .select("id,content_id,grade,title,category,description,active,exam_relevant,sort_order")
    .eq("id", assignmentId)
    .maybeSingle<AssignmentRow>();

  if (error) throw error;
  return data ? mapAssignment(data) : null;
}

export async function childProgramContentUsage(contentId: string): Promise<ChildProgramContentUsage> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .rpc("child_syllabus_content_usage", { p_content_id: contentId })
    .single<{
      assignment_count: number | string;
      history_count: number | string;
      class_plan_count: number | string;
      exam_event_count: number | string;
    }>();

  if (error) throw error;
  return {
    assignmentCount: Number(data.assignment_count),
    historyCount: Number(data.history_count),
    classPlanCount: Number(data.class_plan_count),
    examEventCount: Number(data.exam_event_count)
  };
}

export async function saveChildProgramContent(input: SaveChildProgramContentInput): Promise<string> {
  const supabase = createAdminClient();
  const now = new Date().toISOString();
  let contentId = input.contentId;
  let createdContent = false;

  if (!contentId) {
    const { data, error } = await supabase
      .from("child_syllabus_contents")
      .insert({
        title: input.title,
        category: input.category,
        description: input.description,
        created_by: input.actor,
        updated_by: input.actor
      })
      .select("id")
      .single<{ id: string }>();
    if (error || !data) throw error ?? new Error("child-program-content-create-failed");
    contentId = data.id;
    createdContent = true;
  }

  const { data: existingData, error: existingError } = await supabase
    .from("child_syllabus_items")
    .select("id,content_id,grade,title,category,description,active,exam_relevant,sort_order,created_by,updated_by,created_at,updated_at")
    .eq("content_id", contentId);
  if (existingError) {
    if (createdContent) await supabase.from("child_syllabus_contents").delete().eq("id", contentId);
    throw existingError;
  }

  const existing = (existingData ?? []) as Array<AssignmentRow & Record<string, unknown>>;
  const existingByGrade = new Map(existing.map((row) => [normalizeChildGrade(row.grade), row]));
  const requestedGrades = new Set(input.assignments.map((assignment) => assignment.grade));
  const insertedIds: string[] = [];

  try {
    for (const assignment of input.assignments) {
      const retained = existingByGrade.get(assignment.grade);
      const values = {
        content_id: contentId,
        grade: assignment.grade,
        active: assignment.active,
        exam_relevant: assignment.examRelevant,
        sort_order: assignment.sortOrder,
        updated_by: input.actor,
        updated_at: now
      };
      if (retained) {
        const { error } = await supabase.from("child_syllabus_items").update(values).eq("id", retained.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("child_syllabus_items")
          .insert({ ...values, title: input.title, category: input.category, description: input.description, created_by: input.actor })
          .select("id")
          .single<{ id: string }>();
        if (error || !data) throw error ?? new Error("child-program-assignment-create-failed");
        insertedIds.push(data.id);
      }
    }

    for (const omitted of existing.filter((row) => !requestedGrades.has(normalizeChildGrade(row.grade)))) {
      const usage = await childProgramAssignmentUsage(omitted.id);
      if (usage.historyCount + usage.classPlanCount + usage.examEventCount > 0) {
        const { error } = await supabase
          .from("child_syllabus_items")
          .update({ active: false, updated_by: input.actor, updated_at: now })
          .eq("id", omitted.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("child_syllabus_items").delete().eq("id", omitted.id);
        if (error) throw error;
      }
    }

    const { error: contentError } = await supabase
      .from("child_syllabus_contents")
      .update({ title: input.title, category: input.category, description: input.description, updated_by: input.actor, updated_at: now })
      .eq("id", contentId);
    if (contentError) throw contentError;
    return contentId;
  } catch (error) {
    if (insertedIds.length) await supabase.from("child_syllabus_items").delete().in("id", insertedIds);
    if (createdContent) {
      await supabase.from("child_syllabus_contents").delete().eq("id", contentId);
    } else if (existing.length) {
      await supabase.from("child_syllabus_items").upsert(existing, { onConflict: "id" });
    }
    throw error;
  }
}

export async function moveChildProgramAssignment(assignmentId: string, direction: "up" | "down", actor: string) {
  const supabase = createAdminClient();
  const current = await getChildProgramAssignment(assignmentId);
  if (!current) throw new Error("child-program-assignment-not-found");

  const { data, error } = await supabase
    .from("child_syllabus_items")
    .select("id,content_id,grade,title,category,description,active,exam_relevant,sort_order")
    .order("sort_order", { ascending: true })
    .order("title", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw error;

  const ordered = (data ?? []).filter((row) => normalizeChildGrade(row.grade) === current.grade) as AssignmentRow[];
  const currentIndex = ordered.findIndex((row) => row.id === assignmentId);
  const target = ordered[currentIndex + (direction === "up" ? -1 : 1)];
  if (currentIndex < 0 || !target) return;

  const now = new Date().toISOString();
  [ordered[currentIndex], ordered[currentIndex + (direction === "up" ? -1 : 1)]] = [target, ordered[currentIndex]];
  const reordered = ordered.map((row, index) => ({
    ...row,
    sort_order: (index + 1) * 10,
    updated_by: actor,
    updated_at: now
  }));
  // One multi-row statement keeps a grade contiguous even when legacy rows share an order value.
  const { error: reorderError } = await supabase.from("child_syllabus_items").upsert(reordered, { onConflict: "id" });
  if (reorderError) throw reorderError;
}

export async function setChildProgramContentArchived(contentId: string, archived: boolean, actor: string) {
  const supabase = createAdminClient();
  const now = new Date().toISOString();
  const { error: contentError } = await supabase
    .from("child_syllabus_contents")
    .update({ archived_at: archived ? now : null, updated_by: actor, updated_at: now })
    .eq("id", contentId);
  if (contentError) throw contentError;
  if (!archived) return;

  const { error: assignmentError } = await supabase
    .from("child_syllabus_items")
    .update({ active: false, updated_by: actor, updated_at: now })
    .eq("content_id", contentId);
  if (assignmentError) {
    await supabase.from("child_syllabus_contents").update({ archived_at: null, updated_by: actor, updated_at: now }).eq("id", contentId);
    throw assignmentError;
  }
}

export async function deleteUnusedChildProgramContent(contentId: string) {
  const supabase = createAdminClient();
  const { data: assignments, error: readError } = await supabase.from("child_syllabus_items").select("*").eq("content_id", contentId);
  if (readError) throw readError;
  const { error: assignmentsError } = await supabase.from("child_syllabus_items").delete().eq("content_id", contentId);
  if (assignmentsError) throw assignmentsError;
  const { error: contentError } = await supabase.from("child_syllabus_contents").delete().eq("id", contentId);
  if (contentError) {
    if (assignments?.length) await supabase.from("child_syllabus_items").upsert(assignments, { onConflict: "id" });
    throw contentError;
  }
}

async function childProgramAssignmentUsage(assignmentId: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .rpc("child_syllabus_item_usage", { p_syllabus_item_id: assignmentId })
    .single<{ history_count: number | string; class_plan_count: number | string; exam_event_count: number | string }>();
  if (error) throw error;
  return {
    historyCount: Number(data.history_count),
    classPlanCount: Number(data.class_plan_count),
    examEventCount: Number(data.exam_event_count)
  };
}

function mapAssignment(row: AssignmentRow): ChildProgramAssignment {
  return {
    id: row.id,
    contentId: row.content_id,
    grade: normalizeChildGrade(row.grade),
    title: row.title,
    category: row.category,
    description: row.description,
    active: row.active,
    examRelevant: row.exam_relevant,
    sortOrder: row.sort_order
  };
}
