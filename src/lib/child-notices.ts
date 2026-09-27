export type ChildRankingForNotices = {
  attendance_30d: number | null;
  days_without_attendance: number | null;
  position: number | null;
};

export type ChildNoticeForDisplay = {
  notice_date: string | null;
  title: string;
  body: string | null;
  color: string | null;
  source?: string | null;
};

export function buildAutomaticChildNotices(ranking: ChildRankingForNotices | null | undefined, joinedOn?: string | null, today = new Date()): ChildNoticeForDisplay[] {
  if (!ranking) return [];

  const noticeDate = today.toISOString().slice(0, 10);
  const membershipDays = daysSince(joinedOn, today);
  if (membershipDays !== null && membershipDays < 30) {
    const firstDays = membershipDays < 14;
    return [systemNotice(
      noticeDate,
      firstDays ? "Primeros dias en el club" : "Periodo de adaptacion",
      firstDays
        ? "Acaba de incorporarse. Todavia es pronto para valorar su constancia; ahora lo importante es conocer la clase y disfrutar aprendiendo."
        : "Lleva poco tiempo en el club. Su constancia se valorara cuando haya acumulado mas semanas de entrenamiento.",
      "#dbeafe"
    )];
  }

  const attendance30 = Number(ranking.attendance_30d ?? 0);
  const daysWithoutAttendance = Number(ranking.days_without_attendance ?? 0);
  const position = Number(ranking.position ?? 0);
  const notices: ChildNoticeForDisplay[] = [];

  if (position === 1) {
    notices.push(systemNotice(noticeDate, "Maxima implicacion", "Esta liderando el ranking con una constancia excelente.", "#dcfce7"));
  }

  if (position > 1 && position <= 3) {
    notices.push(systemNotice(noticeDate, "Top implicacion", "Esta entre los alumnos mas constantes del grupo.", "#dbeafe"));
  }

  if (attendance30 >= 4 && position > 3) {
    notices.push(systemNotice(noticeDate, "Buena constancia", "Esta entrenando de forma regular. Buen trabajo.", "#fef9c3"));
  }

  if (attendance30 >= 1 && attendance30 < 4) {
    notices.push(systemNotice(noticeDate, "En progreso", "Va mejorando poco a poco. La constancia es la clave.", "#fef3c7"));
  }

  if (daysWithoutAttendance >= 21 && daysWithoutAttendance < 30) {
    notices.push(systemNotice(noticeDate, "Falta continuidad", "Hace varias semanas que no entrena. Es importante retomar el habito.", "#fee2e2"));
  }

  if (daysWithoutAttendance >= 30) {
    notices.push(systemNotice(noticeDate, "Sin actividad reciente", "Lleva tiempo sin entrenar. Es importante volver poco a poco.", "#fecaca"));
  }

  return notices;
}

function daysSince(value: string | null | undefined, today: Date) {
  if (!value) return null;
  const joined = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(joined.getTime())) return null;
  const current = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.max(0, Math.floor((current.getTime() - joined.getTime()) / 86400000));
}

function systemNotice(noticeDate: string, title: string, body: string, color: string): ChildNoticeForDisplay {
  return { notice_date: noticeDate, title, body, color, source: "system" };
}
