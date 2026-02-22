export interface Cohort {
  name: string;
  members: string[];
  firstSeenAt: string;
}

export interface CohortWindow {
  from: string;
  to: string;
  cohort: Cohort[];
}

export const addToCohort = (cohort: Cohort, member: string): Cohort => {
  if (cohort.members.includes(member)) return cohort;
  return { ...cohort, members: [...cohort.members, member] };
};

export const union = (left: Cohort, right: Cohort): Cohort => ({
  name: `${left.name}+${right.name}`,
  members: [...new Set([...left.members, ...right.members])],
  firstSeenAt: left.firstSeenAt < right.firstSeenAt ? left.firstSeenAt : right.firstSeenAt,
});

export const bucketBy = (events: readonly string[], chunk = 10): string[][] => {
  const out: string[][] = [];
  for (let i = 0; i < events.length; i += chunk) {
    out.push(events.slice(i, i + chunk));
  }
  return out;
};

export const overlap = (left: Cohort, right: Cohort): number => {
  const set = new Set(left.members);
  return right.members.reduce((acc, item) => acc + (set.has(item) ? 1 : 0), 0);
};
