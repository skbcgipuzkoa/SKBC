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
