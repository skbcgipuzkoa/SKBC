export function copyExamSnapshotItems<T extends object>(items: readonly T[], eventId: string): Array<T & { exam_event_id: string }> {
  return items.map((item) => ({ ...item, exam_event_id: eventId }));
}
